# 循环任务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让任务支持"每 N 天"循环：独立「循环」板块常驻，到期当天进入「今天」并突出，勾掉后从完成日顺延。

**Architecture:** 数据只存一份。循环任务留在 `tasks` 里，`list` 取 `'repeat'`，另存 `repeatDays` 与 `dueOn`；「今天」板块渲染时把 `dueOn <= 今天` 的循环任务派生出来，不复制任务。勾选循环任务不写 `doneAt`，只推进 `dueOn`。

**Tech Stack:** Electron 45、React 19、TypeScript 7、Vitest 5；无新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-26-recurring-tasks-design.md`

## Global Constraints

- 仅 Windows 10/11，Node 22+；不新增运行时依赖。
- 小窗固定 320px 宽，高度由内容驱动，封顶屏幕工作区高度 45%。
- 日期键统一为本地日期 `YYYY-MM-DD`（`localDayKey`），补零，可直接字符串比较。
- 循环任务恒满足：`list === 'repeat'`、`repeatDays >= 1`、`dueOn != null`、`reminderAt === null`、`notifiedAt === null`、`doneAt === null`。
- 循环任务不参与系统通知、不参与提醒排序、不可拖拽移动。
- 界面文案用中文；颜色只用 `src/renderer/src/styles.css` 现有 CSS 变量。
- 渲染层没有单元测试环境；UI 任务用 `npm run typecheck` + `npm run build` + 手动核对验证。
- 测试与手动验证不得触碰真实用户数据（`%APPDATA%\less-todo-window\`）。

## Review Focus

- 旧 `data.json` 里的任务没有 `repeatDays` / `dueOn`：加载后应为 `null`，任务不丢、不报错，不能被误判成循环任务。
- 输入 `每15天洗床单`（无空格）或 `每天都要做的事`：必须按普通文本处理，不能误判为循环任务。
- 到期循环任务跨过午夜仍未完成：继续留在「今天」并保持原 `dueOn`，不被 rollover 删除或顺延。
- 同一循环任务同时出现在「今天」和「循环」两栏时：勾选或删除只作用在一份数据上，不能残留幽灵行。
- 编辑里改间隔或清空循环后：`dueOn` 与 `list` 必须同步（清空时 `list='today'` 且 `dueOn=null`），不能留下悬空 dueOn。

---

### Task 1: 数据模型与旧数据归一化

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/taskService.ts:13-49`
- Modify: `tests/unit/rollover.test.ts:5-8`
- Modify: `tests/unit/taskOrder.test.ts:5-8`
- Modify: `tests/unit/ipcHandlers.test.ts:14-22`
- Test: `tests/unit/taskService.test.ts`

**Interfaces:**
- Produces: `List = 'today' | 'later' | 'repeat'`；`Task.repeatDays: number | null`；`Task.dueOn: string | null`；`QuickAddParse.repeatDays: number | null`。
- Produces: `TaskService.getAll()` 返回的每个任务都带 `repeatDays` / `dueOn`（旧数据为 `null`）。

- [ ] **Step 1: 写失败测试（旧数据归一化）**

在 `tests/unit/taskService.test.ts` 的 `describe('TaskService')` 末尾追加：

```ts
it('加载旧数据时补齐 repeatDays / dueOn 为 null', () => {
  const legacy = {
    id: 'old', text: '旧任务', list: 'today',
    createdAt: '2026-11-18T01:00:00.000Z', doneAt: null,
    reminderAt: null, notifiedAt: null
  } as unknown as Task
  const s = fakeStore()
  s.get().tasks = [legacy]
  const svcOld = new TaskService(s.store, () => now)
  const [loaded] = svcOld.getAll()
  expect(loaded.repeatDays).toBeNull()
  expect(loaded.dueOn).toBeNull()
  expect(loaded.text).toBe('旧任务')
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/taskService.test.ts`
Expected: FAIL — `loaded.repeatDays` 为 `undefined`。

