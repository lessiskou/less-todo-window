import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateState } from '../../../shared/update'

export function useUpdater() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const recordedRef = useRef<string | null>(null)

  useEffect(() => {
    void window.api.getAppVersion().then(setAppVersion)
    void window.api.getUpdateState().then(setState)
    return window.api.onUpdateChanged(setState)
  }, [])

  useEffect(() => {
    if (state?.phase !== 'available' || !state.prompt || !state.version) return
    if (recordedRef.current === state.version) return
    recordedRef.current = state.version
    void window.api.updateSettings({ promptedUpdateVersion: state.version })
  }, [state])

  const check = useCallback((): void => {
    setDismissed(false)
    void window.api.checkForUpdates(true)
  }, [])

  const download = useCallback((): void => {
    void window.api.downloadUpdate()
  }, [])

  const install = useCallback((): void => {
    void window.api.installUpdate()
  }, [])

  const dismiss = useCallback((): void => {
    setDismissed(true)
  }, [])

  return { state, appVersion, dismissed, check, download, install, dismiss }
}
