import type { UpdateState } from '../../../shared/update'
import { CloseIcon } from './icons'

interface UpdateBannerProps {
  state: UpdateState
  onUpdate(): void
  onInstall(): void
  onSkip(): void
  onDismissError(): void
}

export default function UpdateBanner({
  state,
  onUpdate,
  onInstall,
  onSkip,
  onDismissError
}: UpdateBannerProps) {
  if (state.phase === 'available') {
    return (
      <div className="banner update">
        <span>发现新版本 {state.version}</span>
        <span className="banner-actions">
          <button type="button" className="small primary" onClick={onUpdate}>
            更新
          </button>
          <button type="button" className="small" onClick={onSkip}>
            跳过此版本
          </button>
        </span>
      </div>
    )
  }

  if (state.phase === 'downloading') {
    return (
      <div className="banner update">
        <span>正在下载更新 {state.percent ?? 0}%</span>
      </div>
    )
  }

  if (state.phase === 'downloaded') {
    return (
      <div className="banner update">
        <span>更新已就绪，退出时自动安装</span>
        <button type="button" className="small primary" onClick={onInstall}>
          立即重启安装
        </button>
      </div>
    )
  }

  if (state.phase === 'error' && state.manual) {
    return (
      <div className="banner warning">
        <span>{state.message ?? '检查更新失败'}</span>
        <button
          type="button"
          className="banner-close"
          aria-label="关闭提示"
          title="关闭提示"
          onClick={onDismissError}
        >
          <CloseIcon size={12} />
        </button>
      </div>
    )
  }

  return null
}