- [ ] **Step 3: 改 `src/shared/types.ts` 与 `src/main/taskService.ts`**

`types.ts`：

```ts
export type List = 'today' | 'later' | 'repeat'

export interface Task {
  id: string
  text: string
  list: List
  createdAt: string
  doneAt: string | null
  reminderAt: string | null
  notifiedAt: string | null
  repeatDays: number | null
  dueOn: string | null
}

export interface QuickAddParse {
  text: string
  reminderAt: string | null
  timeWasPast: boolean
  repeatDays: number | null
}
```

`taskService.ts` 的 `isTask`：`repeatDays` 允许 `undefined / null / 正整数`，`dueOn` 允许 `undefined / null / string`。
构造器加载后归一化：

```ts
this.tasks = Array.isArray(data.tasks)
  ? data.tasks.filter(isTask).map((task) => ({
      ...task,
      repeatDays: task.repeatDays ?? null,
      dueOn: task.dueOn ?? null
    }))
  : []
```

`add()` 创建的普通任务显式写入 `repeatDays: null, dueOn: null`。

同步更新三个测试夹具，给 `t()` / `baseTask` 默认补 `repeatDays: null, dueOn: null`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/taskService.test.ts tests/unit/rollover.test.ts tests/unit/taskOrder.test.ts tests/unit/ipcHandlers.test.ts`
Expected: PASS（0 failed）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/taskService.ts tests/unit
git commit -m "feat: 任务模型增加循环字段并归一化旧数据"
```

---

### Task 2: 快速添加识别 `每N天`

**Files:**
- Modify: `src/shared/quickAdd.ts`
- Test: `tests/unit/quickAdd.test.ts`

**Interfaces:**
- Produces: `parseQuickAdd(raw: string, now: Date): QuickAddParse`，命中循环前缀时 `repeatDays` 为正整数、`reminderAt: null`；否则 `repeatDays: null`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/quickAdd.test.ts` 新增：

```ts
it('识别 每N天 / 每天 循环前缀', () => {
  expect(parseQuickAdd('每15天 洗床单', at(9))).toEqual({
    text: '洗床单', reminderAt: null, timeWasPast: false, repeatDays: 15
  })
  expect(parseQuickAdd('每天 喝水', at(9))).toEqual({
    text: '喝水', reminderAt: null, timeWasPast: false, repeatDays: 1
  })
})
it('循环前缀后不解析时间，整段保留为文本', () => {
  expect(parseQuickAdd('每15天 10:00 洗床单', at(9))).toEqual({
    text: '10:00 洗床单', reminderAt: null, timeWasPast: false, repeatDays: 15
  })
})
it('无空格与越界天数不识别为循环', () => {
  expect(parseQuickAdd('每15天洗床单', at(9))).toEqual({
    text: '每15天洗床单', reminderAt: null, timeWasPast: false, repeatDays: null
  })
  expect(parseQuickAdd('每0天 洗床单', at(9)).repeatDays).toBeNull()
  expect(parseQuickAdd('每999天 洗床单', at(9)).repeatDays).toBeNull()
  expect(parseQuickAdd('每天都要做的事', at(9)).repeatDays).toBeNull()
})
```

把现有 6 个 `toEqual(...)` 期望补上 `repeatDays: null`。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/quickAdd.test.ts`
Expected: FAIL — `repeatDays` 为 `undefined` 或循环未被识别。

- [ ] **Step 3: 实现**

在 `quickAdd.ts` 顶部加：

```ts
const REPEAT_PREFIX = /^(?:每\s*(\d{1,3})\s*天|每天)(?:\s+|$)/
```

`parseQuickAdd` 开头先匹配；把 `const input` 改为 `let input`：

```ts
const repeatMatch = REPEAT_PREFIX.exec(input)
if (repeatMatch) {
  const days = repeatMatch[1] === undefined ? 1 : Number(repeatMatch[1])
  if (days >= 1 && days <= 365) {
    return {
      text: input.slice(repeatMatch[0].length).trim(),
      reminderAt: null,
      timeWasPast: false,
      repeatDays: days
    }
  }
}
```

