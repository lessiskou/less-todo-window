import type { UpdateState } from '../shared/update'

export interface UpdateAdapter {
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  quitAndInstall(): void
  onAvailable(cb: (version: string) => void): void
  onNotAvailable(cb: () => void): void
  onProgress(cb: (percent: number) => void): void
  onDownloaded(cb: (version: string) => void): void
  onError(cb: (message: string) => void): void
}

export interface UpdaterDeps {
  adapter: UpdateAdapter
  isPackaged: boolean
  getPromptedVersion(): string | null
  broadcast(state: UpdateState): void
}

export interface Updater {
  getState(): UpdateState
  check(manual: boolean): Promise<void>
  download(): Promise<void>
  install(): void
}

export function createUpdater({
  adapter,
  isPackaged,
  getPromptedVersion,
  broadcast
}: UpdaterDeps): Updater {
  let state: UpdateState = { phase: 'idle' }
  let lastCheckManual = false
  const set = (next: UpdateState): void => {
    state = next
    broadcast(next)
  }

  adapter.onAvailable((version) => {
    set({
      phase: 'available',
      version,
      prompt: lastCheckManual || version !== getPromptedVersion()
    })
  })
  adapter.onNotAvailable(() => set({ phase: 'not-available' }))
  adapter.onProgress((percent) => {
    if (state.phase !== 'downloading') return
    set({ phase: 'downloading', version: state.version, percent: Math.round(percent) })
  })
  adapter.onDownloaded((version) => set({ phase: 'downloaded', version }))
  adapter.onError((message) => {
    if (lastCheckManual) set({ phase: 'error', message, manual: true })
    else set({ phase: 'idle' })
  })

  return {
    getState: () => state,
    async check(manual) {
      lastCheckManual = manual
      if (!isPackaged) {
        set({ phase: 'not-available', message: manual ? '开发模式不检查更新' : undefined })
        return
      }
      set({ phase: 'checking' })
      try {
        await adapter.checkForUpdates()
      } catch (error) {
        const message = error instanceof Error ? error.message : '检查更新失败'
        if (manual) set({ phase: 'error', message, manual: true })
        else set({ phase: 'idle' })
      }
    },
    async download() {
      if (state.phase !== 'available') return
      const version = state.version
      set({ phase: 'downloading', version, percent: 0 })
      try {
        await adapter.downloadUpdate()
      } catch (error) {
        set({
          phase: 'error',
          message: error instanceof Error ? error.message : '下载更新失败',
          manual: true
        })
      }
    },
    install() {
      adapter.quitAndInstall()
    }
  }
}
