import { globalShortcut } from 'electron'

export const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+Space'
/** 托盘菜单里展示用；本应用仅支持 Windows。 */
export const TOGGLE_SHORTCUT_LABEL = 'Ctrl+Shift+Space'

export function registerToggleShortcut(toggle: () => void): boolean {
  const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggle)
  if (!registered) {
    console.warn(`全局快捷键 ${TOGGLE_SHORTCUT} 注册失败，可能已被其他程序占用`)
  }
  return registered
}

export function unregisterToggleShortcut(): void {
  globalShortcut.unregisterAll()
}
