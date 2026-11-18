import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import type { JsonStore } from './store'

type SettingsListener = (settings: Settings) => void

export class SettingsService {
  private settings: Settings
  private readonly listeners: SettingsListener[] = []

  constructor(private readonly store: JsonStore<Settings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...store.load() }
  }

  get(): Settings {
    return { ...this.settings }
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch }
    this.store.save(this.settings)
    const snapshot = this.get()
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }

  onChange(cb: SettingsListener): void {
    this.listeners.push(cb)
  }
}
