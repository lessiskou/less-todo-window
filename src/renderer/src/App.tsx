import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { matchesSearch } from '../../shared/taskOrder'
import type { Task } from '../../shared/types'
import Header from './components/Header'
import LaterSection from './components/LaterSection'
import QuickAdd from './components/QuickAdd'
import RecurringSection from './components/RecurringSection'
import SearchBar from './components/SearchBar'
import SettingsMenu from './components/SettingsMenu'
import TaskEditor from './components/TaskEditor'
import TaskList from './components/TaskList'
import { CloseIcon } from './components/icons'
import { useTasks } from './hooks/useTasks'

export default function App() {
  const api = useTasks()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dataWarning, setDataWarning] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const closeEditor = useCallback(() => setEditingTask(null), [])
  const requestHeight = useCallback((height: number) => {
    void window.api.setContentHeight(height)
  }, [])
  const headerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const quickRef = useRef<HTMLDivElement>(null)

  const searching = searchOpen && query.trim().length > 0
  const filter = (tasks: typeof api.today): typeof api.today =>
    searching ? tasks.filter((task) => matchesSearch(task, query)) : tasks

  const visibleToday = useMemo(() => filter(api.today), [api.today, searching, query])
  const visibleRepeat = useMemo(() => filter(api.repeat), [api.repeat, searching, query])
  const visibleLater = useMemo(() => filter(api.later), [api.later, searching, query])
  const visibleDone = useMemo(() => filter(api.done), [api.done, searching, query])

  useEffect(() => {
    const unsubscribe = window.api.onDataWarning((message) => setDataWarning(message))
    return unsubscribe
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // 编辑弹层打开时，Ctrl+F / Esc 都归弹层所有
      if (editingTask) return
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchOpen, editingTask])

  useEffect(() => {
    const target = contentRef.current
    if (!target || editingTask) return

    let timer: number | null = null
    const measure = (): void => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const header = headerRef.current?.offsetHeight ?? 0
        const content = target.getBoundingClientRect().height
        const quick = quickRef.current?.offsetHeight ?? 0
        void window.api.setContentHeight(Math.ceil(header + content + quick + 2))
      }, 100)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(target)
    if (headerRef.current) observer.observe(headerRef.current)
    if (quickRef.current) observer.observe(quickRef.current)
    measure()

    return () => {
      observer.disconnect()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [editingTask])

  useEffect(() => {
    if (editingTask && !api.tasks.some((task) => task.id === editingTask.id)) {
      setEditingTask(null)
    }
  }, [api.tasks, editingTask])

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
  }

  return (
    <div className="card">
      <div ref={headerRef}>
        {dataWarning ? (
          <div className="banner warning">
            <span>{dataWarning}</span>
            <button
              type="button"
              className="banner-close"
              aria-label="关闭提示"
              title="关闭提示"
              onClick={() => setDataWarning(null)}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        ) : null}
        <Header
          count={api.today.length}
          onClose={() => void window.api.hideWindow()}
          onSearch={() => setSearchOpen((open) => !open)}
          onSettings={() => setSettingsOpen((open) => !open)}
        />
        {searchOpen ? <SearchBar value={query} onChange={setQuery} onClose={closeSearch} /> : null}
        {settingsOpen ? <SettingsMenu onClose={() => setSettingsOpen(false)} /> : null}
      </div>

      <main className="content">
        <div ref={contentRef} className="content-inner">
          <TaskList
            today={visibleToday}
            done={visibleDone}
            forceShowDone={searching}
            onToggle={(id) => void api.toggle(id)}
            onRemove={(id) => void api.remove(id)}
            onMove={(id, list) => void api.move(id, list)}
            onEdit={setEditingTask}
            onSetReminder={(id, at) => void api.setReminder(id, at)}
            onSnooze={(id, minutes) => void api.snooze(id, minutes)}
            onDropTask={(id) => void api.move(id, 'today')}
            highlighted={api.highlighted}
          />

          <RecurringSection
            tasks={visibleRepeat}
            total={api.repeat.length}
            searching={searching}
            onToggle={(id) => void api.toggle(id)}
            onRemove={(id) => void api.remove(id)}
            onMove={(id, list) => void api.move(id, list)}
            onEdit={setEditingTask}
            onSetReminder={(id, at) => void api.setReminder(id, at)}
            onSnooze={(id, minutes) => void api.snooze(id, minutes)}
          />

          <LaterSection
            tasks={visibleLater}
            total={api.later.length}
            searching={searching}
            onToggle={(id) => void api.toggle(id)}
            onRemove={(id) => void api.remove(id)}
            onMove={(id, list) => void api.move(id, list)}
            onEdit={setEditingTask}
            onSetReminder={(id, at) => void api.setReminder(id, at)}
            onSnooze={(id, minutes) => void api.snooze(id, minutes)}
          />
        </div>
      </main>

      <div ref={quickRef}>
        <QuickAdd hint={api.hint} onAdd={api.add} />
      </div>

      {editingTask ? (
        <TaskEditor
          key={editingTask.id}
          task={editingTask}
          onSave={async (text, repeatDays) => {
            const ok = await api.saveTask(editingTask.id, { text, repeatDays })
            if (ok) setEditingTask(null)
            return ok
          }}
          onCancel={closeEditor}
          onRequestHeight={requestHeight}
        />
      ) : null}
    </div>
  )
}
