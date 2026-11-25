# 任务编辑弹层实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 双击任务改用窗内弹层多行编辑（编辑时窗口临时增高），并去掉卡片外层投影以消除圆角外的方形残影。

**Architecture:** 渲染层在 `.card` 内渲染绝对定位的遮罩 + 编辑面板；`App` 持有编辑态，`TaskRow` 只负责触发 `onEdit`。面板高度通过 `ResizeObserver` 上报，复用现有 `window.api.setContentHeight` 撑高窗口；关闭后由 `App` 重新测量内容并恢复高度。圆角问题只改 CSS：`--shadow` 去掉两层外投影，保留内高光。

**Tech Stack:** Electron 45、React 19、TypeScript、electron-vite、Vitest（仅 node 环境）。

**Spec:** `docs/superpowers/specs/2026-11-25-task-edit-popup-design.md`

## Global Constraints

- 窗口固定宽 320px、透明无边框；内容高度由渲染层上报，主进程封顶屏幕工作区高度的 45%、下限 160px。
- 渲染层没有 DOM 测试环境（`vitest` 只跑 `tests/**/*.test.ts`，environment `node`），本计划的自动化验证为 `npm run typecheck` / `npm test` / `npm run build`，UI 行为用隔离数据目录的构建版人工核对。
- 验证时不要碰正在运行的安装版（单实例锁会抢占）；使用 `npx electron . --user-data-dir=...` 独立目录启动。
- 文案与按钮沿用现有中文风格；不要引入新依赖。
- 提交信息结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## Review Focus

- **中文输入法组合态**：在拼音尚未上屏时按 Enter 不能保存。Task 2 的 `event.nativeEvent.isComposing` 判断负责，Task 3 人工核对。
- **超长文本 / 多行文本**：面板不能撑破窗口；约 12 行后文本框内部滚动，窗口高度受 45% 上限约束。Task 2 的 CSS 负责，Task 4 人工核对。
- **小屏（工作区高度 < 约 380px）**：窗口封顶后面板可能放不下，按钮必须仍可触达（遮罩可纵向滚动）。Task 2 的 `.edit-overlay { overflow-y: auto }` 负责。
- **保存失败**：`updateText` 返回 `false` 时弹层保持打开并保留输入。Task 3 负责。
- **编辑期间任务消失**：任务列表里找不到该 id 时自动关闭弹层。Task 3 负责。
- **已完成任务**：同样可双击编辑，保存后保持完成状态。Task 3 负责。
- **浅色 / 深色主题**：圆角残影在两种主题下都不应出现。Task 1 负责。

---

### Task 0: 建立工作分支

**Files:** 无

- [ ] **Step 1: 从 main 切出工作分支**

Run: `git switch -c feat/task-edit-popup`
Expected: `Switched to a new branch 'feat/task-edit-popup'`

---

### Task 1: 去掉卡片外层投影

**Files:**
- Modify: `src/renderer/src/styles.css:26-29`（浅色 `--shadow`）
- Modify: `src/renderer/src/styles.css:55-58`（深色 `--shadow`）

**Interfaces:**
- Consumes: 无
- Produces: 无（只改 CSS 变量值；`.card` 仍是唯一下游）

- [ ] **Step 1: 修改浅色主题的 `--shadow`**

把 `:root` 中的 `--shadow` 改为只保留内高光：

```css
  --shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
```

删除原来的两行外投影（`0 18px 36px -14px ...`、`0 2px 8px ...`）；该值只被 `.card` 使用。原因：外投影落在窗口矩形之外会被硬裁，正是圆角外方角残影的来源。

- [ ] **Step 2: 修改深色主题的 `--shadow`**

`@media (prefers-color-scheme: dark)` 里的 `--shadow` 改为：

```css
    --shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run typecheck && npm run build`
Expected: 两条命令都退出码 0。

- [ ] **Step 4: 人工核对圆角（浅色 + 深色）**

Run（独立数据目录，避免占用安装版的单实例锁）：

```bash
npm run build
npx electron . --user-data-dir="D:/Documents/GitHub/less-todo-window/.superpowers/visual-check/testdata" --remote-debugging-port=9334
```

截取右下角放大图，或在 DevTools（`http://127.0.0.1:9334`）执行：
`Emulation.setDefaultBackgroundColorOverride({color:{r:0,g:0,b:0,a:0}})` 后 `Page.captureScreenshot`，
检查窗口最右列、最底行、四角的 alpha 均为 0。
Expected: 圆角外不再出现半透明方形残影；浅色/深色都成立。完成后关闭该实例。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/styles.css
git commit -m "fix: 去掉卡片外层投影，消除圆角外的方形残影

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 新增 TaskEditor 组件与样式

**Files:**
- Create: `src/renderer/src/components/TaskEditor.tsx`
- Modify: `src/renderer/src/styles.css`（`:root`、深色主题、文件末尾追加编辑弹层样式）

**Interfaces:**
- Consumes: `Task`（`src/shared/types.ts`）、`CloseIcon`（`./icons`）
- Produces: 默认导出组件 `TaskEditor`，props：
  ```ts
  interface TaskEditorProps {
    task: Task
    onSave(text: string): Promise<boolean>
    onCancel(): void
    onRequestHeight(height: number): void
  }
  ```

