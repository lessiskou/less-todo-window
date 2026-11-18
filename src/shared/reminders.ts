import type { Task } from './types'

function isPending(task: Task): boolean {
  return task.list === 'today' && task.doneAt === null && task.reminderAt !== null && task.notifiedAt === null
}

export function collectDueTasks(tasks: Task[], now: Date): Task[] {
  const cutoff = now.getTime()
  return tasks.filter(
    (task) => isPending(task) && new Date(task.reminderAt as string).getTime() <= cutoff
  )
}

export function nextReminderTime(tasks: Task[], now: Date): number | null {
  const cutoff = now.getTime()
  let earliest: number | null = null

  for (const task of tasks) {
    if (!isPending(task)) continue
    const at = new Date(task.reminderAt as string).getTime()
    if (at > cutoff && (earliest === null || at < earliest)) {
      earliest = at
    }
  }

  return earliest
}
