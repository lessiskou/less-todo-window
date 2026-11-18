import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { SettingsService } from './settingsService'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export const WINDOW_WIDTH = 320
export const WINDOW_HEIGHT = 420

export function clampToVisible(bounds: Point, size: Size, workAreas: WorkArea[]): Point {
  const visible = workAreas.some(
    (area) =>
      bounds.x + size.width > area.x &&
      bounds.x < area.x + area.width &&
      bounds.y + size.height > area.y &&
      bounds.y < area.y + area.height
  )
  if (visible) return { x: bounds.x, y: bounds.y }

  const area = workAreas[0]
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - size.height)
  }
}

export function createMainWindow(
  settings: SettingsService,
  onBoundsChange: (point: Point) => void
): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea
  const stored = settings.get().bounds
  const size: Size = { width: WINDOW_WIDTH, height: WINDOW_HEIGHT }
  const start = clampToVisible(
    stored ?? {
      x: workArea.x + workArea.width - size.width - 16,
      y: workArea.y + 16
    },
    size,
    screen.getAllDisplays().map((display) => display.workArea)
  )

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: start.x,
    y: start.y,
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

  win.setOpacity(settings.get().opacity)
  win.setAlwaysOnTop(settings.get().alwaysOnTop, 'floating')

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  let moveTimer: NodeJS.Timeout | null = null
  win.on('move', () => {
    if (moveTimer !== null) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      const [x, y] = win.getPosition()
      onBoundsChange({ x, y })
    }, 500)
  })

  const keepVisible = (): void => {
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    const point = clampToVisible(
      { x, y },
      { width, height },
      screen.getAllDisplays().map((display) => display.workArea)
    )
    if (point.x !== x || point.y !== y) win.setPosition(point.x, point.y)
  }

  screen.on('display-metrics-changed', keepVisible)
  screen.on('display-removed', keepVisible)

  win.on('close', (event) => {
    const flagApp = app as typeof app & { isQuitting?: boolean }
    if (!flagApp.isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
