export type List = 'today' | 'later'

export interface Task {
  id: string
  text: string
  list: List
  createdAt: string
  doneAt: string | null
  reminderAt: string | null
  notifiedAt: string | null
}

export interface Settings {
  bounds: { x: number; y: number } | null
  opacity: number
  alwaysOnTop: boolean
  autostart: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  bounds: null,
  opacity: 1,
  alwaysOnTop: true,
  autostart: false
}

export interface QuickAddParse {
  text: string
  reminderAt: string | null
  timeWasPast: boolean
}
