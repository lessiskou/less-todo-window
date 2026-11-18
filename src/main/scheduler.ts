import { collectDueTasks, nextReminderTime } from '../shared/reminders'
import type { Task } from '../shared/types'

export interface SchedulerDeps {
  getTasks(): Task[]
  now(): Date
  markNotified(ids: string[], at: Date): void
  notify(tasks: Task[]): void
  onFired(ids: string[]): void
}

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly deps: SchedulerDeps) {}

  start(): void {
    this.fireDue()
  }

  fireDue(): void {
    const now = this.deps.now()
    const due = collectDueTasks(this.deps.getTasks(), now)

    if (due.length > 0) {
      const ids = due.map((task) => task.id)
      this.deps.markNotified(ids, now)
      this.deps.notify(due)
      this.deps.onFired(ids)
    }

    this.reschedule()
  }

  reschedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const next = nextReminderTime(this.deps.getTasks(), this.deps.now())
    if (next === null) return

    const delay = Math.max(0, next - this.deps.now().getTime())
    this.timer = setTimeout(() => this.fireDue(), delay)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
