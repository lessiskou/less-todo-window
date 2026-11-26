import { useEffect, useRef, useState } from 'react'
import type { Task } from '../../../shared/types'
import { CloseIcon } from './icons'

interface TaskEditorProps {
  task: Task
  onSave(text: string, repeatDays: number | null): Promise<boolean>
  onCancel(): void
  onRequestHeight(height: number): void
}

const MAX_TEXTAREA_HEIGHT = 250

export default function TaskEditor({ task, onSave, onCancel, onRequestHeight }: TaskEditorProps) {
  const [draft, setDraft] = useState(task.text)
  const [repeatDraft, setRepeatDraft] = useState(task.repeatDays?.toString() ?? '')
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
      // 输入法候选框里的 Esc 先用于取消候选，不应关闭弹层
      if (event.isComposing) return
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
    const days = Number.parseInt(repeatDraft, 10)
    const repeatDays = Number.isInteger(days) && days >= 1 && days <= 365 ? days : null
    const ok = await onSave(draft, repeatDays)
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
        {task.doneAt === null ? (
          <label className="edit-repeat">
            <span>循环</span>
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              placeholder="天"
              value={repeatDraft}
              onChange={(event) => setRepeatDraft(event.target.value)}
            />
            <span className="edit-repeat-hint">留空 = 不循环</span>
          </label>
        ) : null}
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
