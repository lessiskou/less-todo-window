import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../../../shared/types'
import type { UpdateState } from '../../../shared/update'

interface SettingsMenuProps {
  appVersion: string | null
  updateState: UpdateState | null
  onCheckUpdates(): void
  onClose(): void
}

function updateStatusText(state: UpdateState | null): string | null {
  if (!state) return null
  switch (state.phase) {
    case 'not-available':
      return state.message ?? '已是最新版本'
    case 'error':
      return state.message ?? '检查更新失败'
    case 'available':
      return `发现新版本 ${state.version ?? ''}`
    case 'downloaded':
      return '更新已就绪，退出时安装'
    default:
      return null
  }
}

export default function SettingsMenu({
  appVersion,
  updateState,
  onCheckUpdates,
  onClose
}: SettingsMenuProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const opacityTimer = useRef<number | null>(null)

  useEffect(() => {
    window.api
      .getSettings()
      .then(setSettings)
      .catch(() => setError('读取设置失败'))

    return () => {
      if (opacityTimer.current !== null) window.clearTimeout(opacityTimer.current)
    }
  }, [])

  const update = async (patch: Partial<Settings>): Promise<void> => {
    try {
      setSettings(await window.api.updateSettings(patch))
      setError(null)
    } catch {
      setError('设置保存失败')
    }
  }

  const changeOpacity = (value: number): void => {
    setSettings((previous) => (previous ? { ...previous, opacity: value } : previous))
    if (opacityTimer.current !== null) window.clearTimeout(opacityTimer.current)
    opacityTimer.current = window.setTimeout(() => {
      void update({ opacity: value })
    }, 200)
  }

  return (
    <div className="settings-menu">
      {settings ? (
        <>
          <label className="setting-row">
            <span>透明度</span>
            <input
              type="range"
              min={0.6}
              max={1}
              step={0.05}
              value={settings.opacity}
              onChange={(event) => changeOpacity(Number(event.target.value))}
            />
            <span className="setting-value">{Math.round(settings.opacity * 100)}%</span>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.alwaysOnTop}
              onChange={(event) => void update({ alwaysOnTop: event.target.checked })}
            />
            <span>始终置顶</span>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.autostart}
              onChange={(event) => void update({ autostart: event.target.checked })}
            />
            <span>开机自启</span>
          </label>

          <div className="setting-row">
            <span>当前版本</span>
            <span className="setting-value">{appVersion ?? '…'}</span>
          </div>

          <div className="setting-row">
            <button
              type="button"
              className="small"
              disabled={updateState?.phase === 'checking'}
              onClick={onCheckUpdates}
            >
              {updateState?.phase === 'checking' ? '检查中…' : '检查更新'}
            </button>
            {updateStatusText(updateState) ? (
              <span className="setting-value">{updateStatusText(updateState)}</span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="setting-row">读取设置…</div>
      )}

      {error ? <div className="setting-error">{error}</div> : null}

      <button type="button" className="small" onClick={onClose}>
        收起
      </button>
    </div>
  )
}
