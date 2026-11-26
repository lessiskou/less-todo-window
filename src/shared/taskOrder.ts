import { isRepeatDue } from './recurrence'
import { localDayKey } from './rollover'
import type { Task } from './types'

export interface TaskGroups {
  today: Task[]
  repeat: Task[]
  later: Task[]
  done: Task[]
}

const byCreatedAt = (a: Task, b: Task): number => a.createdAt.localeCompare(b.createdAt)

export function groupTasks(
  tasks: Task[],
  todayKey: string = localDayKey(new Date())
): TaskGroups {
  const open = tasks.filter((task) => task.doneAt === null)
  const today = open.filter((task) => task.list === 'today')
  const later = open.filter((task) => task.list === 'later')
  const openRepeat = open.filter((task) => task.list === 'repeat')

  const byDue = (a: Task, b: Task): number =>
    (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || byCreatedAt(a, b)
  const repeat = [...openRepeat].sort(byDue)
  const dueRepeat = repeat.filter((task) => isRepeatDue(task, todayKey))

  const timedToday = today
    .filter((task) => task.reminderAt !== null)
    .sort((a, b) => (a.reminderAt as string).localeCompare(b.reminderAt as string))
  const untimedToday = today.filter((task) => task.reminderAt === null).sort(byCreatedAt)

  const done = tasks
    .filter((task) => task.doneAt !== null)
    .sort((a, b) => (a.doneAt as string).localeCompare(b.doneAt as string))

  return {
    today: [...dueRepeat, ...timedToday, ...untimedToday],
    repeat,
    later: later.sort(byCreatedAt),
    done
  }
}

export function matchesSearch(task: Task, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return task.text.toLowerCase().includes(needle)
}
