import { ChevronIcon, CloseIcon, SearchIcon } from './icons'

interface SearchBarProps {
  value: string
  onChange(value: string): void
  onClose(): void
}

export default function SearchBar({ value, onChange, onClose }: SearchBarProps) {
  return (
    <div className="search-bar">
      <div className="search-field">
        <span className="search-icon" aria-hidden="true">
          <SearchIcon />
        </span>
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
          <button type="button" className="action" aria-label="清除搜索" title="清除" onClick={() => onChange('')}>
            <CloseIcon />
          </button>
        ) : null}
      </div>
      <button type="button" className="action" aria-label="关闭搜索" title="收起搜索" onClick={onClose}>
        <ChevronIcon className="chevron-up" />
      </button>
    </div>
  )
}
