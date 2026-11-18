import { useRef, useState } from 'react'

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
        <input
          ref={inputRef}
          className="quick-input"
          placeholder="输入任务，回车添加…"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </div>
  )
}
