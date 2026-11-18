import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type RendererApi } from '../shared/ipc'
import type { List, Settings, Task } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: RendererApi = {
  getTasks: () => ipcRenderer.invoke(IPC.tasksGet) as Promise<Task[]>,
  addTask: (input) => ipcRenderer.invoke(IPC.tasksAdd, input) as Promise<Task>,
  updateTask: (id, patch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch) as Promise<Task>,
  toggleTask: async (id) => {
    await ipcRenderer.invoke(IPC.tasksToggle, id)
  },
  moveTask: (id, list: List) => ipcRenderer.invoke(IPC.tasksMove, id, list) as Promise<Task>,
  removeTask: async (id) => {
    await ipcRenderer.invoke(IPC.tasksRemove, id)
  },
  snoozeTask: (id, minutes) => ipcRenderer.invoke(IPC.tasksSnooze, id, minutes) as Promise<Task>,
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<Settings>,
  hideWindow: async () => {
    await ipcRenderer.invoke(IPC.windowHide)
  },
  setContentHeight: async (height) => {
    await ipcRenderer.invoke(IPC.windowSetHeight, height)
  },
  onTasksChanged: (cb) => subscribe<Task[]>(IPC.tasksChanged, cb),
  onHighlight: (cb) => subscribe<string[]>(IPC.tasksHighlight, cb),
  onDataWarning: (cb) => subscribe<string>(IPC.dataWarning, cb)
}

contextBridge.exposeInMainWorld('api', api)
