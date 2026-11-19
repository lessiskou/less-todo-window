import { beforeEach, describe, it, expect, vi } from 'vitest'

const shortcut = vi.hoisted(() => ({
  register: vi.fn<(accelerator: string, cb: () => void) => boolean>(() => true),
  unregisterAll: vi.fn()
}))

vi.mock('electron', () => ({
  globalShortcut: shortcut
}))

import {
  TOGGLE_SHORTCUT,
  registerToggleShortcut,
  unregisterToggleShortcut
} from '../../src/main/shortcut'

beforeEach(() => {
  shortcut.register.mockReset().mockReturnValue(true)
  shortcut.unregisterAll.mockReset()
  vi.restoreAllMocks()
})

describe('registerToggleShortcut', () => {
  it('用固定键位注册，并绑定传入的切换回调', () => {
    const toggle = vi.fn()
    expect(registerToggleShortcut(toggle)).toBe(true)
    expect(shortcut.register).toHaveBeenCalledWith(TOGGLE_SHORTCUT, toggle)
    expect(TOGGLE_SHORTCUT).toBe('CommandOrControl+Shift+Space')
  })

  it('注册失败时给出警告但不抛出', () => {
    shortcut.register.mockReturnValue(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(registerToggleShortcut(vi.fn())).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('unregisterToggleShortcut', () => {
  it('退出时注销全部快捷键', () => {
    unregisterToggleShortcut()
    expect(shortcut.unregisterAll).toHaveBeenCalledOnce()
  })
})