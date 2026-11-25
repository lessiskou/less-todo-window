import { useState } from 'react'
import type { List, Task } from '../../../shared/types'
import { formatTime } from '../hooks/useTasks'
import { BellIcon, CheckIcon, CloseIcon, MoveDownIcon, MoveUpIcon } from './icons'

interface TaskRowProps {
  task: Task
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onEdit(task: Task): void
  onSetReminder(id: string, at: string | null): void
  onSnooze(id: string, minutes: number): void
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
  onEdit,
  onSetReminder,
  onSnooze,
  highlighted = false
}: TaskRowProps) {
  const [reminderOpen, setReminderOpen] = useState(false)

  const done = task.doneAt !== null
  const overdue = !done && task.reminderAt !== null && new Date(task.reminderAt).getTime() < Date.now()

  return (
    <div
      className={`row${done ? ' is-done' : ''}${highlighted ? ' is-highlighted' : ''}`}
      data-task-id={task.id}
      draggable={!done}
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
        {done ? <CheckIcon /> : null}
      </button>

      {task.reminderAt ? (
        <span className={`time${overdue ? ' overdue' : ''}`}>{formatTime(task.reminderAt)}</span>
      ) : null}

      <span className="text" title={task.text} onDoubleClick={() => onEdit(task)}>
        {task.text}
      </span>

      {!done ? (
        <span className="actions">
          {task.list === 'today' ? (
            <>
              <button
                type="button"
                className="action"
                title="提醒"
                aria-label="设置提醒"
                onClick={() => setReminderOpen((open) => !open)}
              >
                <BellIcon />
              </button>
              <button
                type="button"
                className="action"
                title="移到以后"
                aria-label="移到以后"
                onClick={() => onMove(task.id, 'later')}
              >
                <MoveDownIcon />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="action"
              title="移到今天"
              aria-label="移到今天"
              onClick={() => onMove(task.id, 'today')}
            >
              <MoveUpIcon />
            </button>
          )}
          <button type="button" className="action danger" title="删除" aria-label="删除" onClick={() => onRemove(task.id)}>
            <CloseIcon />
          </button>
        </span>
      ) : (
        <span className="actions">
          <button type="button" className="action danger" title="删除" aria-label="删除" onClick={() => onRemove(task.id)}>
            <CloseIcon />
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

      {highlighted && !done ? (
        <div className="snooze">
          <button type="button" className="small primary" onClick={() => onSnooze(task.id, 5)}>
            稍后提醒 5 分钟
          </button>
          <button type="button" className="small" onClick={() => onSnooze(task.id, 10)}>
            10 分钟
          </button>
        </div>
      ) : null}
    </div>
  )
}