其余返回分支加 `repeatDays: null`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/quickAdd.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/quickAdd.ts tests/unit/quickAdd.test.ts
git commit -m "feat: 快速添加支持每N天循环语法"
```

---

### Task 3: 循环日期纯函数

**Files:**
- Create: `src/shared/recurrence.ts`
- Test: `tests/unit/recurrence.test.ts`

**Interfaces:**
- Consumes: `localDayKey(now: Date): string`（来自 `src/shared/rollover.ts`）、`Task`。
- Produces:
  - `addDaysToDayKey(dayKey: string, days: number): string`
  - `isRepeatDue(task: Task, todayKey: string): boolean`
  - `formatDueLabel(dayKey: string): string`（`2026-12-03` → `12/3`）

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/recurrence.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { addDaysToDayKey, formatDueLabel, isRepeatDue } from '../../src/shared/recurrence'
import type { Task } from '../../src/shared/types'

const t = (patch: Partial<Task>): Task => ({
  id: '1', text: 'x', list: 'repeat', createdAt: '2026-11-26T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null,
  repeatDays: 15, dueOn: '2026-11-26', ...patch
})

describe('addDaysToDayKey', () => {
  it('跨月、跨年、闰年', () => {
    expect(addDaysToDayKey('2026-11-26', 15)).toBe('2026-12-11')
    expect(addDaysToDayKey('2026-12-25', 10)).toBe('2027-01-04')
    expect(addDaysToDayKey('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('isRepeatDue', () => {
  it('当天与逾期为 true，未到期与普通任务为 false', () => {
    expect(isRepeatDue(t({ dueOn: '2026-11-26' }), '2026-11-26')).toBe(true)
    expect(isRepeatDue(t({ dueOn: '2026-11-20' }), '2026-11-26')).toBe(true)
    expect(isRepeatDue(t({ dueOn: '2026-12-01' }), '2026-11-26')).toBe(false)
    expect(isRepeatDue(t({ repeatDays: null, dueOn: null }), '2026-11-26')).toBe(false)
  })
})

describe('formatDueLabel', () => {
  it('去掉前导零', () => {
    expect(formatDueLabel('2026-12-03')).toBe('12/3')
    expect(formatDueLabel('2026-12-25')).toBe('12/25')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/recurrence.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现**

```ts
import { localDayKey } from './rollover'
import type { Task } from './types'

export function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  return localDayKey(new Date(year, month - 1, day + days))
}

export function isRepeatDue(task: Task, todayKey: string): boolean {
  return task.repeatDays != null && task.dueOn != null && task.dueOn <= todayKey
}

