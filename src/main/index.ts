import { app, BrowserWindow, powerMonitor, screen } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { registerIpc } from './ipc'
import { showReminders } from './notifications'
import { ReminderScheduler } from './scheduler'
import { SettingsService } from './settingsService'
import { JsonStore } from './store'
import { TaskService, type TaskData } from './taskService'
import { createTray } from './tray'
import { createMainWindow } from './window'

app.setAppUserModelId('com.lessiskou.less-todo-window')

const flagApp = app as typeof app & { isQuitting?: boolean }

let mainWindow: BrowserWindow | null = null

function resizeWindow(win: BrowserWindow, contentHeight: number): void {
  const bounds = win.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const maxHeight = Math.floor(workArea.height * 0.45)
  const height = Math.min(Math.max(Math.round(contentHeight), 160), maxHeight)
  win.setBounds({ ...bounds, height })
}

function setup(): void {
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
  service.rolloverIfNeeded()
  const dataWarning = dataStore.loadWarning()

  const applySettings = (next: Settings): void => {
    if (mainWindow) {
      mainWindow.setOpacity(next.opacity)
      mainWindow.setAlwaysOnTop(next.alwaysOnTop, 'floating')
    }
    app.setLoginItemSettings({ openAtLogin: next.autostart })
  }

  applySettings(settings.get())
  settings.onChange(applySettings)

  mainWindow = createMainWindow(settings, (point) => {
    settings.update({ bounds: point })
  })

  if (dataWarning) {
    const warningText = dataWarning
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.webContents.send(IPC.dataWarning, warningText)
      }, 300)
    })
  }

  createTray({
    toggleWindow: () => {
      if (!mainWindow) return
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    quit: () => app.quit(),
    getAutostart: () => settings.get().autostart,
    setAutostart: (value) => {
      settings.update({ autostart: value })
    }
  })

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

  setInterval(() => {
    if (service.rolloverIfNeeded()) scheduler.reschedule()
  }, 60_000)

  powerMonitor.on('resume', () => {
    service.rolloverIfNeeded()
    scheduler.fireDue()
    scheduler.reschedule()
  })
}

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(setup)
}

app.on('before-quit', () => {
  flagApp.isQuitting = true
})

app.on('window-all-closed', () => {
  // 常驻托盘：关闭窗口不退出应用。
})
