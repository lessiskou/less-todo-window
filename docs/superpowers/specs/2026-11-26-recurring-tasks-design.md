# 循环任务 — 设计

日期：2026-11-26

## 意图

用户有一部分任务是周期性重复的，例如"每 15 天洗一次床单"。现在只能靠人记，
做完就没了。需要让这类任务有一个固定的落脚处，到期自动冒到「今天」，勾掉后
自己排下一次，不需要手动重建。

这个应用刻意保持轻：没有历史、没有分类体系。循环任务也不能把它变重——用户要的
是"到日子了提醒我一下"，不是项目管理里的 recurrence rule。

## 目标

- 新增独立的「循环」板块，常驻显示所有循环任务，并标出每条的下次到期日。
- 到期日当天，循环任务同时出现在「今天」板块，并用字体颜色和字重突出。
- 在「今天」或「循环」里勾掉一条循环任务：不记为完成、不留下历史，而是把下次
  到期日推到"勾掉那天 + N 天"，任务回到「循环」板块。
- 逾期未勾的循环任务继续留在「今天」突出显示，直到被勾掉；不自动顺延、不消失。
- 通过快速添加语法 `每15天 洗床单` 或编辑弹层里的"循环天数"创建 / 修改 / 取消循环。
- 循环任务不弹系统通知、不参与提醒时间、不被拖拽移动、不出现在「以后」。
- 旧数据（没有新字段的任务）照常加载，不需要手动迁移。

## 非目标

- 不支持每周 / 每月 / 工作日 / "每月最后一天" 等日历规则，本期只有"每 N 天"。
- 不给循环任务做系统通知或声音提醒（到期只在列表里出现）。
- 不做循环任务的历史记录、完成统计、连续打卡。
- 不做子任务、标签、优先级。
- 不改窗口宽度、不新增独立窗口。

## 约束

- 小窗固定 320px 宽、无边框，高度由内容驱动、封顶屏幕工作区高度 45%。
- 数据存在 `%APPDATA%\less-todo-window\data.json`，`TaskData` 目前只有
  `tasks` 和 `lastRolloverDay`，没有版本号。
- 跨天结转会把已完成任务直接删除（`applyRollover` 里 `filter(doneAt === null)`），
  循环任务必须绕开这条销毁路径。
- 主进程每分钟跑一次 `rolloverIfNeeded()`，跨天时会广播全量任务；渲染层靠这次
  广播在午夜后重新计算"今天到期"。
- 渲染层没有测试环境（vitest 只跑 node 环境的纯函数），UI 只能手动运行 + 截图验证。

## 方案

数据只存一份：循环任务保留在 `tasks` 里，`list` 取新值 `'repeat'`，另存
`repeatDays`（间隔天数）和 `dueOn`（下次到期日，本地日期键）。「今天」板块在
渲染时动态把"循环里 `dueOn <= 今天`"的任务派生出来，不复制任务、不生成实例。

考虑过但未采用：

- **到期激活**：到期当天把任务改成 `list: 'today'`，完成后改回 `repeat` 并算下次日期。
  能复用今天栏现有逻辑，但每次跨天、改期都要维护状态迁移，容易出现"今天栏残留
  副本"的问题，测试面更大。
- **独立循环集合 + 每天生成今天副本**：最重，多一份数据要同步。除非以后要做循环
  通知或历史，现在不值得。

