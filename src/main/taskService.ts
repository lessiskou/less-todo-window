import { randomUUID } from 'node:crypto'
import { addDaysToDayKey } from '../shared/recurrence'
import { applyRollover, localDayKey } from '../shared/rollover'
import type { List, Task } from '../shared/types'
import type { JsonStore } from './store'

export interface TaskData {
  tasks: Task[]
  lastRolloverDay: string | null
}

type ChangeListener = (tasks: Task[]) => void

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<Task>
  return (
    typeof task.id === 'string' &&
    typeof task.text === 'string' &&
    (task.list === 'today' || task.list === 'later' || task.list === 'repeat') &&
    typeof task.createdAt === 'string' &&
    (task.doneAt === null || typeof task.doneAt === 'string') &&
    (task.reminderAt === null || typeof task.reminderAt === 'string') &&
    (task.notifiedAt === null || typeof task.notifiedAt === 'string') &&
    (task.repeatDays === undefined ||
      task.repeatDays === null ||
      (typeof task.repeatDays === 'number' &&
        Number.isInteger(task.repeatDays) &&
        task.repeatDays > 0)) &&
    (task.dueOn === undefined || task.dueOn === null || typeof task.dueOn === 'string')
  )
}

export function isTaskData(value: unknown): value is TaskData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<TaskData>
  return (
    Array.isArray(data.tasks) &&
    data.tasks.every(isTask) &&
    (data.lastRolloverDay === null || typeof data.lastRolloverDay === 'string')
  )
}

export class TaskService {
  private tasks: Task[] = []
  private lastRolloverDay: string | null = null
  private readonly listeners: ChangeListener[] = []

  constructor(
    private readonly store: JsonStore<TaskData>,
    private readonly now: () => Date = () => new Date()
  ) {
    const data = store.load()
    this.tasks = Array.isArray(data.tasks)
      ? data.tasks.filter(isTask).map((task) => ({
          ...task,
          repeatDays: task.repeatDays ?? null,
          dueOn: task.dueOn ?? null
        }))
      : []
    this.lastRolloverDay = typeof data.lastRolloverDay === 'string' ? data.lastRolloverDay : null
  }

  getAll(): Task[] {
    return [...this.tasks]
  }

  add(input: {
    text: string
    list?: List
    reminderAt?: string | null
    repeatDays?: number | null
  }): Task {
    const repeatDays =
      input.repeatDays != null && input.repeatDays >= 1 ? input.repeatDays : null
    const todayKey = localDayKey(this.now())
    const task: Task = {
      id: randomUUID(),
      text: input.text.trim(),
      list: repeatDays !== null ? 'repeat' : (input.list ?? 'today'),
      createdAt: this.now().toISOString(),
      doneAt: null,
      reminderAt: repeatDays !== null ? null : (input.reminderAt ?? null),
      notifiedAt: null,
      repeatDays,
      dueOn: repeatDays !== null ? addDaysToDayKey(todayKey, repeatDays) : null
    }
    this.commit([...this.tasks, task])
    return task
  }

  update(
    id: string,
    patch: { text?: string; reminderAt?: string | null; repeatDays?: number | null }
  ): Task {
    const task = this.require(id)
    const todayKey = localDayKey(this.now())
    const updated: Task = { ...task }

    if (patch.text !== undefined) updated.text = patch.text.trim()

    const currentRepeat = task.repeatDays
    const nextRepeat =
      patch.repeatDays !== undefined
        ? patch.repeatDays != null && patch.repeatDays >= 1
          ? patch.repeatDays
          : null
        : currentRepeat

    if (patch.repeatDays !== undefined && task.doneAt === null && nextRepeat !== currentRepeat) {
      if (nextRepeat === null) {
        updated.repeatDays = null
        updated.dueOn = null
        updated.list = 'today'
      } else {
        updated.repeatDays = nextRepeat
        updated.dueOn = addDaysToDayKey(todayKey, nextRepeat)
        updated.list = 'repeat'
        updated.reminderAt = null
        updated.notifiedAt = null
      }
    }

    if (updated.repeatDays == null && patch.reminderAt !== undefined) {
      updated.reminderAt = patch.reminderAt
      updated.notifiedAt = null
    }

    this.replace(updated)
    return updated
  }

  toggle(id: string): Task {
    const task = this.require(id)
    if (task.repeatDays != null) {
      const updated: Task = {
        ...task,
        dueOn: addDaysToDayKey(localDayKey(this.now()), task.repeatDays),
        doneAt: null,
        notifiedAt: null
      }
      this.replace(updated)
      return updated
    }
    const updated: Task = {
      ...task,
      doneAt: task.doneAt === null ? this.now().toISOString() : null
    }
    this.replace(updated)
    return updated
  }

  move(id: string, list: List): Task {
    const task = this.require(id)
    if (task.repeatDays != null) throw new Error('循环任务不能移动到其他列表')
    const updated: Task =
      list === 'later'
        ? { ...task, list, reminderAt: null, notifiedAt: null }
        : { ...task, list }
    this.replace(updated)
    return updated
  }

  remove(id: string): void {
    this.require(id)
    this.commit(this.tasks.filter((task) => task.id !== id))
  }

  snooze(id: string, minutes: number): Task {
    const task = this.require(id)
    const updated: Task = {
      ...task,
      reminderAt: new Date(this.now().getTime() + minutes * 60_000).toISOString(),
      notifiedAt: null
    }
    this.replace(updated)
    return updated
  }

  markNotified(ids: string[], at: Date): void {
    const wanted = new Set(ids)
    const stamp = at.toISOString()
    this.commit(this.tasks.map((task) => (wanted.has(task.id) ? { ...task, notifiedAt: stamp } : task)))
  }

  rolloverIfNeeded(): boolean {
    const result = applyRollover(this.tasks, this.now(), this.lastRolloverDay)
    if (!result.rolled) return false

    this.commit(result.tasks, result.day)
    return true
  }

  onChange(cb: ChangeListener): void {
    this.listeners.push(cb)
  }

  private require(id: string): Task {
    const task = this.tasks.find((candidate) => candidate.id === id)
    if (!task) throw new Error('任务不存在')
    return task
  }

  private replace(updated: Task): void {
    this.commit(this.tasks.map((task) => (task.id === updated.id ? updated : task)))
  }

  /**
   * 先落盘再更新内存并广播：保存失败时调用方拿到异常，内存与磁盘仍一致。
   */
  private commit(tasks: Task[], lastRolloverDay = this.lastRolloverDay): void {
    this.store.save({ tasks, lastRolloverDay })
    this.tasks = tasks
    this.lastRolloverDay = lastRolloverDay
    const snapshot = [...tasks]
    for (const listener of this.listeners) listener(snapshot)
  }
}
