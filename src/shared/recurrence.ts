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
  const [, month, day] = dayKey.split('-')
  return `${Number(month)}/${Number(day)}`
}
