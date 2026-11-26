import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { createHandlers } from '../../src/main/ipc'
import { IPC } from '../../src/shared/ipc'
import type { TaskService } from '../../src/main/taskService'
import type { SettingsService } from '../../src/main/settingsService'
import { DEFAULT_SETTINGS, type Settings, type Task } from '../../src/shared/types'

const baseTask: Task = {
  id: 't1',
  text: '交周报',
  list: 'today',
  createdAt: '2026-11-18T01:00:00.000Z',
  doneAt: null,
  reminderAt: null,
  notifiedAt: null,
  repeatDays: null,
  dueOn: null
}

const setup = () => {
  const calls: { movedTo?: [string, string] } = {}
  const service = {
    getAll: () => [baseTask],
    add: (input: { text: string; repeatDays?: number | null }) => ({ ...baseTask, ...input }),
    update: (id: string, patch: Partial<Task>) => ({ ...baseTask, ...patch, id }),
    toggle: (id: string) => ({ ...baseTask, id }),
    move: (id: string, list: 'today' | 'later') => {
      calls.movedTo = [id, list]
      return { ...baseTask, id, list, reminderAt: null as string | null }
    },
    remove: () => undefined,
    snooze: (id: string, minutes: number) => ({ ...baseTask, id, reminderAt: String(minutes) }),
    markNotified: () => undefined,
    rolloverIfNeeded: () => false,
    onChange: () => undefined
  } as unknown as TaskService

  let state: Settings = { ...DEFAULT_SETTINGS }
  const settings = {
    get: () => state,
    update: (patch: Partial<Settings>) => {
      state = { ...state, ...patch }
      return state
    },
    onChange: () => undefined
  } as unknown as SettingsService

  const updater = {
    getState: () => ({ phase: 'idle' as const }),
    check: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    install: vi.fn()
  }

  return { handlers: createHandlers(service, settings, updater as never), calls, updater }
}

describe('createHandlers', () => {
  it('tasksGet 返回全部任务', () => {
    const { handlers } = setup()
    expect(handlers[IPC.tasksGet]()).toHaveLength(1)
  })
  it('tasksAdd 返回新任务', () => {
    const { handlers } = setup()
    expect(handlers[IPC.tasksAdd]({ text: '买牛奶' }).text).toBe('买牛奶')
  })
  it('tasksMove 转发到 service.move', () => {
    const { handlers, calls } = setup()
    handlers[IPC.tasksMove]('t1', 'later')
    expect(calls.movedTo).toEqual(['t1', 'later'])
  })
  it('tasksAdd / tasksUpdate 透传 repeatDays', () => {
    const { handlers } = setup()
    expect(handlers[IPC.tasksAdd]({ text: '洗床单', repeatDays: 15 }).text).toBe('洗床单')
    const updated = handlers[IPC.tasksUpdate]('t1', { repeatDays: 30 })
    expect(updated.repeatDays).toBe(30)
  })
  it('settingsUpdate 合并设置', () => {
    const { handlers } = setup()
    expect(handlers[IPC.settingsUpdate]({ opacity: 0.8 }).opacity).toBe(0.8)
  })
  it('updateCheck 转发 manual 并返回状态', () => {
    const { handlers, updater } = setup()
    expect(handlers[IPC.updateGetState]()).toEqual({ phase: 'idle' })
    handlers[IPC.updateCheck](true)
    expect(updater.check).toHaveBeenCalledWith(true)
  })
})
