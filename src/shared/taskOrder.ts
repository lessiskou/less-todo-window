import type { Task } from './types'

export interface TaskGroups {
  today: Task[]
  later: Task[]
  done: Task[]
}

const byCreatedAt = (a: Task, b: Task): number => a.createdAt.localeCompare(b.createdAt)

export function groupTasks(tasks: Task[]): TaskGroups {
  const open = tasks.filter((task) => task.doneAt === null)
  const today = open.filter((task) => task.list === 'today')
  const later = open.filter((task) => task.list === 'later')

  const timedToday = today
    .filter((task) => task.reminderAt !== null)
    .sort((a, b) => (a.reminderAt as string).localeCompare(b.reminderAt as string))
  const untimedToday = today.filter((task) => task.reminderAt === null).sort(byCreatedAt)

  const done = tasks
    .filter((task) => task.doneAt !== null)
    .sort((a, b) => (a.doneAt as string).localeCompare(b.doneAt as string))

  return {
    today: [...timedToday, ...untimedToday],
    later: later.sort(byCreatedAt),
    done
  }
}

export function matchesSearch(task: Task, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return task.text.toLowerCase().includes(needle)
}