- [ ] **Step 1: 新增主题变量**

浅色 `:root` 追加：

```css
  --scrim: rgba(29, 42, 35, 0.22);
  --panel-bg: #f6f9f4;
```

深色媒体查询追加：

```css
    --scrim: rgba(0, 0, 0, 0.45);
    --panel-bg: #1b241e;
```

- [ ] **Step 2: 新增编辑弹层样式**

在 `styles.css` 末尾（`@media (prefers-reduced-motion: reduce)` 之前）追加：

```css
/* ===== 编辑弹层 ===== */

.card {
  position: relative;
}

.edit-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  padding: 12px;
  overflow-y: auto;
  background: var(--scrim);
}

.edit-panel {
  width: 100%;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 11px 11px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--panel-bg);
  box-shadow: 0 6px 16px -8px rgba(20, 40, 28, 0.35);
}

.edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.edit-textarea {
  width: 100%;
  min-height: 4.2em;
  max-height: 250px;
  resize: none;
  overflow-y: auto;
  border: 1px solid var(--field-line);
  border-radius: 9px;
  background: var(--field);
  color: var(--fg);
  padding: 7px 9px;
  font: inherit;
  line-height: 1.6;
  outline: none;
  user-select: text;
}

.edit-textarea:focus {
  border-color: var(--accent);
}

.edit-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.edit-actions .small.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 3: 创建 `TaskEditor.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Task } from '../../../shared/types'
import { CloseIcon } from './icons'

interface TaskEditorProps {
  task: Task
  onSave(text: string): Promise<boolean>
  onCancel(): void
  onRequestHeight(height: number): void
}

const MAX_TEXTAREA_HEIGHT = 250

export default function TaskEditor({ task, onSave, onCancel, onRequestHeight }: TaskEditorProps) {
  const [draft, setDraft] = useState(task.text)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 打开时聚焦并把光标放到末尾
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // 文本变化时自适应高度，超过上限后内部滚动
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [draft])

  // 面板高度变化时上报，供 App 撑高窗口
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const report = (): void => onRequestHeight(Math.ceil(panel.getBoundingClientRect().height + 24))
    const observer = new ResizeObserver(report)
    observer.observe(panel)
    report()
    return () => observer.disconnect()
  }, [onRequestHeight])

  // Esc 关闭（窗口级监听，失焦后仍有效）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const canSave = draft.trim().length > 0 && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    const ok = await onSave(draft)
    if (!ok) setSaving(false)
  }

  return (
    <div className="edit-overlay" role="dialog" aria-modal="true" aria-label="编辑任务">
      <div className="edit-panel" ref={panelRef}>
        <div className="edit-head">
          <span>编辑任务</span>
          <button type="button" className="icon-button" aria-label="取消编辑" title="取消" onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="edit-textarea"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            if (event.nativeEvent.isComposing) return
            if (event.shiftKey) return
            event.preventDefault()
            void save()
          }}
        />
        <div className="edit-actions">
          <button type="button" className="small" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="small primary" disabled={!canSave} onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
```

说明：
- `event.nativeEvent.isComposing` 阻止中文输入法选词时的 Enter 触发保存。
- `Shift+Enter` 不拦截，textarea 原生产生换行。
- 点遮罩无处理函数，因此不会关闭。

- [ ] **Step 4: 类型检查与构建**

Run: `npm run typecheck && npm run build`
Expected: 退出码 0（组件尚未接入，但会被 tsc 检查）。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/TaskEditor.tsx src/renderer/src/styles.css
git commit -m "feat: 新增任务编辑弹层组件

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 接入双击编辑与窗口高度联动

**Files:**
- Modify: `src/renderer/src/components/TaskRow.tsx`
- Modify: `src/renderer/src/components/TaskList.tsx`
- Modify: `src/renderer/src/components/LaterSection.tsx`
- Modify: `src/renderer/src/hooks/useTasks.ts:122-131`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `TaskEditor`（Task 2）、`TasksApi.updateText`（本任务改为返回 `Promise<boolean>`）
- Produces:
  - `TaskRow` 新增 `onEdit(task: Task): void`，删除 `onUpdateText`
  - `TaskList` / `LaterSection` 同样以 `onEdit` 替换 `onUpdateText`
  - `TasksApi.updateText(id: string, text: string): Promise<boolean>`

- [ ] **Step 1: 让 `updateText` 返回是否成功**

`src/renderer/src/hooks/useTasks.ts` 中：

- `TasksApi` 接口改为 `updateText(id: string, text: string): Promise<boolean>`。
- 先跑 `grep -rn "updateText" src/` 确认调用点：预期只有 `useTasks.ts` 自身与 `App.tsx`；其余若出现一并按新返回值类型调整。
- 实现改为在两个分支都返回 `guard` 的结果：

```ts
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
```

- [ ] **Step 2: `TaskRow` 改为只触发编辑回调**

`src/renderer/src/components/TaskRow.tsx`：

- 删除 `useState` 的 `editing`/`draft`、`cancelEdit` ref、`startEditing`/`commit`，以及所有行内 `<input className="text-edit">`。
- props 删 `onUpdateText`，加 `onEdit(task: Task): void`。
- `draggable={!done}`（去掉 `&& !editing`）。
- 文字节点改为：

```tsx
        <span className="text" title={task.text} onDoubleClick={() => onEdit(task)}>
          {task.text}
        </span>