export function formatDueLabel(dayKey: string): string {
  const [, month, day] = dayKey.split('-')
  return `${Number(month)}/${Number(day)}`
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/recurrence.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/recurrence.ts tests/unit/recurrence.test.ts
git commit -m "feat: 新增循环日期计算工具"
```

---

### Task 4: 分组把到期循环任务派生成今天

**Files:**
- Modify: `src/shared/taskOrder.ts`
- Test: `tests/unit/taskOrder.test.ts`

**Interfaces:**
- Consumes: `isRepeatDue(task, todayKey)`。
- Produces: `groupTasks(tasks: Task[], todayKey: string = localDayKey(new Date())): TaskGroups`，其中 `TaskGroups` 增加 `repeat: Task[]`。
- Produces: `today` 数组顺序 = 到期循环任务（`dueOn` 升序、`createdAt` 升序）+ 带时间任务 + 无时间任务。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/taskOrder.test.ts` 追加，并给现有 `groupTasks([...])` 调用传第二个参数 `'2026-11-18'`：

```ts
it('到期循环进今天且置顶，未到期只在循环栏', () => {
  const due = t({ list: 'repeat', text: '到期', repeatDays: 15, dueOn: '2026-11-18' })
  const overdue = t({ list: 'repeat', text: '逾期', repeatDays: 15, dueOn: '2026-11-10' })
  const future = t({ list: 'repeat', text: '未到期', repeatDays: 15, dueOn: '2026-12-01' })
  const timed = t({ text: '十点', reminderAt: '2026-11-18T02:00:00.000Z' })
  const g = groupTasks([due, overdue, future, timed], '2026-11-18')
  expect(g.today.map((x) => x.text)).toEqual(['逾期', '到期', '十点'])
  expect(g.repeat.map((x) => x.text)).toEqual(['逾期', '到期', '未到期'])
})
it('普通任务不会因为旧数据缺字段被当成循环', () => {
  const legacy = { ...t({ text: '旧' }), repeatDays: undefined, dueOn: undefined }
  const g = groupTasks([legacy as unknown as Task], '2026-11-18')
  expect(g.repeat).toHaveLength(0)
  expect(g.today.map((x) => x.text)).toEqual(['旧'])
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/taskOrder.test.ts`
Expected: FAIL — `g.repeat` 为 `undefined`。

- [ ] **Step 3: 实现**

`taskOrder.ts` 导入 `isRepeatDue` 与 `localDayKey`；`TaskGroups` 加 `repeat: Task[]`。
`groupTasks` 内新增：

```ts
const openRepeat = tasks.filter((task) => task.doneAt === null && task.list === 'repeat')
const byDue = (a: Task, b: Task): number =>
  (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || byCreatedAt(a, b)
const repeat = [...openRepeat].sort(byDue)
const dueRepeat = repeat.filter((task) => isRepeatDue(task, todayKey))
```

返回 `today: [...dueRepeat, ...timedToday, ...untimedToday], repeat`。
注意：判定一律用 `!= null`，让缺字段的旧数据落到普通分支。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/taskOrder.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/taskOrder.ts tests/unit/taskOrder.test.ts
git commit -m "feat: 到期循环任务派生到今天的分组逻辑"
```

---

### Task 5: 跨天结转保留循环任务

**Files:**
- Modify: `src/shared/rollover.ts:27-41`
- Test: `tests/unit/rollover.test.ts`

**Interfaces:**
- Produces: `applyRollover` 对 `list === 'repeat'` 的任务返回原样副本（仅 `notifiedAt: null`），`dueOn` 不顺延。

- [ ] **Step 1: 写回归测试**

在 `tests/unit/rollover.test.ts` 追加：

```ts
it('跨天：循环任务原样保留，逾期 dueOn 不顺延', () => {
  const repeat = t({ id: 'r', list: 'repeat', repeatDays: 15, dueOn: '2026-11-10' })
  const r = applyRollover([repeat], now, '2026-11-17')
  expect(r.tasks).toHaveLength(1)
  expect(r.tasks[0].list).toBe('repeat')
  expect(r.tasks[0].dueOn).toBe('2026-11-10')
  expect(r.tasks[0].repeatDays).toBe(15)
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/unit/rollover.test.ts`
Expected: PASS（现有 `filter(doneAt === null)` 已保留它）。若失败，说明前面的改动破坏了保留行为，先修。

- [ ] **Step 3: 显式分支**

在 `applyRollover` 的 `map` 回调开头加：

```ts
if (task.list === 'repeat') {
  return { ...task, notifiedAt: null }
}
```

- [ ] **Step 4: 再次运行测试**

Run: `npx vitest run tests/unit/rollover.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/rollover.ts tests/unit/rollover.test.ts
git commit -m "fix: 跨天结转保留循环任务并保留逾期日期"
```

---

### Task 6: TaskService 循环增删改与勾选顺延

**Files:**
- Modify: `src/main/taskService.ts`
- Test: `tests/unit/taskService.test.ts`

**Interfaces:**
- Consumes: `addDaysToDayKey`、`localDayKey`。
- Produces:
  - `add(input: { text: string; list?: List; reminderAt?: string | null; repeatDays?: number | null }): Task`
  - `update(id: string, patch: { text?: string; reminderAt?: string | null; repeatDays?: number | null }): Task`
  - `toggle(id)`：循环任务推进 `dueOn = 今天 + repeatDays`，`doneAt` 保持 `null`。
  - `move(id, list)`：循环任务抛错 `循环任务不能移动到其他列表`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/taskService.test.ts` 追加（`now = 2026-11-18`）：

```ts
it('新建循环任务：进循环栏，首个到期日为今天+N，无提醒', () => {
  const t = svc.add({ text: '洗床单', repeatDays: 15 })
  expect(t.list).toBe('repeat')
  expect(t.repeatDays).toBe(15)
  expect(t.dueOn).toBe('2026-12-03')
  expect(t.reminderAt).toBeNull()
})
it('勾掉循环任务：不记完成，dueOn 从今天顺延', () => {
  const t = svc.add({ text: '洗床单', repeatDays: 15 })
  const next = svc.toggle(t.id)
  expect(next.doneAt).toBeNull()
  expect(next.list).toBe('repeat')
  expect(next.dueOn).toBe('2026-12-03')
})
it('编辑循环：改为 30 天从今天重排，清空后变成普通今天任务', () => {
  const t = svc.add({ text: '洗床单', repeatDays: 15 })
  const longer = svc.update(t.id, { repeatDays: 30 })
  expect(longer.dueOn).toBe('2026-12-18')
  const plain = svc.update(t.id, { repeatDays: null })
  expect(plain.list).toBe('today')
  expect(plain.repeatDays).toBeNull()
  expect(plain.dueOn).toBeNull()
})
it('普通任务设置循环后进入循环栏', () => {
  const t = svc.add({ text: '换滤芯' })
  const recurring = svc.update(t.id, { repeatDays: 30 })
  expect(recurring.list).toBe('repeat')
  expect(recurring.dueOn).toBe('2026-12-18')
})
it('循环任务不能移动列表', () => {
  const t = svc.add({ text: '洗床单', repeatDays: 15 })
  expect(() => svc.move(t.id, 'later')).toThrow('循环任务不能移动到其他列表')
})
it('编辑文本不改列表与到期日', () => {
  const later = svc.add({ text: '以后再说', list: 'later' })
  const editedLater = svc.update(later.id, { text: '改个名字', repeatDays: null })
  expect(editedLater.list).toBe('later')

  const repeat = svc.add({ text: '洗床单', repeatDays: 15 })
  const editedRepeat = svc.update(repeat.id, { text: '洗床单和枕套', repeatDays: 15 })
  expect(editedRepeat.list).toBe('repeat')
  expect(editedRepeat.dueOn).toBe('2026-12-03')
})
it('已完成任务忽略循环改动', () => {
  const t = svc.add({ text: 'x' })
  svc.toggle(t.id)
  const edited = svc.update(t.id, { text: 'y', repeatDays: 15 })
  expect(edited.doneAt).not.toBeNull()
  expect(edited.repeatDays).toBeNull()
  expect(edited.dueOn).toBeNull()
  expect(edited.list).toBe('today')
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/taskService.test.ts`
Expected: FAIL — `add` 忽略 `repeatDays`。

- [ ] **Step 3: 实现**

`add`：

```ts
const repeatDays =
  input.repeatDays != null && input.repeatDays >= 1 ? input.repeatDays : null
const todayKey = localDayKey(this.now())
const task: Task = {
  id: randomUUID(),
  text: input.text.trim(),
  list: repeatDays !== null ? 'repeat' : (input.list ?? 'today'),
  createdAt: this.now().toISOString(),
  doneAt: null,
  reminderAt: repeatDays !== null ? null : (input.reminderAt ?? null),
  notifiedAt: null,
  repeatDays,
  dueOn: repeatDays !== null ? addDaysToDayKey(todayKey, repeatDays) : null
}
```

`update`：先 `const todayKey = localDayKey(this.now())`，文本处理之后**只在循环值真正变化时**
才改 `list` / `dueOn`；重新赋值 `const updated: Task`，按下面的顺序写：

```ts
if (patch.text !== undefined) updated.text = patch.text.trim()

const currentRepeat = task.repeatDays
const nextRepeat =
  patch.repeatDays !== undefined
    ? (patch.repeatDays != null && patch.repeatDays >= 1 ? patch.repeatDays : null)
    : currentRepeat

if (patch.repeatDays !== undefined && task.doneAt === null && nextRepeat !== currentRepeat) {
  if (nextRepeat === null) {
    updated.repeatDays = null
    updated.dueOn = null
    updated.list = 'today'
  } else {
    updated.repeatDays = nextRepeat
    updated.dueOn = addDaysToDayKey(todayKey, nextRepeat)
    updated.list = 'repeat'
    updated.reminderAt = null
    updated.notifiedAt = null
  }
}

if (updated.repeatDays == null && patch.reminderAt !== undefined) {
  updated.reminderAt = patch.reminderAt
  updated.notifiedAt = null
}
```

这段的关键：`nextRepeat === currentRepeat` 时不动 `list` / `dueOn`，所以改文字不会把
「以后」任务挪进今天，也不会重排循环任务的到期日；`doneAt !== null` 时完全忽略循环改动。

`toggle` 开头：

```ts
if (task.repeatDays != null) {
  const updated: Task = {
    ...task,
    dueOn: addDaysToDayKey(localDayKey(this.now()), task.repeatDays),
    doneAt: null,
    notifiedAt: null
  }
  this.replace(updated)
  return updated
}
```

`move` 开头：

```ts
if (task.repeatDays != null) throw new Error('循环任务不能移动到其他列表')
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/taskService.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/taskService.ts tests/unit/taskService.test.ts
git commit -m "feat: 循环任务的新增、编辑与勾选顺延"
```

---

### Task 7: IPC 类型透传 repeatDays

**Files:**
- Modify: `src/shared/ipc.ts:20-27`
- Modify: `src/main/ipc.ts:13-20`
- Test: `tests/unit/ipcHandlers.test.ts`

**Interfaces:**
- Produces: `RendererApi.addTask(input: { text; list?; reminderAt?; repeatDays? })`；`updateTask(id, patch: { text?; reminderAt?; repeatDays? })`。IPC 通道名不变。

- [ ] **Step 1: 写测试**

在 `tests/unit/ipcHandlers.test.ts` 追加：

```ts
it('tasksAdd / tasksUpdate 透传 repeatDays', () => {
  const { handlers } = setup()
  expect(handlers[IPC.tasksAdd]({ text: '洗床单', repeatDays: 15 }).text).toBe('洗床单')
  const updated = handlers[IPC.tasksUpdate]('t1', { repeatDays: 30 })
  expect(updated.repeatDays).toBe(30)
})
```

`setup()` 的 mock `add` 改为接收并回传完整 input：

```ts
add: (input: { text: string; repeatDays?: number | null }) => ({ ...baseTask, ...input }),
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/ipcHandlers.test.ts`
Expected: FAIL — mock 未回传 `repeatDays` / 类型不匹配。

- [ ] **Step 3: 实现**

`shared/ipc.ts` 两处签名加 `repeatDays?: number | null`；`main/ipc.ts` 对应 handler 的参数类型同步。`preload/index.ts` 无需改动（原样转发）。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/unit/ipcHandlers.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc.ts tests/unit/ipcHandlers.test.ts
git commit -m "feat: IPC 任务接口支持 repeatDays"
```

---

### Task 8: TaskRow 循环任务渲染与突出样式

**Files:**
- Modify: `src/renderer/src/components/TaskRow.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `isRepeatDue`、`formatDueLabel`、`localDayKey`。
- Produces: `TaskRow` 新增可选 prop `variant?: 'default' | 'repeat'`（默认 `'default'`）。

- [ ] **Step 1: 改 TaskRow**

- 计算 `const isRepeat = task.repeatDays != null`、`const todayKey = localDayKey(new Date())`、`const due = isRepeat && isRepeatDue(task, todayKey)`。
- 根节点：`draggable={!done && !isRepeat}`；className 追加 `is-recurring`（`isRepeat && due` 时）。
- 左侧：`isRepeat && variant === 'default'` 显示 `<span className="time repeat-tag">循环</span>`；普通任务保持原时间显示。
- `variant === 'repeat'` 时，在文字 `.text` 之后加一个同级 `<span className="repeat-meta">每 {task.repeatDays} 天 · 下次 {formatDueLabel(task.dueOn ?? '')}</span>`（不要塞进 `.text` 内部，避免被两行截断）。
- 操作区：`isRepeat` 时只保留删除按钮（勾选框保留，语义为完成本次）；不再渲染提醒铃铛与移动按钮。已完成分支不变。
- 循环任务不渲染 `reminderOpen` 与 `snooze` 面板。

- [ ] **Step 2: 加样式**

`styles.css` 在任务行区域追加：

```css
.row.is-recurring .text {
  color: var(--accent);
  font-weight: 600;
}

.repeat-tag {
  color: var(--accent);
  font-size: 10.5px;
}
.repeat-meta {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: nowrap;
}
```

- [ ] **Step 3: 验证编译**

Run: `npm run typecheck && npm run build`
Expected: 0 errors，构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/TaskRow.tsx src/renderer/src/styles.css
git commit -m "feat: 任务行支持循环任务展示与突出样式"
```

---

### Task 9: 循环板块与渲染层接线

**Files:**
- Create: `src/renderer/src/components/RecurringSection.tsx`
- Modify: `src/renderer/src/hooks/useTasks.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/TaskList.tsx`（无需改动；`TaskRow` 的 `variant` 默认值负责今天栏）

**Interfaces:**
- Consumes: `TaskRow` 的 `variant="repeat"`；`groupTasks(tasks, todayKey).repeat`。
- Produces: `useTasks()` 返回值新增 `repeat: Task[]`，新增 `saveTask(id, patch: { text?: string; repeatDays?: number | null }): Promise<boolean>`。
- Produces: `RecurringSection` props：`tasks: Task[]`、`total: number`、`searching: boolean`、`onToggle`、`onRemove`、`onEdit`、`onSetReminder`、`onSnooze`。

- [ ] **Step 1: 改 `useTasks.ts`**

- `TasksApi` 增加 `repeat: Task[]` 与 `saveTask`。
- `add`：把 `parseQuickAdd(...).repeatDays` 传给 `window.api.addTask`；有循环时 `showHint('已设循环：每 ' + repeatDays + ' 天')`，不再走提醒提示。
- `groups` 改为 `groupTasks(tasks, localDayKey(new Date()))`，返回里加 `repeat: groups.repeat`。
- 新增 `saveTask`：调用 `guard(() => window.api.updateTask(id, patch).then(() => undefined))`。
- `updateText` 保持给编辑弹层之外的调用方；编辑弹层改用 `saveTask`（Task 10）。

- [ ] **Step 2: 新建 `RecurringSection.tsx`**

照 `LaterSection.tsx` 实现：折叠头文案「循环」+ 计数；**默认展开**（`useState(true)`），搜索时强制展开；空状态 `还没有循环任务，输入 每15天 洗床单 添加`；列表项传 `variant="repeat"`；不绑定拖拽 / 放下。

- [ ] **Step 3: 改 `App.tsx`**

- 新增 `visibleRepeat = useMemo(() => filter(api.repeat), [...])`。
- 在 `TaskList` 与 `LaterSection` 之间渲染 `<RecurringSection ... />`，透传 `onToggle/onRemove/onEdit/onSetReminder/onSnooze`。
- 搜索过滤覆盖 `repeat`。

- [ ] **Step 4: 验证编译与手动核对**

Run: `npm run typecheck && npm run build`
Expected: 0 errors。
手动（隔离 `--user-data-dir`）：添加 `每15天 洗床单`，确认进入「循环」栏并显示下次日期；把系统日期改到到期日（或临时把 `dueOn` 改成今天），确认同时出现在「今天」且加粗变色；勾掉后日期推进、回到循环栏；删除后两栏都不残留。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RecurringSection.tsx src/renderer/src/hooks/useTasks.ts src/renderer/src/App.tsx src/renderer/src/components/TaskList.tsx
git commit -m "feat: 新增循环板块并接入今天栏派生显示"
```

---

### Task 10: 编辑弹层支持循环天数

**Files:**
- Modify: `src/renderer/src/components/TaskEditor.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Produces: `TaskEditor` 的 `onSave(text: string, repeatDays: number | null): Promise<boolean>`。
- Consumes: `useTasks().saveTask`。

- [ ] **Step 1: 改 TaskEditor**

- 新增 state `repeatDraft`，初始值 `task.repeatDays?.toString() ?? ''`。
- **仅当 `task.doneAt === null` 时**渲染下面的循环输入行（已完成任务不显示，避免"完成 + 循环"的非法状态）。
- 文本域下方加一行：

```tsx
<label className="edit-repeat">
  <span>循环</span>
  <input
    type="number"
    min={1}
    max={365}
    step={1}
    placeholder="天"
    value={repeatDraft}
    onChange={(event) => setRepeatDraft(event.target.value)}
  />
  <span className="edit-repeat-hint">留空 = 不循环</span>
</label>
```

- 保存时：

```ts
const days = Number.parseInt(repeatDraft, 10)
const repeatDays =
  Number.isInteger(days) && days >= 1 && days <= 365 ? days : null
const ok = await onSave(draft, repeatDays)
```

- [ ] **Step 2: 改 App 保存路径**

`onSave={(text, repeatDays) => { const ok = await api.saveTask(editingTask.id, { text, repeatDays }); if (ok) setEditingTask(null); return ok }}`。

- [ ] **Step 3: 样式**

在编辑弹层样式区追加 `.edit-repeat`（横向 flex、gap 8px、12px、`--muted`）、数字输入沿用 `.reminder-editor input[type='time']` 的字段外观（可复制为 `.edit-repeat input`）。

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm run build`
Expected: 0 errors。
手动：普通任务填 15 后保存 → 进入循环栏；循环任务改 30 → 下次日期从今天重排；清空 → 变回「今天」普通任务；非法值（0、负数、>365）按不循环处理。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TaskEditor.tsx src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat: 编辑弹层支持设置与取消循环"
```

---

### Task 11: 文档与整体验证

> 版本号统一在自动更新计划的发布任务里升到 1.4.0，本任务不改 `package.json`。

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

- 功能列表加一条：循环任务（`每15天 洗床单`，独立板块，到期进入今天并突出，完成后从当天顺延）。
- 「已知限制」删掉「不支持重复任务」，改为「重复任务仅支持每 N 天，不支持每周 / 每月规则，到期不弹系统通知」。
- 数据说明如需提及新字段，加到 `data.json` 一行。

- [ ] **Step 2: 全量验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck 0 errors、全部测试通过、构建成功。

- [ ] **Step 3: 手动核对清单**

隔离 `--user-data-dir`：
1. 旧 `data.json`（无新字段）启动无报错、任务完整。
2. 浅色 / 深色下循环板块、突出样式、空状态。
3. 到期当天同时出现在「今天」「循环」；逾期仍突出。
4. 勾掉后日期推进；编辑改间隔 / 清空循环。
5. 窗口高度自适应，滚动正常。
6. 确认无系统通知。
7. 同时存在普通任务、带时间任务、已完成任务时排序正常。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: 补充循环任务说明"
```
