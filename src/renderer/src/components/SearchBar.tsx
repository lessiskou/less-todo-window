interface SearchBarProps {
  value: string
  onChange(value: string): void
  onClose(): void
}

export default function SearchBar({ value, onChange, onClose }: SearchBarProps) {
  return (
    <div className="search-bar">
      <span className="search-icon">🔍</span>
      <input
        autoFocus
        className="search-input"
        placeholder="搜索任务…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter') onClose()
        }}
      />
      {value ? (
        <button type="button" className="small" onClick={() => onChange('')}>
          清除
        </button>
      ) : null}
      <button type="button" className="small" aria-label="关闭搜索" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
