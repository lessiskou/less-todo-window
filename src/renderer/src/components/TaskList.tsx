import { useState } from 'react'
import type { List, Task } from '../../../shared/types'
import TaskRow from './TaskRow'

interface TaskListProps {
  today: Task[]
  done: Task[]
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onUpdateText(id: string, text: string): void
  onSetReminder(id: string, at: string | null): void
}

export default function TaskList({
  today,
  done,
  onToggle,
  onRemove,
  onMove,
  onUpdateText,
  onSetReminder
}: TaskListProps) {
  const [showDone, setShowDone] = useState(false)

  return (
    <div className="task-list">
      {today.length === 0 && done.length === 0 ? (
        <p className="empty">今天还没有任务，在下方输入框写点什么</p>
      ) : null}

      {today.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onToggle={onToggle}
          onRemove={onRemove}
          onMove={onMove}
          onUpdateText={onUpdateText}
          onSetReminder={onSetReminder}
        />
      ))}

      {done.length > 0 ? (
        <div className="done-section">
          <button type="button" className="done-toggle" onClick={() => setShowDone((open) => !open)}>
            已完成 · {done.length}
          </button>
          {showDone
            ? done.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onUpdateText={onUpdateText}
                  onSetReminder={onSetReminder}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
