import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { groupTasks } from '../../../shared/taskOrder'
import { parseQuickAdd } from '../../../shared/quickAdd'
import type { List, Task } from '../../../shared/types'

export interface TasksApi {
  tasks: Task[]
  today: Task[]
  later: Task[]
  done: Task[]
  hint: string | null
  add(text: string): Promise<void>
  toggle(id: string): Promise<void>
  remove(id: string): Promise<void>
  move(id: string, list: List): Promise<void>
  updateText(id: string, text: string): Promise<void>
  setReminder(id: string, at: string | null): Promise<void>
  snooze(id: string, minutes: number): Promise<void>
  refresh(): Promise<void>
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function useTasks(): TasksApi {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setTasks(await window.api.getTasks())
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.api.onTasksChanged((next) => setTasks(next))
    return unsubscribe
  }, [refresh])

  const showHint = useCallback((text: string) => {
    setHint(text)
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 3000)
  }, [])

  const add = useCallback(
    async (raw: string) => {
      const parsed = parseQuickAdd(raw, new Date())
      if (parsed.text.length === 0) return

      await window.api.addTask({ text: parsed.text, reminderAt: parsed.reminderAt })

      if (parsed.timeWasPast) {
        showHint('该时间已过，未设提醒')
      } else if (parsed.reminderAt) {
        showHint(`已设提醒 ${formatTime(parsed.reminderAt)}`)
      }
    },
    [showHint]
  )

  const toggle = useCallback(async (id: string) => {
    await window.api.toggleTask(id)
  }, [])

  const remove = useCallback(async (id: string) => {
    await window.api.removeTask(id)
  }, [])

  const move = useCallback(async (id: string, list: List) => {
    await window.api.moveTask(id, list)
  }, [])

  const updateText = useCallback(
    async (id: string, text: string) => {
      if (text.trim().length === 0) {
        await window.api.removeTask(id)
        return
      }
      await window.api.updateTask(id, { text })
    },
    []
  )

  const setReminder = useCallback(async (id: string, at: string | null) => {
    await window.api.updateTask(id, { reminderAt: at })
  }, [])

  const snooze = useCallback(async (id: string, minutes: number) => {
    await window.api.snoozeTask(id, minutes)
  }, [])

  const groups = useMemo(() => groupTasks(tasks), [tasks])

  return {
    tasks,
    today: groups.today,
    later: groups.later,
    done: groups.done,
    hint,
    add,
    toggle,
    remove,
    move,
    updateText,
    setReminder,
    snooze,
    refresh
  }
}
