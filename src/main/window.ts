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

/** 至少要有这么宽的标题区域露在屏幕内，窗口才算可用。 */
const MIN_VISIBLE_WIDTH = 160
const MIN_VISIBLE_HEIGHT = 48

function overlap(bounds: Point, size: Size, area: WorkArea): { width: number; height: number } {
  return {
    width: Math.min(bounds.x + size.width, area.x + area.width) - Math.max(bounds.x, area.x),
    height: Math.min(bounds.y + size.height, area.y + area.height) - Math.max(bounds.y, area.y)
  }
}

export function clampToVisible(bounds: Point, size: Size, workAreas: WorkArea[]): Point {
  // 标题栏必须留在某个屏幕内；只露出 1px 边缘视为不可用。
  const usable = workAreas.some((area) => {
    const { width, height } = overlap(bounds, size, area)
    return width >= Math.min(MIN_VISIBLE_WIDTH, size.width) && height >= Math.min(MIN_VISIBLE_HEIGHT, size.height)
  })
  if (usable) return { x: bounds.x, y: bounds.y }

  // 选与窗口重叠最多的屏幕；都无重叠时退回第一块。
  let target = workAreas[0]
  let best = -1
  for (const area of workAreas) {
    const { width, height } = overlap(bounds, size, area)
    const score = Math.max(0, width) * Math.max(0, height)
    if (score > best) {
      best = score
      target = area
    }
  }

  return {
    x: Math.min(Math.max(bounds.x, target.x), target.x + target.width - size.width),
    y: Math.min(Math.max(bounds.y, target.y), target.y + target.height - size.height)
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
      try {
        const [x, y] = win.getPosition()
        onBoundsChange({ x, y })
      } catch (error) {
        // 位置保存失败不应让进程崩溃；下次移动会重试。
        console.error('保存窗口位置失败', error)
      }
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