```

- 顶部 import 写死为 `import { useState } from 'react'`（`useState` 仍被 `reminderOpen` 使用，`useRef` 不再需要）。

- [ ] **Step 3: `TaskList` / `LaterSection` 透传 `onEdit`**

两个文件都把 props 中的 `onUpdateText(id, text)` 换成 `onEdit(task: Task): void`，并在所有 `<TaskRow>` 上传 `onEdit={onEdit}`、去掉 `onUpdateText`。

- [ ] **Step 4: `App` 管理编辑态与高度**

`src/renderer/src/App.tsx`：

1. import `TaskEditor` 与 `Task` 类型；补充 `useCallback` 到 react import。
2. 新增状态与稳定回调：

```ts
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const closeEditor = useCallback(() => setEditingTask(null), [])
  const requestHeight = useCallback((height: number) => {
    void window.api.setContentHeight(height)
  }, [])
```

`requestHeight` / `closeEditor` 必须稳定：`TaskEditor` 用它们做 effect 依赖，否则每次 App 渲染都会重建 ResizeObserver 和键盘监听。
3. `TaskList` / `LaterSection` 的 `onUpdateText` 替换为 `onEdit={setEditingTask}`。
4. 高度测量 effect 增加编辑态守卫与依赖：

```ts
  useEffect(() => {
    const target = contentRef.current
    if (!target || editingTask) return
    // ...原有 ResizeObserver 与 measure 逻辑不变...
  }, [editingTask])
```

这样编辑期间不会被内容测量覆盖；关闭后 effect 重新执行并立即测量，恢复原高度。

5. 任务消失时自动关闭：

```ts
  useEffect(() => {
    if (editingTask && !api.tasks.some((task) => task.id === editingTask.id)) {
      setEditingTask(null)
    }
  }, [api.tasks, editingTask])
```

6. 在 `.card` 内、`quickRef` 之后渲染：

```tsx
      {editingTask ? (
        <TaskEditor
          key={editingTask.id}
          task={editingTask}
          onSave={async (text) => {
            const ok = await api.updateText(editingTask.id, text)
            if (ok) setEditingTask(null)
            return ok
          }}
          onCancel={closeEditor}
          onRequestHeight={requestHeight}
        />
      ) : null}
```

- [ ] **Step 5: 类型检查、单测与构建**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通过（现有单测不涉及渲染层）。

- [ ] **Step 6: 人工核对弹层行为**

用隔离数据目录启动构建版（同 Task 1 Step 4），通过 CDP `Runtime.evaluate` 调 `window.api.addTask` 造数据，逐项核对：

- 双击普通任务 → 弹层打开、窗口变高、文本完整显示。
- 长文本（>12 行）→ 文本框内部滚动；在 1080p 下把文本填到最大行数，确认「保存 / 取消」按钮仍在可视区内（主进程封顶屏高 45%；若被顶出，把 `MAX_TEXTAREA_HEIGHT` 调小）。
- 记录打开前后与关闭后的 `window.outerHeight`：打开时变大、关闭后恢复到原值（用 CDP `Runtime.evaluate('outerHeight')` 取数，不只靠肉眼）。
- 输入中文拼音时按 Enter → 不保存；上屏后再按 Enter → 保存并关闭。
- `Shift+Enter` → 换行；`Esc` → 取消且不写入；点遮罩 → 不关闭。
- 清空文本 → 保存按钮禁用。
- 编辑已完成任务并保存 → 文本更新、仍为已完成。
- 关闭弹层后窗口高度恢复。
- 浅色/深色各看一遍。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/TaskRow.tsx \
  src/renderer/src/components/TaskList.tsx src/renderer/src/components/LaterSection.tsx \
  src/renderer/src/hooks/useTasks.ts
git commit -m "feat: 双击任务改用弹层多行编辑

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 文档与版本号

**Files:**
- Modify: `README.md`（功能列表）
- Modify: `package.json:3`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: README 功能列表补充编辑说明**

在「功能」列表「今天 / 以后」之后插入：

```markdown
- **编辑**：双击任务在弹层里多行编辑，长文本完整可见；`Enter` 保存、`Shift+Enter` 换行、`Esc` 取消。
```

- [ ] **Step 2: 版本号升到 1.3.0**

`package.json` 中 `"version": "1.2.0"` 改为 `"version": "1.3.0"`（`package-lock.json` 顶部两处同步改）。

- [ ] **Step 3: 构建确认**

Run: `npm run build`
Expected: 退出码 0。

- [ ] **Step 4: 提交**

```bash
git add README.md package.json package-lock.json
git commit -m "chore: 版本号升到 1.3.0，补充编辑功能说明

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
