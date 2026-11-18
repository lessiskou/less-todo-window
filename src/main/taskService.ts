import { randomUUID } from 'node:crypto'
import { applyRollover } from '../shared/rollover'
import type { List, Task } from '../shared/types'
import type { JsonStore } from './store'

export interface TaskData {
  tasks: Task[]
  lastRolloverDay: string | null
}

type ChangeListener = (tasks: Task[]) => void

export class TaskService {
  private tasks: Task[] = []
  private lastRolloverDay: string | null = null
  private readonly listeners: ChangeListener[] = []

  constructor(
    private readonly store: JsonStore<TaskData>,
    private readonly now: () => Date = () => new Date()
  ) {
    const data = store.load()
    this.tasks = data.tasks ?? []
    this.lastRolloverDay = data.lastRolloverDay ?? null
  }

  getAll(): Task[] {
    return [...this.tasks]
  }

  add(input: { text: string; list?: List; reminderAt?: string | null }): Task {
    const task: Task = {
      id: randomUUID(),
      text: input.text.trim(),
      list: input.list ?? 'today',
      createdAt: this.now().toISOString(),
      doneAt: null,
      reminderAt: input.reminderAt ?? null,
      notifiedAt: null
    }
    this.tasks = [...this.tasks, task]
    this.persist()
    return task
  }

  update(id: string, patch: { text?: string; reminderAt?: string | null }): Task {
    const task = this.require(id)
    const updated: Task = {
      ...task,
      text: patch.text !== undefined ? patch.text.trim() : task.text,
      reminderAt: patch.reminderAt !== undefined ? patch.reminderAt : task.reminderAt
    }
    if (patch.reminderAt !== undefined) updated.notifiedAt = null
    this.replace(updated)
    return updated
  }

  toggle(id: string): Task {
    const task = this.require(id)
    const updated: Task = {
      ...task,
      doneAt: task.doneAt === null ? this.now().toISOString() : null
    }
    this.replace(updated)
    return updated
  }

  move(id: string, list: List): Task {
    const task = this.require(id)
    const updated: Task =
      list === 'later'
        ? { ...task, list, reminderAt: null, notifiedAt: null }
        : { ...task, list }
    this.replace(updated)
    return updated
  }

  remove(id: string): void {
    this.require(id)
    this.tasks = this.tasks.filter((task) => task.id !== id)
    this.persist()
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
    this.tasks = this.tasks.map((task) =>
      wanted.has(task.id) ? { ...task, notifiedAt: stamp } : task
    )
    this.persist()
  }

  rolloverIfNeeded(): boolean {
    const result = applyRollover(this.tasks, this.now(), this.lastRolloverDay)
    if (!result.rolled) return false

    this.tasks = result.tasks
    this.lastRolloverDay = result.day
    this.persist()
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
    this.tasks = this.tasks.map((task) => (task.id === updated.id ? updated : task))
    this.persist()
  }

  private persist(): void {
    this.store.save({ tasks: this.tasks, lastRolloverDay: this.lastRolloverDay })
    const snapshot = this.getAll()
    for (const listener of this.listeners) listener(snapshot)
  }
}
