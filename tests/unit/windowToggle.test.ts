import { beforeEach, describe, it, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({
  win: null as null | {
    isVisible: ReturnType<typeof vi.fn>
    hide: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
  }
}))

vi.mock('electron', () => ({
  app: { on: vi.fn(), requestSingleInstanceLock: () => false, quit: vi.fn() },
  BrowserWindow: class {},
  globalShortcut: { register: vi.fn(() => true), unregisterAll: vi.fn() },
  powerMonitor: { on: vi.fn() },
  screen: {},
  shell: {}
}))

import type { BrowserWindow } from 'electron'
import { setToggleTarget, toggleWindow } from '../../src/main/windowToggle'

function makeWindow(visible: boolean) {
  return {
    isVisible: vi.fn(() => visible),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn()
  }
}

beforeEach(() => {
  state.win = null
  setToggleTarget(() => state.win as unknown as BrowserWindow | null)
})

describe('toggleWindow', () => {
  it('窗口可见时隐藏', () => {
    state.win = makeWindow(true)
    toggleWindow()
    expect(state.win.hide).toHaveBeenCalledOnce()
    expect(state.win.show).not.toHaveBeenCalled()
  })

  it('窗口隐藏时显示并聚焦', () => {
    state.win = makeWindow(false)
    toggleWindow()
    expect(state.win.show).toHaveBeenCalledOnce()
    expect(state.win.focus).toHaveBeenCalledOnce()
    expect(state.win.hide).not.toHaveBeenCalled()
  })

  it('窗口尚未创建时什么也不做', () => {
    expect(() => toggleWindow()).not.toThrow()
  })
})
