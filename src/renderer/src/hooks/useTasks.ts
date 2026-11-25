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
  highlighted: Set<string>
  add(text: string): Promise<void>
  toggle(id: string): Promise<void>
  remove(id: string): Promise<void>
  move(id: string, list: List): Promise<void>
  updateText(id: string, text: string): Promise<boolean>
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
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())
  const hintTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setTasks(await window.api.getTasks())
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.api.onTasksChanged((next) => setTasks(next))
    const unsubscribeHighlight = window.api.onHighlight((ids) => {
      setHighlighted((previous) => {
        const next = new Set(previous)
        for (const id of ids) next.add(id)
        return next
      })
    })
    return () => {
      unsubscribe()
      unsubscribeHighlight()
    }
  }, [refresh])

  const clearHighlight = useCallback((id: string) => {
    setHighlighted((previous) => {
      if (!previous.has(id)) return previous
      const next = new Set(previous)
      next.delete(id)
      return next
    })
  }, [])

  const showHint = useCallback((text: string) => {
    setHint(text)
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 3000)
  }, [])

  const guard = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      try {
        await action()
        return true
      } catch {
        showHint('保存失败，请重试')
        return false
      }
    },
    [showHint]
  )

  const add = useCallback(
    async (raw: string) => {
      const parsed = parseQuickAdd(raw, new Date())
      if (parsed.text.length === 0) return

      const saved = await guard(() =>
        window.api.addTask({ text: parsed.text, reminderAt: parsed.reminderAt }).then(() => undefined)
      )
      if (!saved) return

      if (parsed.timeWasPast) {
        showHint('该时间已过，未设提醒')
      } else if (parsed.reminderAt) {
        showHint(`已设提醒 ${formatTime(parsed.reminderAt)}`)
      }
    },
    [guard, showHint]
  )

  const toggle = useCallback(
    async (id: string) => {
      if (await guard(() => window.api.toggleTask(id))) clearHighlight(id)
    },
    [clearHighlight, guard]
  )

  const remove = useCallback(
    async (id: string) => {
      if (await guard(() => window.api.removeTask(id))) clearHighlight(id)
    },
    [clearHighlight, guard]
  )

  const move = useCallback(
    async (id: string, list: List) => {
      await guard(() => window.api.moveTask(id, list).then(() => undefined))
    },
    [guard]
  )

  const updateText = useCallback(
    async (id: string, text: string): Promise<boolean> => {
      if (text.trim().length === 0) {
        const removed = await guard(() => window.api.removeTask(id))
        if (removed) clearHighlight(id)
        return removed
      }
      return guard(() => window.api.updateTask(id, { text }).then(() => undefined))
    },
    [clearHighlight, guard]
  )

  const setReminder = useCallback(
    async (id: string, at: string | null) => {
      if (await guard(() => window.api.updateTask(id, { reminderAt: at }).then(() => undefined))) {
        clearHighlight(id)
      }
    },
    [clearHighlight, guard]
  )

  const snooze = useCallback(
    async (id: string, minutes: number) => {
      if (await guard(() => window.api.snoozeTask(id, minutes).then(() => undefined))) {
        clearHighlight(id)
      }
    },
    [clearHighlight, guard]
  )

  const groups = useMemo(() => groupTasks(tasks), [tasks])

  return {
    tasks,
    today: groups.today,
    later: groups.later,
    done: groups.done,
    hint,
    highlighted,
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
