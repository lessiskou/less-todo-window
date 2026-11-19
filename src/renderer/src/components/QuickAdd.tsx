import { useRef, useState } from 'react'
import { PlusIcon } from './icons'

interface QuickAddProps {
  hint: string | null
  onAdd(text: string): Promise<void>
}

export default function QuickAdd({ hint, onAdd }: QuickAddProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async (): Promise<void> => {
    const text = value
    if (text.trim().length === 0) return
    setValue('')
    await onAdd(text)
    inputRef.current?.focus()
  }

  return (
    <div className="quick-add">
      {hint ? <div className="hint">{hint}</div> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="quick-field">
          <span className="add-plus" aria-hidden="true">
            <PlusIcon size={10} />
          </span>
          <input
            ref={inputRef}
            className="quick-input"
            placeholder="写点什么…"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <span className="kbd" aria-hidden="true">
            ↵
          </span>
        </div>
      </form>
    </div>
  )
}
