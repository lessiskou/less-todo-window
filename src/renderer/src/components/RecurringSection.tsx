import { useState } from 'react'
import type { List, Task } from '../../../shared/types'
import { ChevronIcon } from './icons'
import TaskRow from './TaskRow'

interface RecurringSectionProps {
  tasks: Task[]
  total: number
  searching: boolean
  onToggle(id: string): void
  onRemove(id: string): void
  onMove(id: string, list: List): void
  onEdit(task: Task): void
  onSetReminder(id: string, at: string | null): void
  onSnooze(id: string, minutes: number): void
}

export default function RecurringSection({
  tasks,
  total,
  searching,
  onToggle,
  onRemove,
  onMove,
  onEdit,
  onSetReminder,
  onSnooze
}: RecurringSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const open = expanded || searching

  return (
    <div className="later-section recurring-section">
      <button
        type="button"
        className="fold-toggle"
        aria-expanded={open}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronIcon className={open ? 'is-open' : undefined} />
        循环 <span className="fold-count">{total}</span>
      </button>

      {open
        ? tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              variant="repeat"
              onToggle={onToggle}
              onRemove={onRemove}
              onMove={onMove}
              onEdit={onEdit}
              onSetReminder={onSetReminder}
              onSnooze={onSnooze}
            />
          ))
        : null}

      {open && tasks.length === 0 ? (
        <p className="empty small">还没有循环任务，输入 每15天 洗床单 添加</p>
      ) : null}
    </div>
  )
}
