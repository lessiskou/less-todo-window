import { Notification } from 'electron'
import type { Task } from '../shared/types'

export function showReminders(tasks: Task[], onActivate: (ids: string[]) => void): void {
  if (tasks.length === 0) return

  const ids = tasks.map((task) => task.id)
  const notification = new Notification({
    title: '待办提醒',
    body: tasks.map((task) => task.text).join('、'),
    silent: false
  })

  notification.on('click', () => onActivate(ids))
  notification.show()
}
