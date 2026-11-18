import { useEffect, useRef } from 'react'
import Header from './components/Header'
import QuickAdd from './components/QuickAdd'
import TaskList from './components/TaskList'
import { useTasks } from './hooks/useTasks'

export default function App() {
  const api = useTasks()
  const headerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const quickRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = contentRef.current
    if (!target) return

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
  }, [])

  return (
    <div className="card">
      <div ref={headerRef}>
        <Header count={api.today.length} onClose={() => void window.api.hideWindow()} />
      </div>

      <main className="content">
        <div ref={contentRef} className="content-inner">
          <TaskList
            today={api.today}
            done={api.done}
            onToggle={(id) => void api.toggle(id)}
            onRemove={(id) => void api.remove(id)}
            onMove={(id, list) => void api.move(id, list)}
            onUpdateText={(id, text) => void api.updateText(id, text)}
            onSetReminder={(id, at) => void api.setReminder(id, at)}
          />
        </div>
      </main>

      <div ref={quickRef}>
        <QuickAdd hint={api.hint} onAdd={api.add} />
      </div>
    </div>
  )
}
