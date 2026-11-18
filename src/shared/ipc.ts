import type { List, Settings, Task } from './types'

export const IPC = {
  tasksGet: 'tasks:get',
  tasksAdd: 'tasks:add',
  tasksUpdate: 'tasks:update',
  tasksToggle: 'tasks:toggle',
  tasksMove: 'tasks:move',
  tasksRemove: 'tasks:remove',
  tasksSnooze: 'tasks:snooze',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  windowHide: 'window:hide',
  windowSetHeight: 'window:set-height',
  tasksChanged: 'tasks:changed',
  tasksHighlight: 'tasks:highlight',
  dataWarning: 'data:warning'
} as const

export interface RendererApi {
  getTasks(): Promise<Task[]>
  addTask(input: { text: string; list?: List; reminderAt?: string | null }): Promise<Task>
  updateTask(id: string, patch: { text?: string; reminderAt?: string | null }): Promise<Task>
  toggleTask(id: string): Promise<void>
  moveTask(id: string, list: List): Promise<Task>
  removeTask(id: string): Promise<void>
  snoozeTask(id: string, minutes: number): Promise<Task>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  hideWindow(): Promise<void>
  setContentHeight(height: number): Promise<void>
  onTasksChanged(cb: (tasks: Task[]) => void): () => void
  onHighlight(cb: (ids: string[]) => void): () => void
  onDataWarning(cb: (message: string) => void): () => void
}

declare global {
  interface Window {
    api: RendererApi
  }
}
