# 全局快捷键显示/隐藏窗口 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `Ctrl+Shift+Space` 在任何时候显示/隐藏小窗。

**Architecture:** 主进程用 Electron `globalShortcut` 注册一个固定键位，回调复用抽取出的 `toggleWindow()`；托盘菜单标注该键位。

**Tech Stack:** Electron 45、TypeScript、electron-vite、Vitest。

**Spec:** `docs/superpowers/specs/2026-11-19-global-shortcut-design.md`

## Global Constraints

- 键位固定为 `CommandOrControl+Shift+Space`，定义为主进程常量 `TOGGLE_SHORTCUT`。
- 不做自定义快捷键、不做冲突检测（方案 A）。
- 注册失败只 `console.warn`，不阻止应用启动。
- 退出前必须 `globalShortcut.unregisterAll()`。
- 文档与注释使用中文；用户可见文案与现有风格一致。

## Review Focus

- 窗口处于最小化/被其他窗口遮挡时按快捷键：应显示并聚焦，而不是被判定为"可见"就隐藏。
- 提醒弹窗已把窗口唤到前台时按快捷键：应正常隐藏，不报错。
- 快捷键被其他程序占用导致注册失败：应用照常启动，托盘仍可用。
- macOS 上没有 `Ctrl`：用 `CommandOrControl` 而非写死 `Ctrl`。
- 退出后热键残留：`will-quit` 中注销，退出后组合键不应再被本应用拦截。

---

### Task 1: 抽取 `toggleWindow` 并注册全局快捷键

**Files:**
- Modify: `src/main/index.ts`（常量区、`setup()` 内托盘注册处、`app.whenReady()` 之后、`before-quit` 附近）

**Interfaces:**
- Produces: `function toggleWindow(): void` — 定义在 `src/main/index.ts` 模块顶层，`mainWindow` 为 `null` 时直接返回；可见则 `hide()`，否则 `show()` + `focus()`。

- [ ] **Step 1: 添加常量与 `toggleWindow`**

在 `let mainWindow: BrowserWindow | null = null` 之后添加：

```ts
export const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+Space'

function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}
```

- [ ] **Step 2: 托盘回调改用 `toggleWindow`**

`createTray({ toggleWindow: () => { ... } })` 改为 `toggleWindow,`（删除原先的内联实现）。

- [ ] **Step 3: 注册快捷键**

在 `void app.whenReady().then(setup)` 之前添加：

```ts
function registerShortcut(): void {
  const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow)
  if (!registered) console.warn(`全局快捷键 ${TOGGLE_SHORTCUT} 注册失败，可能已被其他程序占用`)
}
```

`app.whenReady()` 的 then 改为先 `setup()` 再 `registerShortcut()`。

- [ ] **Step 4: 退出时注销**

在 `app.on('before-quit', ...)` 之后添加：

```ts
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
```

- [ ] **Step 5: 补 import**

`src/main/index.ts` 第一行的 electron 导入中加入 `globalShortcut`。

- [ ] **Step 6: 验证**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add src/main/index.ts
git commit -m "feat: 全局快捷键显示/隐藏窗口"
```

### Task 2: 托盘菜单标注快捷键

**Files:**
- Modify: `src/main/tray.ts`
- Modify: `src/main/index.ts`（调用 `createTray` 处传新参数）
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 的 `TOGGLE_SHORTCUT`（`index.ts` 导出）。
- Produces: `TrayDeps` 新增 `shortcutLabel: string`。

- [ ] **Step 1: 扩展 `TrayDeps`**

标签与原文案间只有一个空格（Electron 会自己补齐右侧留白）。

```ts
export interface TrayDeps {
  toggleWindow(): void
  shortcutLabel: string
  quit(): void
  getAutostart(): boolean
  setAutostart(value: boolean): void
}
```

「显示 / 隐藏」项改为：

```ts
{ label: `显示 / 隐藏 ${deps.shortcutLabel}`, click: deps.toggleWindow },
```

- [ ] **Step 2: 传入标签**

`src/main/index.ts` 的 `createTray({...})` 中加 `shortcutLabel: 'Ctrl+Shift+Space',`。

- [ ] **Step 3: 更新 README**

「功能」列表在「托盘常驻」一行前插入：

```md
- **快捷键**：`Ctrl+Shift+Space` 随时显示 / 隐藏小窗；托盘菜单同样会标出。
```

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm test`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/main/tray.ts src/main/index.ts README.md
git commit -m "docs: 托盘菜单与说明标注显示/隐藏快捷键"
```
