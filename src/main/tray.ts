import { app, Menu, nativeImage, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface TrayDeps {
  toggleWindow(): void
  quit(): void
  getAutostart(): boolean
  setAutostart(value: boolean): void
}

export function createTray(deps: TrayDeps): Tray {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')

  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()

  const tray = new Tray(icon)
  tray.setToolTip('Less Todo')

  const refresh = (): void => {
    const menu = Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: deps.toggleWindow },
      { type: 'separator' },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: deps.getAutostart(),
        click: (item) => {
          deps.setAutostart(item.checked)
          refresh()
        }
      },
      { type: 'separator' },
      { label: '退出', click: deps.quit }
    ])
    tray.setContextMenu(menu)
  }

  refresh()
  tray.on('click', deps.toggleWindow)

  return tray
}
