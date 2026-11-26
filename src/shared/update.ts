export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  percent?: number
  message?: string
  prompt?: boolean
  manual?: boolean
}
