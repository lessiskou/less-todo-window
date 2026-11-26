import { localDayKey } from './rollover'
import type { Task } from './types'

export function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  return localDayKey(new Date(year, month - 1, day + days))
}

export function isRepeatDue(task: Task, todayKey: string): boolean {
  return task.repeatDays != null && task.dueOn != null && task.dueOn <= todayKey
}

export function formatDueLabel(dayKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) return '—'
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return '—'
  return `${month}/${day}`
}
