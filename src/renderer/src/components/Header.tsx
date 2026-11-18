interface HeaderProps {
  count: number
  onClose(): void
  onSearch?(): void
  onSettings?(): void
}

export default function Header({ count, onClose, onSearch, onSettings }: HeaderProps) {
  return (
    <header className="header">
      <span className="title">今天{count > 0 ? ` · ${count} 项` : ''}</span>
      {onSearch ? (
        <button type="button" className="icon-button" aria-label="搜索" onClick={onSearch}>
          🔍
        </button>
      ) : null}
      {onSettings ? (
        <button type="button" className="icon-button" aria-label="设置" onClick={onSettings}>
          ⚙
        </button>
      ) : null}
      <button type="button" className="icon-button" aria-label="隐藏窗口" onClick={onClose}>
        ×
      </button>
    </header>
  )
}