## 数据模型

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
  repeatDays: number | null   // 循环间隔天数；null 表示普通任务
  dueOn: string | null        // 下次到期日 'YYYY-MM-DD'（本地）；仅循环任务有值
}
```

- `repeatDays` 与 `dueOn` 在类型上是必填字段，但**旧数据没有**。`isTask` 允许两者为
  `undefined`；`TaskService` 加载后统一归一化为 `null`，之后内存与落盘都带这两个字段。
- 循环任务恒满足：`list === 'repeat'`、`repeatDays >= 1`、`dueOn !== null`、
  `reminderAt === null`、`notifiedAt === null`、`doneAt === null`。
- 到期判定用字符串比较即可：`dueOn <= localDayKey(now)`，日期键固定补零。

新增 `src/shared/recurrence.ts` 放纯函数：

```ts
export function addDaysToDayKey(dayKey: string, days: number): string
export function isRepeatDue(task: Task, todayKey: string): boolean
export function formatDueLabel(dayKey: string): string  // 'MM/DD'
```

`addDaysToDayKey` 用本地 `Date(y, m - 1, d + days)` 再格式化，避免 `Date.parse('YYYY-MM-DD')`
按 UTC 解析导致的跨时区偏移。

## 实现要点

### 1. `src/shared/types.ts`

- `List` 增加 `'repeat'`。
- `Task` 增加 `repeatDays`、`dueOn`。
- `QuickAddParse` 增加 `repeatDays: number | null`。

### 2. `src/shared/quickAdd.ts`

- 先匹配循环前缀，再走现有时间前缀：

  ```ts
  const REPEAT_PREFIX = /^(?:每\s*(\d{1,3})\s*天|每天)(?:\s+|$)/
  ```

  - `每15天 洗床单` → `repeatDays: 15`、`text: '洗床单'`。
  - `每天 喝水` → `repeatDays: 1`。
  - 和现有时间语法一致，单位后面必须是空格或输入结束；`每15天洗床单`（无空格）
    不识别，按普通文本处理，避免把"每天都要做的事"这类句子误判成循环任务。
  - 天数只接受 1–365；越界（如 `每0天`、`每999天`）不识别为循环前缀。
- 命中循环前缀后，剩余文字**原样作为任务文本，再解析时间前缀**。循环任务不设提醒，
  所以 `每15天 10:00 洗床单` 的任务文本是 `10:00 洗床单`，不会设 `reminderAt`。
- 未命中时，`repeatDays: null`，后续行为与现在完全一致。

### 3. `src/shared/rollover.ts`

- `applyRollover` 对 `list === 'repeat'` 的任务原样保留（只清 `notifiedAt`，其实恒为 null）。
  不参与"以后列表清提醒"和"过期提醒清除"的分支。
- 不做任何 `dueOn` 顺延：逾期未完成的循环任务保持原 `dueOn`，继续在「今天」显示。

### 4. `src/shared/taskOrder.ts`

- `groupTasks(tasks, todayKey)` 增加 `todayKey` 参数，返回 `{ today, repeat, later, done }`。
- `repeat`：`list === 'repeat' && doneAt === null`，按 `dueOn` 升序、同日期按 `createdAt` 升序。
- 到期的循环任务（`isRepeatDue`）派生进 `today`，**排在今天栏最前**（先于带时间的
  普通任务），同组按 `dueOn` 升序、`createdAt` 升序。
- 逾期任务因 `dueOn < todayKey` 同样落入 `today`，继续保持突出。
- `matchesSearch` 不变，循环任务靠文本匹配。

### 5. `src/main/taskService.ts`

- `isTask`：接受 `repeatDays` / `dueOn` 缺省；存在时校验 `repeatDays` 为正整数、
  `dueOn` 为字符串。加载后归一化补 `null`。
- `add(input)` 增加 `repeatDays?: number | null`：
  - 传了合法正数：`list: 'repeat'`、`dueOn = addDaysToDayKey(今天, N)`、
    `reminderAt: null`、`notifiedAt: null`。
  - 否则维持现有行为，写入 `repeatDays: null`、`dueOn: null`。
- `update(id, patch)` 增加 `repeatDays?: number | null`，但**只在值真正变化时**处理循环字段，
  文本编辑不产生副作用：
  - `patch.repeatDays` 缺省，或等于任务当前值（普通任务传 `null`、循环任务传同一个 N）：
    只更新文本 / 提醒，`list`、`dueOn` 不变。因此改「以后」任务的文字不会把它挪进「今天」，
    改循环任务的文字不会重排到期日（逾期任务不会因此从「今天」消失）。
  - 当前为 `null`、patch 为正数：转成循环，`list: 'repeat'`、`dueOn = 今天 + N`、
    `reminderAt: null`、`notifiedAt: null`。
  - 当前为正数、patch 为 `null`：转成普通任务，`list: 'today'`、`dueOn: null`、
    `repeatDays: null`，`reminderAt` 维持原值（通常为 null）。
  - 当前为 N、patch 为另一个正数 M：改间隔，`dueOn = 今天 + M`（从今天重排）。
  - 已完成任务（`doneAt !== null`）忽略 `repeatDays` 补丁，保持普通已完成任务状态；
    编辑弹层对已完成任务也不显示循环输入。
  - 对循环任务设置 `reminderAt` 的补丁直接忽略（UI 不提供，防御性处理）。
- `toggle(id)`：若 `repeatDays !== null`，不写 `doneAt`，而是
  `dueOn = addDaysToDayKey(今天, repeatDays)`、`doneAt: null`、`notifiedAt: null`。
  允许提前勾：在「循环」栏提前勾掉也按"今天 + N"重排，会让下次日期比原计划提前，
  这与"从完成日顺延"的定义一致。
- `move(id, list)`：循环任务直接抛错（`循环任务不能移动到其他列表`）。UI 不暴露入口，
  这里是防拖拽误触的兜底。
- `snooze`：循环任务没有提醒时间，不会被调用；保持现状即可。
- `remove`：行为不变，循环任务同样直接删除。

### 6. `src/shared/ipc.ts`、`src/main/ipc.ts`、`src/preload/index.ts`

- `addTask` 入参增加 `repeatDays?: number | null`。
- `updateTask` patch 增加 `repeatDays?: number | null`。
- IPC 通道不变，preload 原样转发。

### 7. `src/renderer/src/hooks/useTasks.ts`

- `add`：把 `parseQuickAdd` 返回的 `repeatDays` 传给 `addTask`；命中循环时提示
  `已设循环：每 N 天`，不再提示提醒时间。
- 暴露 `repeat` 分组；`groupTasks` 调用时传 `localDayKey(new Date())`。
  午夜刷新依赖主进程跨天广播触发重渲染。
- 编辑保存改成同时提交文本与循环天数：
  `saveTask(id, { text, repeatDays })`（由现有 `updateText` 扩展或新增方法）。

### 8. `src/renderer/src/components/TaskRow.tsx`

- 增加 `variant?: 'default' | 'repeat'`（默认 `'default'`）。
- 循环任务（`task.repeatDays !== null`）：
  - 不可拖拽（`draggable={false}`）。
  - 不显示提醒铃铛、移动到今天 / 以后按钮；保留勾选与删除。
  - 勾选框语义是"这次做完了"，触发重排而非标记完成。
  - 双击仍可打开编辑弹层。
- `variant === 'repeat'`：文字下方（或行尾）显示 `每 N 天 · 下次 M/D`；到期的加
  `is-recurring` 突出样式。
- `variant === 'default'` 且是循环任务（即渲染在「今天」的到期条目）：左侧时间位
  显示"循环"标签，文字加 `is-recurring` 样式（`color: var(--accent)`、
  `font-weight: 600`），与现有 `is-highlighted`（通知脉冲）互不影响。

### 9. 新增 `src/renderer/src/components/RecurringSection.tsx`

- 结构照 `LaterSection.tsx`：折叠头 + 计数 + 列表。
- **默认展开**（这是新需求的落脚点，需要一眼看到下次日期）；搜索时强制展开。
- 空状态提示：`还没有循环任务，输入 每15天 洗床单 添加`。
- 列表项传 `variant="repeat"`，不参与拖拽 / 放下。

### 10. `src/renderer/src/App.tsx`

- 把 `api.repeat` 渲染在 `TaskList`（今天）与 `LaterSection`（以后）之间。
- 搜索时对 `repeat` 也走 `matchesSearch`。
- 编辑弹层保存时同时提交文本与循环天数。

### 11. `src/renderer/src/components/TaskEditor.tsx`

- 文本域下方新增一行"循环"：数字输入（单位天，1–365，留空表示不循环），
  旁边小字提示"留空 = 不循环"。
- **已完成任务不显示这一行**（`task.doneAt !== null`），避免制造"完成 + 循环"的非法状态。
- `onSave(text, repeatDays)`，`repeatDays` 为空或非法时为 `null`；服务层会按值是否变化
  决定是否改循环字段，所以原样提交当前值不会造成副作用。
- 面板高度自适应逻辑不变；新增一行由现有 `ResizeObserver` 自然撑高窗口。

### 12. `src/renderer/src/styles.css`

- `.row.is-recurring .text { color: var(--accent); font-weight: 600; }`
- 循环元信息（`每 N 天 · 下次 M/D`）用现有 `--muted`、11.5px。
- 「今天」里的"循环"标签沿用 `.time` 定位，颜色用 `--accent`。
- 深浅色都用现有变量，不新增硬编码颜色。

### 13. `README.md`

- 功能列表新增一条循环任务说明。
- "已知限制"里删掉"不支持重复任务"，改成"重复任务仅支持每 N 天，不含每周 / 每月规则，
  且到期不弹系统通知"。

## 交互与边界（默认决定）

- **首次到期日**：新建时 = 创建当天 + N 天。刚做完的事不会立刻又出现。
- **提前勾选**：在「循环」栏勾掉未到期任务，下次日期 = 今天 + N（可能提前于原日期）。
- **逾期**：`dueOn` 早于今天时一直留在「今天」突出显示，直到勾掉；跨天不会自动重排。
- **改间隔**：在编辑弹层把 15 改成 30，从今天起重新算下次到期日；清空则变成普通
  「今天」任务。
- **重复出现**：到期当天，同一任务会同时出现在「今天」和「循环」两栏，这是预期行为，
  不是数据副本。
- **计数**：标题栏的"今天"计数包含到期循环任务。
- **通知**：循环任务不参与 `ReminderScheduler`，不弹系统通知、不响铃、不参与高亮脉冲。
- **移除循环**：删除按钮直接删掉任务；编辑里清空天数才是"转成普通任务"。

## 验证

- `npm run typecheck`、`npm test`。
- 新增 / 更新单元测试：
  - `recurrence`：`addDaysToDayKey` 跨月 / 跨年 / 闰年；`isRepeatDue` 的当天、逾期、未到期。
  - `quickAdd`：`每15天 洗床单`、`每天 喝水`、无空格不识别、越界天数、与时间前缀共存。
  - `taskOrder`：到期循环进今天且置顶、未到期只在循环栏、循环栏排序。
  - `rollover`：循环任务跨天原样保留，逾期 `dueOn` 不变。
  - `taskService`：新建算首日、勾选重排、改间隔、清空转普通、移动抛错、旧数据归一化。
  - `ipcHandlers`：patch 透传 `repeatDays`。
- 用隔离 `--user-data-dir` 的构建版手动核对：浅色 / 深色下的循环板块与突出样式、
  到期当天同时出现在两栏、勾掉后日期推进、逾期仍显示、编辑改 / 清循环、窗口高度自适应、
  旧 `data.json` 加载无报错、不弹系统通知。

## 留给实现者

- 「循环」板块折叠头的文案、计数样式、空状态排版。
- 到期日标签显示 `M/D` 还是带"下次"前缀等文案细节。
- 编辑弹层里数字输入的宽度、步进与非法值提示方式（可在保存时静默按不循环处理）。
- 是否需要在窗口隐藏跨过午夜后、显示时立即重新计算（当前依赖主进程每分钟广播）。
- 循环任务行是否显示"已逾期 X 天"之类的附加信息（本期可不做）。
