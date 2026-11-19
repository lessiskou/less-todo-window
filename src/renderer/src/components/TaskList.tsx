import { useState } from 'react'
import type { List, Task } from '../../../shared/types'
import { ChevronIcon } from './icons'
import TaskRow from './TaskRow'

interface TaskListProps {
  today: Task[]
  done: Task[]
  forceShowDone?: boolean
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onUpdateText(id: string, text: string): void
  onSetReminder(id: string, at: string | null): void
  onSnooze(id: string, minutes: number): void
  onDropTask(id: string): void
  highlighted: Set<string>
}

export default function TaskList({
  today,
  done,
  forceShowDone = false,
  onToggle,
  onRemove,
  onMove,
  onUpdateText,
  onSetReminder,
  onSnooze,
  onDropTask,
  highlighted
}: TaskListProps) {
  const [showDone, setShowDone] = useState(false)
  const doneOpen = showDone || forceShowDone
  const orderedToday = [...today].sort(
    (a, b) => Number(highlighted.has(b.id)) - Number(highlighted.has(a.id))
  )

  return (
    <div
      className="task-list"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain')
        if (id) onDropTask(id)
      }}
    >
      {today.length === 0 && done.length === 0 ? (
        <p className="empty">今天还没有任务，在下面写点什么</p>
      ) : null}

      {orderedToday.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onToggle={onToggle}
          onRemove={onRemove}
          onMove={onMove}
          onUpdateText={onUpdateText}
          onSetReminder={onSetReminder}
          onSnooze={onSnooze}
          highlighted={highlighted.has(task.id)}
        />
      ))}

      {done.length > 0 ? (
        <div className="done-section">
          <button
            type="button"
            className="fold-toggle"
            aria-expanded={doneOpen}
            onClick={() => setShowDone((open) => !open)}
          >
            <ChevronIcon className={doneOpen ? 'is-open' : undefined} />
            已完成 <span className="fold-count">{done.length}</span>
          </button>
          {doneOpen
            ? done.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onUpdateText={onUpdateText}
                  onSetReminder={onSetReminder}
                  onSnooze={onSnooze}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
