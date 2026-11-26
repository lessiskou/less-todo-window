import { describe, it, expect } from 'vitest'
import { SettingsService } from '../../src/main/settingsService'
import type { JsonStore } from '../../src/main/store'
import type { Settings } from '../../src/shared/types'

const store = (data: Partial<Settings> = {}): JsonStore<Settings> =>
  ({
    load: () => data as Settings,
    save: () => undefined
  }) as unknown as JsonStore<Settings>

describe('SettingsService', () => {
  it('默认 promptedUpdateVersion 为 null', () => {
    expect(new SettingsService(store()).get().promptedUpdateVersion).toBeNull()
  })
  it('保存并返回 promptedUpdateVersion', () => {
    const svc = new SettingsService(store())
    expect(svc.update({ promptedUpdateVersion: '1.4.0' }).promptedUpdateVersion).toBe('1.4.0')
  })
})
