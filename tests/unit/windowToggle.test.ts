import { beforeEach, describe, it, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({
  win: null as null | {
    isVisible: ReturnType<typeof vi.fn>
    isMinimized: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    hide: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
  }
}))

import type { BrowserWindow } from 'electron'
import { setToggleTarget, toggleWindow } from '../../src/main/windowToggle'

function makeWindow(visible: boolean, minimized = false) {
  return {
    isVisible: vi.fn(() => visible),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
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

  it('窗口最小化时还原并聚焦，而不是隐藏', () => {
    state.win = makeWindow(true, true)
    toggleWindow()
    expect(state.win.restore).toHaveBeenCalledOnce()
    expect(state.win.show).toHaveBeenCalledOnce()
    expect(state.win.focus).toHaveBeenCalledOnce()
    expect(state.win.hide).not.toHaveBeenCalled()
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
