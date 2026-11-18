import { app, BrowserWindow, powerMonitor, screen, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { registerIpc } from './ipc'
import { showReminders } from './notifications'
import { ReminderScheduler } from './scheduler'
import { SettingsService } from './settingsService'
import { JsonStore } from './store'
import { TaskService, type TaskData } from './taskService'

app.setAppUserModelId('com.lessiskou.less-todo-window')

let mainWindow: BrowserWindow | null = null

function createWindow(settings: SettingsService): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea
  const stored = settings.get().bounds

  const win = new BrowserWindow({
    width: 320,
    height: 420,
    x: stored?.x ?? workArea.x + workArea.width - 320 - 16,
    y: stored?.y ?? workArea.y + 16,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.get().alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    win.setAlwaysOnTop(settings.get().alwaysOnTop, 'floating')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function resizeWindow(win: BrowserWindow, contentHeight: number): void {
  const bounds = win.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const maxHeight = Math.floor(workArea.height * 0.45)
  const height = Math.min(Math.max(Math.round(contentHeight), 160), maxHeight)
  win.setBounds({ ...bounds, height })
}

void app.whenReady().then(() => {
  const userData = app.getPath('userData')

  const dataStore = new JsonStore<TaskData>(join(userData, 'data.json'), () => ({
    tasks: [],
    lastRolloverDay: null
  }))
  const settingsStore = new JsonStore<Settings>(join(userData, 'settings.json'), () => ({
    ...DEFAULT_SETTINGS
  }))

  const settings = new SettingsService(settingsStore)
  const service = new TaskService(dataStore)
  mainWindow = createWindow(settings)

  registerIpc(service, settings, {
    showWindow: () => {
      mainWindow?.show()
      mainWindow?.focus()
    },
    hideWindow: () => mainWindow?.hide(),
    resizeWindow: (height) => {
      if (mainWindow) resizeWindow(mainWindow, height)
    }
  })

  const highlight = (ids: string[]): void => {
    mainWindow?.webContents.send(IPC.tasksHighlight, ids)
  }

  const scheduler = new ReminderScheduler({
    getTasks: () => service.getAll(),
    now: () => new Date(),
    markNotified: (ids, at) => service.markNotified(ids, at),
    notify: (tasks) =>
      showReminders(tasks, (ids) => {
        mainWindow?.show()
        mainWindow?.focus()
        highlight(ids)
      }),
    onFired: highlight
  })

  service.onChange(() => scheduler.fireDue())
  scheduler.start()
  powerMonitor.on('resume', () => scheduler.fireDue())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(settings)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
