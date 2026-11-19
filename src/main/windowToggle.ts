import type { BrowserWindow } from 'electron'

type Target = () => BrowserWindow | null

let getTarget: Target = () => null

/** 由主进程注入窗口来源，测试可替换为假窗口。 */
export function setToggleTarget(target: Target): void {
  getTarget = target
}

export function toggleWindow(): void {
  const win = getTarget()
  if (!win) return
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}
