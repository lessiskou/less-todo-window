import { Notification } from 'electron'
import type { Task } from '../shared/types'

/**
 * 保持 Notification 对象的强引用：Windows 上实例被回收后点击事件不会送达。
 */
const activeNotifications = new Set<Notification>()

export function activeNotificationCount(): number {
  return activeNotifications.size
}

export function showReminders(tasks: Task[], onActivate: (ids: string[]) => void): void {
  if (tasks.length === 0) return

  const ids = tasks.map((task) => task.id)
  const notification = new Notification({
    title: '待办提醒',
    body: tasks.map((task) => task.text).join('、'),
    silent: false
  })

  activeNotifications.add(notification)
  const release = (): void => {
    activeNotifications.delete(notification)
  }

  notification.on('click', () => {
    release()
    onActivate(ids)
  })
  notification.on('close', release)
  notification.on('failed', release)

  notification.show()
}
