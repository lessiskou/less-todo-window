import { describe, it, expect, vi } from 'vitest'
import { createUpdater, type UpdateAdapter } from '../../src/main/updater'
import type { UpdateState } from '../../src/shared/update'

function fakeAdapter() {
  const handlers: Record<string, (arg: any) => void> = {}
  const adapter: UpdateAdapter = {
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
    onAvailable: (cb) => (handlers.available = cb as (v: string) => void),
    onNotAvailable: (cb) => (handlers.notAvailable = cb),
    onProgress: (cb) => (handlers.progress = cb as (p: number) => void),
    onDownloaded: (cb) => (handlers.downloaded = cb as (v: string) => void),
    onError: (cb) => (handlers.error = cb as (m: string) => void)
  }
  return { adapter, handlers }
}

const make = (prompted: string | null = null, isPackaged = true) => {
  const { adapter, handlers } = fakeAdapter()
  const states: UpdateState[] = []
  const updater = createUpdater({
    adapter,
    isPackaged,
    getPromptedVersion: () => prompted,
    broadcast: (state) => states.push(state)
  })
  return { updater, adapter, handlers, states }
}

describe('createUpdater', () => {
  it('开发模式不检查，手动检查给出提示', async () => {
    const { updater, adapter, states } = make(null, false)
    await updater.check(true)
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(states.at(-1)).toMatchObject({ phase: 'not-available', message: '开发模式不检查更新' })
  })
  it('自动检查发现新版本主动提示', async () => {
    const { updater, handlers, states } = make(null)
    await updater.check(false)
    handlers.available('1.4.0')
    expect(states.at(-1)).toEqual({ phase: 'available', version: '1.4.0', prompt: true })
  })
  it('同一版本自动检查不再提示，手动检查仍提示', async () => {
    const auto = make('1.4.0')
    await auto.updater.check(false)
    auto.handlers.available('1.4.0')
    expect(auto.states.at(-1)).toMatchObject({ phase: 'available', prompt: false })

    const manual = make('1.4.0')
    await manual.updater.check(true)
    manual.handlers.available('1.4.0')
    expect(manual.states.at(-1)).toMatchObject({ phase: 'available', prompt: true })
  })
  it('下载进度与下载完成状态', async () => {
    const { updater, handlers, states } = make(null)
    await updater.check(false)
    handlers.available('1.4.0')
    await updater.download()
    handlers.progress(42.6)
    expect(states.at(-1)).toEqual({ phase: 'downloading', version: '1.4.0', percent: 43 })
    handlers.downloaded('1.4.0')
    expect(states.at(-1)).toEqual({ phase: 'downloaded', version: '1.4.0' })
  })
  it('自动检查失败静默，手动检查失败报错', async () => {
    const auto = make(null)
    await auto.updater.check(false)
    auto.handlers.error('offline')
    expect(auto.states.at(-1)).toEqual({ phase: 'idle' })

    const manual = make(null)
    await manual.updater.check(true)
    manual.handlers.error('offline')
    expect(manual.states.at(-1)).toEqual({ phase: 'error', message: 'offline', manual: true })
  })
})
