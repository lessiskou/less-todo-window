import { describe, it, expect, vi } from 'vitest'

const menu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown[]) => template)
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  Menu: { buildFromTemplate: menu.buildFromTemplate },
  nativeImage: { createFromPath: () => ({}), createEmpty: () => ({}) },
  Tray: class {
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    on = vi.fn()
  }
}))

vi.mock('node:fs', () => ({ existsSync: () => false }))

import { createTray } from '../../src/main/tray'

describe('createTray', () => {
  it('显示/隐藏菜单项标注快捷键', () => {
    const toggleWindow = vi.fn()
    createTray({
      toggleWindow,
      shortcutLabel: 'Ctrl+Shift+Space',
      quit: vi.fn(),
      getAutostart: () => false,
      setAutostart: vi.fn()
    })

    const template = menu.buildFromTemplate.mock.calls[0][0] as Array<{
      label?: string
      click?: () => void
    }>
    const toggleItem = template.find((item) => item.label?.includes('显示 / 隐藏'))
    expect(toggleItem?.label).toBe('显示 / 隐藏 Ctrl+Shift+Space')

    toggleItem?.click?.()
    expect(toggleWindow).toHaveBeenCalledOnce()
  })
})