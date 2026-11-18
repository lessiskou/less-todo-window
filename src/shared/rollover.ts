import type { Task } from './types'

export interface RolloverResult {
  tasks: Task[]
  day: string
  rolled: boolean
}

export function localDayKey(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function applyRollover(tasks: Task[], now: Date, lastDay: string | null): RolloverResult {
  const day = localDayKey(now)
  if (lastDay === day) {
    return { tasks, day, rolled: false }
  }

  // 时钟回拨（或时区调整）到更早的日子：不当作跨天，避免重复通知或误删任务。
  if (lastDay !== null && day < lastDay) {
    return { tasks, day: lastDay, rolled: false }
  }

  const next = tasks
    .filter((task) => task.doneAt === null)
    .map((task) => {
      if (task.list === 'later') {
        return { ...task, reminderAt: null, notifiedAt: null }
      }
      const reminderIsPast =
        task.reminderAt !== null && new Date(task.reminderAt).getTime() <= now.getTime()
      if (reminderIsPast) {
        return { ...task, reminderAt: null, notifiedAt: null }
      }
      return { ...task, notifiedAt: null }
    })

  return { tasks: next, day, rolled: true }
}
