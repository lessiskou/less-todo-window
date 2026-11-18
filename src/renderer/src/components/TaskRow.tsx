import { useRef, useState } from 'react'
import type { List, Task } from '../../../shared/types'
import { formatTime } from '../hooks/useTasks'

interface TaskRowProps {
  task: Task
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onUpdateText(id: string, text: string): void
  onSetReminder(id: string, at: string | null): void
  highlighted?: boolean
}

function todayAt(hhmm: string): string | null {
  const [hours, minutes] = hhmm.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).toISOString()
}

export default function TaskRow({
  task,
  onToggle,
  onRemove,
  onMove,
  onUpdateText,
  onSetReminder,
  highlighted = false
}: TaskRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.text)
  const [reminderOpen, setReminderOpen] = useState(false)
  const cancelEdit = useRef(false)

  const done = task.doneAt !== null
  const overdue = !done && task.reminderAt !== null && new Date(task.reminderAt).getTime() < Date.now()

  const startEditing = (): void => {
    setDraft(task.text)
    setEditing(true)
  }

  const commit = (): void => {
    setEditing(false)
    if (cancelEdit.current) {
      cancelEdit.current = false
      return
    }
    if (draft.trim() !== task.text) onUpdateText(task.id, draft)
  }

  return (
    <div
      className={`row${done ? ' is-done' : ''}${highlighted ? ' is-highlighted' : ''}`}
      data-task-id={task.id}
      draggable={!done && !editing}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <button
        type="button"
        className={`check${done ? ' checked' : ''}`}
        aria-label={done ? '标记为未完成' : '完成'}
        onClick={() => onToggle(task.id)}
      >
        {done ? '✓' : ''}
      </button>

      {task.reminderAt ? (
        <span className={`time${overdue ? ' overdue' : ''}`}>{formatTime(task.reminderAt)}</span>
      ) : null}

      {editing ? (
        <input
          className="text-edit"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              cancelEdit.current = true
              setDraft(task.text)
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <span className="text" title={task.text} onDoubleClick={startEditing}>
          {task.text}
        </span>
      )}

      {!done ? (
        <span className="actions">
          {task.list === 'today' ? (
            <>
              <button type="button" className="small" onClick={() => setReminderOpen((open) => !open)}>
                提醒
              </button>
              <button type="button" className="small" onClick={() => onMove(task.id, 'later')}>
                →以后
              </button>
            </>
          ) : (
            <button type="button" className="small" onClick={() => onMove(task.id, 'today')}>
              →今天
            </button>
          )}
          <button type="button" className="small danger" aria-label="删除" onClick={() => onRemove(task.id)}>
            ✕
          </button>
        </span>
      ) : (
        <span className="actions">
          <button type="button" className="small danger" aria-label="删除" onClick={() => onRemove(task.id)}>
            ✕
          </button>
        </span>
      )}

      {reminderOpen && !done ? (
        <div className="reminder-editor">
          <input
            type="time"
            autoFocus
            defaultValue={task.reminderAt ? formatTime(task.reminderAt) : ''}
            onChange={(event) => {
              const at = todayAt(event.target.value)
              if (at) {
                onSetReminder(task.id, at)
                setReminderOpen(false)
              }
            }}
          />
          <button
            type="button"
            className="small"
            onClick={() => {
              onSetReminder(task.id, null)
              setReminderOpen(false)
            }}
          >
            清除提醒
          </button>
        </div>
      ) : null}
    </div>
  )
}
