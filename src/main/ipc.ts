import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { List, Settings } from '../shared/types'
import type { SettingsService } from './settingsService'
import type { TaskService } from './taskService'

export interface IpcDeps {
  showWindow(): void
  hideWindow(): void
  resizeWindow(height: number): void
}

export function createHandlers(service: TaskService, settings: SettingsService) {
  return {
    [IPC.tasksGet]: () => service.getAll(),
    [IPC.tasksAdd]: (input: {
      text: string
      list?: List
      reminderAt?: string | null
      repeatDays?: number | null
    }) => service.add(input),
    [IPC.tasksUpdate]: (
      id: string,
      patch: { text?: string; reminderAt?: string | null; repeatDays?: number | null }
    ) => service.update(id, patch),
    [IPC.tasksToggle]: (id: string) => service.toggle(id),
    [IPC.tasksMove]: (id: string, list: List) => service.move(id, list),
    [IPC.tasksRemove]: (id: string) => {
      service.remove(id)
    },
    [IPC.tasksSnooze]: (id: string, minutes: number) => service.snooze(id, minutes),
    [IPC.settingsGet]: () => settings.get(),
    [IPC.settingsUpdate]: (patch: Partial<Settings>) => settings.update(patch)
  }
}

export function registerIpc(
  service: TaskService,
  settings: SettingsService,
  deps: IpcDeps
): void {
  const handlers = createHandlers(service, settings)

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (handler as (...callArgs: unknown[]) => unknown)(...args)
    )
  }

  ipcMain.handle(IPC.windowHide, () => deps.hideWindow())
  ipcMain.handle(IPC.windowSetHeight, (_event, height: number) => deps.resizeWindow(height))

  service.onChange((tasks) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.tasksChanged, tasks)
    }
  })
}
