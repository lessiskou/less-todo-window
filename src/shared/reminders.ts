import { localDayKey } from './rollover'
import type { Task } from './types'

function isPending(task: Task): boolean {
  return task.list === 'today' && task.doneAt === null && task.reminderAt !== null && task.notifiedAt === null
}

/** 提醒只属于当天：跨午夜残留的过期提醒不补发，即使结转尚未运行。 */
function isToday(task: Task, now: Date): boolean {
  return localDayKey(new Date(task.reminderAt as string)) === localDayKey(now)
}

export function collectDueTasks(tasks: Task[], now: Date): Task[] {
  const cutoff = now.getTime()
  return tasks.filter(
    (task) =>
      isPending(task) && isToday(task, now) && new Date(task.reminderAt as string).getTime() <= cutoff
  )
}

export function nextReminderTime(tasks: Task[], now: Date): number | null {
  const cutoff = now.getTime()
  let earliest: number | null = null

  for (const task of tasks) {
    if (!isPending(task) || !isToday(task, now)) continue
    const at = new Date(task.reminderAt as string).getTime()
    if (at > cutoff && (earliest === null || at < earliest)) {
      earliest = at
    }
  }

  return earliest
}
