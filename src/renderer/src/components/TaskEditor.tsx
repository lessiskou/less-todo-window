import { useEffect, useRef, useState } from 'react'
import type { Task } from '../../../shared/types'
import { CloseIcon } from './icons'

interface TaskEditorProps {
  task: Task
  onSave(text: string): Promise<boolean>
  onCancel(): void
  onRequestHeight(height: number): void
}

const MAX_TEXTAREA_HEIGHT = 250

export default function TaskEditor({ task, onSave, onCancel, onRequestHeight }: TaskEditorProps) {
  const [draft, setDraft] = useState(task.text)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 打开时聚焦并把光标放到末尾
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // 文本变化时自适应高度，超过上限后内部滚动
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // +2 吸收亚像素舍入，避免内容刚好放下时出现多余滚动条
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_TEXTAREA_HEIGHT)}px`
  }, [draft])

  // 面板高度变化时上报，供 App 撑高窗口
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const report = (): void => {
      const needed = Math.ceil(panel.getBoundingClientRect().height + 24)
      onRequestHeight(Math.max(window.outerHeight, needed))
    }
    const observer = new ResizeObserver(report)
    observer.observe(panel)
    report()
    return () => observer.disconnect()
  }, [onRequestHeight])

  // Esc 关闭（窗口级监听，失焦后仍有效）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const canSave = draft.trim().length > 0 && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    const ok = await onSave(draft)
    if (!ok) setSaving(false)
  }

  return (
    <div className="edit-overlay" role="dialog" aria-modal="true" aria-label="编辑任务">
      <div className="edit-panel" ref={panelRef}>
        <div className="edit-head">
          <span>编辑任务</span>
          <button type="button" className="icon-button" aria-label="取消编辑" title="取消" onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="edit-textarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            if (event.nativeEvent.isComposing) return
            if (event.shiftKey) return
            event.preventDefault()
            void save()
          }}
        />
        <div className="edit-actions">
          <button type="button" className="small" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="small primary" disabled={!canSave} onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
