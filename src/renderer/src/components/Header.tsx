import { CloseIcon, SearchIcon, SettingsIcon } from './icons'

interface HeaderProps {
  count: number
  onClose(): void
  onSearch?(): void
  onSettings?(): void
}

export default function Header({ count, onClose, onSearch, onSettings }: HeaderProps) {
  return (
    <header className="header">
      <span className="title">今天{count > 0 ? <span className="count">{count}</span> : null}</span>
      {onSearch ? (
        <button type="button" className="icon-button" aria-label="搜索" title="搜索" onClick={onSearch}>
          <SearchIcon />
        </button>
      ) : null}
      {onSettings ? (
        <button type="button" className="icon-button" aria-label="设置" title="设置" onClick={onSettings}>
          <SettingsIcon />
        </button>
      ) : null}
      <button type="button" className="icon-button" aria-label="隐藏窗口" title="隐藏窗口" onClick={onClose}>
        <CloseIcon />
      </button>
    </header>
  )
}
