import { useState } from 'react'
import type { List, Task } from '../../../shared/types'
import TaskRow from './TaskRow'

interface LaterSectionProps {
  tasks: Task[]
  total: number
  searching: boolean
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onUpdateText(id: string, text: string): void
  onSetReminder(id: string, at: string | null): void
  onSnooze(id: string, minutes: number): void
}

export default function LaterSection({
  tasks,
  total,
  searching,
  onToggle,
  onRemove,
  onMove,
  onUpdateText,
  onSetReminder,
  onSnooze
}: LaterSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const open = expanded || searching

  return (
    <div
      className="later-section"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const id = event.dataTransfer.getData('text/plain')
        if (id) onMove(id, 'later')
      }}
    >
      <button type="button" className="later-toggle" onClick={() => setExpanded((value) => !value)}>
        {open ? '▾' : '▸'} 以后 · {total}
      </button>

      {open
        ? tasks.map((task) => (
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

      {open && tasks.length === 0 ? <p className="empty small">以后没有任务</p> : null}
    </div>
  )
}
