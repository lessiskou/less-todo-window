# less-todo-window 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 Windows 桌面置顶小窗待办工具：今天/以后两列表、随手添加、到点通知、跨天结转、数据本地持久化。

**Architecture:** Electron 主进程持有任务数据、设置与提醒调度；渲染进程（React）只负责界面，通过类型化 preload 桥（contextBridge + IPC）读写。纯逻辑（时间解析、排序、跨天结转、到期计算、数据文件读写）放在 `src/shared` 与 `src/main` 可单测的模块中，用 Vitest 覆盖；界面按设计文档手动验收。

**Tech Stack:** Electron（最新稳定版）、electron-vite、React 18、TypeScript、Vitest、electron-builder（NSIS）、pngjs（仅用于生成图标）。

**Spec:** `docs/superpowers/specs/2026-11-18-less-todo-window-design.md`（执行者必须同时阅读）

## Global Constraints

- 目标平台：Windows 10/11；界面文案与提示一律简体中文。
- 本机只有 Node 22（npm 可用，无 pnpm/Rust/.NET）。
- 单用户、纯本地；**不得发起任何网络请求**；数据存 `app.getPath('userData')`（即 `%APPDATA%/less-todo-window/`）。
- 窗口宽度固定 320px，高度随内容自适应，上限为屏幕工作区高度的 45%；只记忆位置 `{x, y}`，不记忆尺寸。
- `alwaysOnTop` 默认开启，层级 `floating`；`frame: false`、`transparent: true`、`resizable: false`、`skipTaskbar: true`。
- 安全配置固定：渲染进程 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；所有能力只经 preload 暴露。
- 提醒只属于 `list: 'today'` 的任务；`later` 任务的 `reminderAt` 恒为 `null`。
- 所有时间以 ISO 8601 字符串存储（UTC），展示与"今天"的判断一律用本地时间。
- 数据写入必须原子（临时文件 + rename）并保留 3 份备份。
- 提醒误差 < 5 秒；同一批到期任务合并为一条通知；重启后同一条提醒不重复弹通知。
- 已完成任务在跨天结转时直接删除，不保留历史。
- v1 只产出 NSIS 安装包，不做便携版、不做自动更新。
- 每个任务结束必须 `npm run typecheck && npm test` 通过后单独提交。

**目录约定**（Task 1 建立，后续任务只增不改路径）：

```
src/shared/        纯类型与纯函数（types.ts, quickAdd.ts, taskOrder.ts, rollover.ts, reminders.ts, ipc.ts）
src/main/          主进程（index.ts, window.ts, tray.ts, ipc.ts, store.ts, taskService.ts, settingsService.ts, scheduler.ts, notifications.ts, icons/）
src/preload/       index.ts（contextBridge 暴露 RendererApi）
src/renderer/      index.html, src/main.tsx, src/App.tsx, src/components/*, src/styles.css
resources/         生成的 icon.png / tray.png
tests/unit/        Vitest 用例
docs/superpowers/  设计与计划文档
```

## Review Focus

以下五类输入/状况设计文档没有逐条写明，但最可能被真实使用击中；各自归入对应任务的测试：

1. **长得像时间但不是提醒的输入**（`12:30`、`10点`、`25:00 开会`）——不能被吞掉或误设提醒；逐字保留文本。→ Task 2
2. **数据文件损坏或半写**（断电、手工编辑、磁盘满）——必须回退到备份并提示，不得崩溃、不得静默清空。→ Task 5
3. **时钟调整、系统睡眠跨午夜**——不得产生过期通知或重复通知。→ Task 4、Task 8
4. **重启/隐藏窗口后的重复通知**——`notifiedAt` 必须真正阻止同一提醒再次弹出。→ Task 8
5. **多显示器断开或分辨率变化**——窗口必须被钳制回可见区域。→ Task 9

另有一项界面类：超长文本与粘贴进来的换行不得撑破 320px 窗口（最多两行省略，悬停显示全文）→ Task 10 手动验收。

---

### Task 1: 项目脚手架与可启动的空窗口

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`

**Interfaces:**
- Produces: npm 脚本 `dev` / `build` / `typecheck` / `test` / `build:win`；`npm run dev` 能打开一个 320px 宽的置顶空窗口。

- [ ] **Step 1: 初始化包与依赖**

```bash
npm init -y
npm i -D electron electron-vite vite typescript @vitejs/plugin-react vitest @types/node @types/react @types/react-dom electron-builder pngjs
npm i react react-dom
```

`package.json` 中设置 `"name": "less-todo-window"`、`"main": "./out/main/index.js"`、`"type": "commonjs"`，并添加脚本：

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "gen:icons": "node scripts/gen-icons.mjs",
    "build:win": "npm run gen:icons && electron-vite build && electron-builder --win nsis"
  }
}
```

- [ ] **Step 2: 写构建与测试配置**

`electron.vite.config.ts`：使用 `main`、`preload`、`renderer` 三段配置，renderer 根目录 `src/renderer`、入口 `src/renderer/index.html`、启用 `@vitejs/plugin-react`；main/preload 的 `build.rollupOptions.input` 指向各自 `index.ts`。
`vitest.config.ts`：`include: ['tests/**/*.test.ts']`，`environment: 'node'`。
三个 tsconfig：node 覆盖 `src/main`、`src/preload`、`src/shared`、`tests`；web 覆盖 `src/renderer`、`src/shared`；均 `"strict": true`。
`.gitignore`：`node_modules/`、`out/`、`dist/`、`*.log`。

- [ ] **Step 3: 最小主进程与窗口**

`src/main/index.ts` 在 `app.whenReady()` 后创建：

```ts
new BrowserWindow({
  width: 320, height: 420, show: false, frame: false, transparent: true,
  resizable: false, skipTaskbar: true, alwaysOnTop: true,
  webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
})
```

窗口加载 renderer（开发用 `process.env['ELECTRON_RENDERER_URL']`，否则 `loadFile(join(__dirname, '../renderer/index.html'))`），`ready-to-show` 后显示并 `setAlwaysOnTop(true, 'floating')`。`src/preload/index.ts` 暂时为空壳（暴露空对象）。

- [ ] **Step 4: 最小界面**

`App.tsx` 渲染一个占满窗口的圆角卡片，内容为"今天"标题；`styles.css` 设置 `html, body { background: transparent; overflow: hidden }`，`.card { border-radius: 12px; }`，头部 `-webkit-app-region: drag`。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm run dev`
Expected: 无类型错误；出现 320px 宽、无边框、置顶的圆角空窗口。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: scaffold electron-vite react app with always-on-top window"
```

---

### Task 2: 共享类型与快速添加解析（TDD）

**Files:**
- Create: `src/shared/types.ts`, `src/shared/quickAdd.ts`
- Test: `tests/unit/quickAdd.test.ts`

**Interfaces:**
- Produces:
  - `type List = 'today' | 'later'`
  - `interface Task { id: string; text: string; list: List; createdAt: string; doneAt: string | null; reminderAt: string | null; notifiedAt: string | null }`
  - `interface Settings { bounds: { x: number; y: number } | null; opacity: number; alwaysOnTop: boolean; autostart: boolean }`
  - `const DEFAULT_SETTINGS: Settings`
  - `interface QuickAddParse { text: string; reminderAt: string | null; timeWasPast: boolean }`
  - `parseQuickAdd(raw: string, now: Date): QuickAddParse`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../../src/shared/quickAdd';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m); // 2026-11-18 本地时间
const todayAt = (h: number, m = 0) => new Date(2026, 10, 18, h, m).toISOString();

describe('parseQuickAdd', () => {
  it('解析 10:00 前缀并只保留任务文字', () => {
    expect(parseQuickAdd('10:00 交周报', at(9))).toEqual({ text: '交周报', reminderAt: todayAt(10), timeWasPast: false });
  });
  it('解析中文“点/分/半”', () => {
    expect(parseQuickAdd('22点 交周报', at(9)).reminderAt).toBe(todayAt(22));
    expect(parseQuickAdd('10点30分 开会', at(9)).reminderAt).toBe(todayAt(10, 30));
    expect(parseQuickAdd('10点半 开会', at(9)).reminderAt).toBe(todayAt(10, 30));
  });
  it('时间已过时不设提醒但保留文字并标记 timeWasPast', () => {
    expect(parseQuickAdd('10:00 交周报', at(15))).toEqual({ text: '交周报', reminderAt: null, timeWasPast: true });
  });
  it('只有时间没有文字时按纯文本保留', () => {
    expect(parseQuickAdd('10:00', at(9))).toEqual({ text: '10:00', reminderAt: null, timeWasPast: false });
  });
  it('非法时间与非时间输入原样保留', () => {
    expect(parseQuickAdd('25:00 开会', at(9))).toEqual({ text: '25:00 开会', reminderAt: null, timeWasPast: false });
    expect(parseQuickAdd('买牛奶', at(9))).toEqual({ text: '买牛奶', reminderAt: null, timeWasPast: false });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/quickAdd.test.ts`
Expected: FAIL，找不到 `src/shared/quickAdd`。

- [ ] **Step 3: 实现**

在 `src/shared/types.ts` 定义上面的类型与 `DEFAULT_SETTINGS = { bounds: null, opacity: 1, alwaysOnTop: true, autostart: false }`。
在 `src/shared/quickAdd.ts` 实现：先 `trim()`；时间前缀只匹配两种形式——`^(\d{1,2})[:：](\d{2})(?:\s+|$)` 与 `^(\d{1,2})\s*点(?:\s*(半|\d{1,2})\s*分?)?(?:\s+|$)`；冒号形式的分钟必须是 0–59，小时 0–23；中文形式的"半"=30 分。剩余文字为空则视为解析失败、整串原样返回。解析成功则用 `new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)` 得到本地今天的时间：若 `<= now` 返回 `{ text, reminderAt: null, timeWasPast: true }`，否则 `reminderAt` 为该时间 `toISOString()`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/quickAdd.test.ts`
Expected: 5 个用例全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared tests/unit/quickAdd.test.ts
git commit -m "feat: add shared types and quick-add time parser"
```

---

### Task 3: 排序与搜索（TDD）

**Files:**
- Create: `src/shared/taskOrder.ts`
- Test: `tests/unit/taskOrder.test.ts`

**Interfaces:**
- Produces:
  - `interface TaskGroups { today: Task[]; later: Task[]; done: Task[] }`
  - `groupTasks(tasks: Task[]): TaskGroups` —— `today` 与 `later` 只含未完成；`done` 含两个列表中所有已完成。
  - `matchesSearch(task: Task, query: string): boolean` —— 去空格、大小写不敏感的子串匹配；空查询恒为 `true`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { groupTasks, matchesSearch } from '../../src/shared/taskOrder';
import type { Task } from '../../src/shared/types';

const t = (patch: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), text: 'x', list: 'today', createdAt: '2026-11-18T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null, ...patch
});

describe('groupTasks', () => {
  it('今天：有提醒的按时间升序在前，其余按创建升序，已完成排最后且单独分组', () => {
    const a = t({ text: '无时间A', createdAt: '2026-11-18T01:00:00.000Z' });
    const b = t({ text: '十点', reminderAt: '2026-11-18T02:00:00.000Z', createdAt: '2026-11-18T03:00:00.000Z' });
    const c = t({ text: '九点', reminderAt: '2026-11-18T01:00:00.000Z', createdAt: '2026-11-18T04:00:00.000Z' });
    const d = t({ text: '做完了', doneAt: '2026-11-18T05:00:00.000Z' });
    const g = groupTasks([a, b, c, d]);
    expect(g.today.map(x => x.text)).toEqual(['九点', '十点', '无时间A']);
    expect(g.done.map(x => x.text)).toEqual(['做完了']);
  });
  it('以后按创建顺序，两个列表的已完成都进 done', () => {
    const l1 = t({ list: 'later', text: 'L1', createdAt: '2026-11-18T02:00:00.000Z' });
    const l2 = t({ list: 'later', text: 'L2', createdAt: '2026-11-18T01:00:00.000Z' });
    const ld = t({ list: 'later', text: 'LD', doneAt: '2026-11-18T06:00:00.000Z' });
    const g = groupTasks([l1, l2, ld]);
    expect(g.later.map(x => x.text)).toEqual(['L2', 'L1']);
    expect(g.done.map(x => x.text)).toEqual(['LD']);
  });
});

describe('matchesSearch', () => {
  it('大小写不敏感并按子串匹配；空查询恒真', () => {
    expect(matchesSearch(t({ text: 'Reply to Client' }), 'client')).toBe(true);
    expect(matchesSearch(t({ text: 'Reply to Client' }), '  reply ')).toBe(true);
    expect(matchesSearch(t({ text: 'Reply to Client' }), 'milk')).toBe(false);
    expect(matchesSearch(t({ text: 'Reply to Client' }), '')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/taskOrder.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`groupTasks` 用稳定排序：未完成今天任务分两组（有 `reminderAt` 的按 ISO 字符串升序，无时间的按 `createdAt` 升序），拼接；`later` 未完成按 `createdAt` 升序；`done` 为所有 `doneAt !== null` 按 `doneAt` 升序。`matchesSearch` 对双方 `trim().toLowerCase()` 后 `includes`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/taskOrder.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared/taskOrder.ts tests/unit/taskOrder.test.ts
git commit -m "feat: add task grouping and search helpers"
```

---

### Task 4: 跨天结转（TDD）

**Files:**
- Create: `src/shared/rollover.ts`
- Test: `tests/unit/rollover.test.ts`

**Interfaces:**
- Produces:
  - `localDayKey(now: Date): string` —— 本地日期 `YYYY-MM-DD`。
  - `applyRollover(tasks: Task[], now: Date, lastDay: string | null): { tasks: Task[]; day: string; rolled: boolean }`
  - 规则：`lastDay === localDayKey(now)` 时原样返回、`rolled: false`。否则返回新数组：删除所有 `doneAt !== null` 的任务；对未完成任务，`reminderAt` 不晚于 `now` 的清空 `reminderAt` 与 `notifiedAt`，未来提醒保留；`later` 任务的 `reminderAt`/`notifiedAt` 一律置 `null`。所有未完成任务的 `list` 保持不变（今天未完成继续留在今天）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { applyRollover, localDayKey } from '../../src/shared/rollover';
import type { Task } from '../../src/shared/types';

const t = (patch: Partial<Task>): Task => ({
  id: '1', text: 'x', list: 'today', createdAt: '2026-11-17T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null, ...patch
});
const now = new Date(2026, 10, 18, 8, 0); // 2026-11-18 08:00 本地

describe('applyRollover', () => {
  it('同一天不做任何改动', () => {
    const tasks = [t({ doneAt: '2026-11-18T02:00:00.000Z' })];
    const r = applyRollover(tasks, now, localDayKey(now));
    expect(r.rolled).toBe(false);
    expect(r.tasks).toBe(tasks);
  });
  it('跨天：删除已完成，未完成（含昨天没做完的）留在今天，以后列表原样保留', () => {
    const tasks = [
      t({ id: 'done', doneAt: '2026-11-17T02:00:00.000Z' }),
      t({ id: 'open', text: '没做完' }),
      t({ id: 'later', list: 'later', text: '以后再做' })
    ];
    const r = applyRollover(tasks, now, '2026-11-17');
    expect(r.rolled).toBe(true);
    expect(r.day).toBe('2026-11-18');
    expect(r.tasks.map(x => x.id)).toEqual(['open', 'later']);
    expect(r.tasks[0].list).toBe('today');
  });
  it('跨天：过期提醒清除，未来提醒保留且 notifiedAt 清空', () => {
    const past = t({ id: 'past', reminderAt: '2026-11-17T23:00:00.000Z', notifiedAt: '2026-11-17T23:00:00.000Z' });
    const future = t({ id: 'future', reminderAt: new Date(2026, 10, 18, 20, 0).toISOString(), notifiedAt: '2026-11-17T23:00:00.000Z' });
    const later = t({ id: 'later', list: 'later', reminderAt: '2026-11-17T23:00:00.000Z' });
    const r = applyRollover([past, future, later], now, '2026-11-17');
    expect(r.tasks.find(x => x.id === 'past')!.reminderAt).toBeNull();
    expect(r.tasks.find(x => x.id === 'past')!.notifiedAt).toBeNull();
    expect(r.tasks.find(x => x.id === 'future')!.reminderAt).not.toBeNull();
    expect(r.tasks.find(x => x.id === 'later')!.reminderAt).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/rollover.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

按 Interfaces 中的规则返回新对象，不修改入参数组与任务对象（用展开复制）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/rollover.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared/rollover.ts tests/unit/rollover.test.ts
git commit -m "feat: add day rollover logic"
```

---

### Task 5: 本地 JSON 存储（原子写入 + 备份 + 损坏回退）

**Files:**
- Create: `src/main/store.ts`
- Test: `tests/unit/store.test.ts`

**Interfaces:**
- Produces:
  - `class JsonStore<T> { constructor(filePath: string, fallback: () => T); load(): T; save(data: T): void; loadWarning(): string | null }`
  - 文件格式 `{ "version": 1, "data": T }`；备份为 `data.json.bak1..bak3`（`bak1` 最新）。
  - `load()`：主文件缺失 → 返回 `fallback()`；主文件损坏 → 依次尝试 `bak1..bak3`，取首个可用并在 `loadWarning()` 给出一句中文提示（如 `数据文件损坏，已从备份恢复`）；全部不可用 → 返回 `fallback()` 并提示。`loadWarning()` 返回最近一次 `load()` 的提示或 `null`。
  - `save(data)`：若主文件存在，先轮转备份（`bak2→bak3`、`bak1→bak2`、主文件→`bak1`）；再写入同目录临时文件 `data.json.tmp` 后 rename 覆盖主文件。写失败时抛出错误，主文件保持原样。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../../src/main/store';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'store-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('JsonStore', () => {
  it('保存后可重新读取', () => {
    const p = join(dir, 'data.json');
    new JsonStore<{ n: number }>(p, () => ({ n: 0 })).save({ n: 42 });
    expect(new JsonStore<{ n: number }>(p, () => ({ n: 0 })).load()).toEqual({ n: 42 });
  });
  it('主文件损坏时回退到最新备份并给出提示', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 });
    writeFileSync(p, '{ broken', 'utf8');
    const r = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    expect(r.load()).toEqual({ n: 1 });
    expect(r.loadWarning()).toContain('备份');
  });
  it('轮转保留三份备份且不留临时文件', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 }); s.save({ n: 3 }); s.save({ n: 4 });
    expect(existsSync(p + '.tmp')).toBe(false);
    expect(existsSync(p + '.bak3')).toBe(true);
    expect(JSON.parse(readFileSync(p + '.bak1', 'utf8')).data).toEqual({ n: 3 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/store.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

用 `node:fs` 同步 API（数据量小）。备份轮转前先删除 `bak3`，再按 `bak2→bak3`、`bak1→bak2`、主文件→`bak1` 顺序 `renameSync`（源不存在则跳过）。写入 `JSON.stringify({ version: 1, data }, null, 2)`，`renameSync(tmp, filePath)`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/store.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/store.ts tests/unit/store.test.ts
git commit -m "feat: add atomic json store with backups"
```

---

### Task 6: 任务服务（数据变更的唯一入口）

**Files:**
- Create: `src/main/taskService.ts`
- Test: `tests/unit/taskService.test.ts`

**Interfaces:**
- Consumes: `Task`、`List`、`applyRollover`、`JsonStore`。
- Produces:

```ts
class TaskService {
  constructor(store: JsonStore<{ tasks: Task[] }>, now?: () => Date);
  getAll(): Task[];
  add(input: { text: string; list?: List; reminderAt?: string | null }): Task; // 默认 list:'today'，text 去首尾空格
  update(id: string, patch: { text?: string; reminderAt?: string | null }): Task;
  toggle(id: string): Task;      // doneAt=now / null
  move(id: string, list: List): Task; // 移到 later 时 reminderAt、notifiedAt 置 null
  remove(id: string): void;
  snooze(id: string, minutes: number): Task; // reminderAt = now+minutes，notifiedAt = null
  markNotified(ids: string[], at: Date): void;
  rolloverIfNeeded(): boolean;   // 跨天则应用 applyRollover 并持久化，返回是否发生了结转
  onChange(cb: (tasks: Task[]) => void): void;
}
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../../src/main/taskService';
import type { JsonStore } from '../../src/main/store';
import type { Task } from '../../src/shared/types';

const fakeStore = () => {
  let data: { tasks: Task[]; lastRolloverDay: string | null } = { tasks: [], lastRolloverDay: '2026-11-18' };
  const s = { load: () => data, save: (d: typeof data) => { data = d; }, loadWarning: () => null };
  return { store: s as unknown as JsonStore<typeof data>, get: () => data };
};

let svc: TaskService; let st: ReturnType<typeof fakeStore>;
const now = new Date(2026, 10, 18, 9, 0);

beforeEach(() => {
  st = fakeStore();
  svc = new TaskService(st.store, () => now);
  svc.getAll();
});

describe('TaskService', () => {
  it('添加默认进今天并持久化', () => {
    const task = svc.add({ text: '  买牛奶  ' });
    expect(task.list).toBe('today');
    expect(task.text).toBe('买牛奶');
    expect(st.get().tasks).toHaveLength(1);
  });
  it('移到以后会清空提醒', () => {
    const t = svc.add({ text: 'x', reminderAt: '2026-11-18T02:00:00.000Z' });
    const m = svc.move(t.id, 'later');
    expect(m.list).toBe('later');
    expect(m.reminderAt).toBeNull();
    expect(m.notifiedAt).toBeNull();
  });
  it('勾选与取消勾选设置 doneAt', () => {
    const t = svc.add({ text: 'x' });
    expect(svc.toggle(t.id).doneAt).toBe(now.toISOString());
    expect(svc.toggle(t.id).doneAt).toBeNull();
  });
  it('稍后提醒改写时间并清空 notifiedAt', () => {
    const t = svc.add({ text: 'x', reminderAt: '2026-11-18T01:00:00.000Z' });
    svc.markNotified([t.id], now);
    const s = svc.snooze(t.id, 10);
    expect(s.reminderAt).toBe(new Date(now.getTime() + 10 * 60000).toISOString());
    expect(s.notifiedAt).toBeNull();
  });
  it('跨天结转每天只执行一次', () => {
    expect(svc.rolloverIfNeeded()).toBe(false);
    const later = new Date(2026, 10, 19, 8, 0);
    const svc2 = new TaskService(st.store, () => later);
    expect(svc2.rolloverIfNeeded()).toBe(true);
    expect(svc2.rolloverIfNeeded()).toBe(false);
  });
});
```

> 注：`TaskService` 的存储类型是 `JsonStore<{ tasks: Task[]; lastRolloverDay: string | null }>`；构造函数 `load()` 后若 `lastRolloverDay` 缺失则按 `null` 处理。`rolloverIfNeeded()` 在 `lastRolloverDay` 为 `null` 时也执行一次结转（空数据无副作用）并把当天写入存储。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/taskService.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

构造时 `load()` 读入内存；每次变更都生成新数组、调用 `store.save({ tasks, lastRolloverDay })`，再依次通知 `onChange` 订阅者。`add` 生成 `id` 用 `crypto.randomUUID()`。`update` 对不存在的 id 抛出 `Error('任务不存在')`。`toggle` 完成时 `doneAt = now().toISOString()`，取消时 `null`。`markNotified` 批量设置 `notifiedAt = at.toISOString()`。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/taskService.test.ts`
Expected: 5 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/taskService.ts tests/unit/taskService.test.ts
git commit -m "feat: add task service with all mutations"
```

---

### Task 7: IPC 与 preload 桥

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/main/settingsService.ts`
- Modify: `src/preload/index.ts`, `src/main/index.ts`
- Test: `tests/unit/ipcHandlers.test.ts`

**Interfaces:**
- Consumes: `TaskService`、`JsonStore`、`Settings`。
- Produces:
  - `interface RendererApi`（见下）与 `declare global { interface Window { api: RendererApi } }`。
  - `registerIpc(service: TaskService, settings: SettingsService, deps: { showWindow(): void; hideWindow(): void; resizeWindow(height: number): void }): void`
  - `SettingsService { get(): Settings; update(patch: Partial<Settings>): Settings; onChange(cb): void }`（存于 `settings.json`，`JsonStore`，缺省 `DEFAULT_SETTINGS`；`update` 合并后持久化）。
  - 频道常量：`IPC.tasksGet`、`tasksAdd`、`tasksUpdate`、`tasksToggle`、`tasksMove`、`tasksRemove`、`tasksSnooze`、`settingsGet`、`settingsUpdate`、`windowHide`、`windowSetHeight`、`tasksChanged`（主→渲染）、`tasksHighlight`（主→渲染）、`dataWarning`（主→渲染）。

```ts
export interface RendererApi {
  getTasks(): Promise<Task[]>;
  addTask(input: { text: string; list?: List; reminderAt?: string | null }): Promise<Task>;
  updateTask(id: string, patch: { text?: string; reminderAt?: string | null }): Promise<Task>;
  toggleTask(id: string): Promise<void>;
  moveTask(id: string, list: List): Promise<Task>;
  removeTask(id: string): Promise<void>;
  snoozeTask(id: string, minutes: number): Promise<Task>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  hideWindow(): Promise<void>;
  setContentHeight(height: number): Promise<void>;
  onTasksChanged(cb: (tasks: Task[]) => void): () => void;
  onHighlight(cb: (ids: string[]) => void): () => void;
  onDataWarning(cb: (message: string) => void): () => void;
}
```

- [ ] **Step 1: 写失败测试（处理函数层，不启动 Electron）**

把每个频道的处理逻辑写成可导出的纯函数集合：

```ts
export function createHandlers(service: TaskService, settings: SettingsService) { return { ... } }
```

测试用假的 service/settings，断言：`tasksAdd` 返回新任务；`tasksMove` 传 `later` 时调用 service.move；`settingsUpdate` 合并 opacity；未知 id 时上层 IPC 包装会 reject（此层只测正常路径）。

Run: `npx vitest run tests/unit/ipcHandlers.test.ts` → 先 FAIL。

- [ ] **Step 2: 实现 `createHandlers` 与 `registerIpc`**

`registerIpc` 用 `ipcMain.handle` 逐个注册；`service.onChange(tasks => BrowserWindow.getAllWindows().forEach(w => w.webContents.send(IPC.tasksChanged, tasks)))`。`windowSetHeight` 调用 `deps.resizeWindow(height)`。

- [ ] **Step 3: preload 实现 RendererApi**

`contextBridge.exposeInMainWorld('api', {...})`：请求类用 `ipcRenderer.invoke`；订阅类用 `ipcRenderer.on` 并返回取消函数（移除同一 listener）。

- [ ] **Step 4: 主进程接线**

创建 `JsonStore<{tasks;lastRolloverDay}>` 与 `SettingsService`，构造 `TaskService`，调用 `registerIpc(...)`，`hideWindow` 隐藏窗口，`resizeWindow` 为 `win.setBounds({ height: clamp(160, height, 0.45*workAreaHeight) })`（宽度保持 320）。

- [ ] **Step 5: 验证并提交**

Run: `npm run typecheck && npm test`
Expected: 全部通过；在 dev 窗口 DevTools 中 `await window.api.getTasks()` 返回 `[]`。

```bash
git add -A
git commit -m "feat: wire typed ipc bridge between main and renderer"
```

---

### Task 8: 提醒调度与通知

**Files:**
- Create: `src/shared/reminders.ts`, `src/main/scheduler.ts`, `src/main/notifications.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/reminders.test.ts`

**Interfaces:**
- Consumes: `TaskService`、`IPC.tasksHighlight`。
- Produces:
  - `collectDueTasks(tasks: Task[], now: Date): Task[]` —— `list==='today'`、`doneAt===null`、`reminderAt!==null`、`reminderAt <= now`、`notifiedAt===null`。
  - `nextReminderTime(tasks: Task[], now: Date): number | null` —— 满足同上条件但 `reminderAt > now` 的最早时间戳（毫秒）。
  - `class ReminderScheduler { constructor(deps: SchedulerDeps); start(): void; reschedule(): void; fireDue(): void; stop(): void }`
  - `SchedulerDeps { getTasks(): Task[]; now(): Date; markNotified(ids: string[], at: Date): void; notify(tasks: Task[]): void; onFired(ids: string[]): void }`
  - `showReminders(tasks: Task[], onActivate: (ids: string[]) => void): void`（`notifications.ts`，封装 Electron `Notification`）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { collectDueTasks, nextReminderTime } from '../../src/shared/reminders';
import type { Task } from '../../src/shared/types';

const base: Omit<Task, 'id'> = { text: 'x', list: 'today', createdAt: '2026-11-18T00:00:00.000Z', doneAt: null, reminderAt: null, notifiedAt: null };
const now = new Date(2026, 10, 18, 10, 0);
const iso = (h: number, m = 0) => new Date(2026, 10, 18, h, m).toISOString();

describe('reminders', () => {
  it('只收集今天、未完成、到点且未通知过的任务', () => {
    const due = { ...base, id: 'due', reminderAt: iso(9) };
    const notYet = { ...base, id: 'notYet', reminderAt: iso(11) };
    const already = { ...base, id: 'already', reminderAt: iso(9), notifiedAt: iso(9) };
    const done = { ...base, id: 'done', reminderAt: iso(9), doneAt: iso(9, 30) };
    const later = { ...base, id: 'later', list: 'later' as const, reminderAt: iso(9) };
    expect(collectDueTasks([due, notYet, already, done, later], now).map(t => t.id)).toEqual(['due']);
  });
  it('重启后：notifiedAt 已设置的任务不会再到期', () => {
    const t = { ...base, id: 'fired', reminderAt: iso(9), notifiedAt: iso(9) };
    expect(collectDueTasks([t], now)).toEqual([]);
    expect(nextReminderTime([t], now)).toBeNull();
  });
  it('返回最早的未来提醒时间', () => {
    const a = { ...base, id: 'a', reminderAt: iso(12) };
    const b = { ...base, id: 'b', reminderAt: iso(11) };
    expect(nextReminderTime([a, b], now)).toBe(new Date(2026, 10, 18, 11).getTime());
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/reminders.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现纯函数与调度器**

`ReminderScheduler.reschedule()`：`clearTimeout`，用 `nextReminderTime` 算下一次，`setTimeout(() => this.fireDue(), max(0, next - now))`（单个定时器即可）；`fireDue()`：取 `collectDueTasks`，非空则 `markNotified(ids, now)`、`notify(tasks)`、`onFired(ids)`，最后 `reschedule()`；数据变化（`service.onChange`）与 `powerMonitor.on('resume')` 都调用 `fireDue()` 再 `reschedule()`。

`notifications.ts`：`new Notification({ title: '待办提醒', body: tasks.map(t => t.text).join('、'), silent: false })`；`on('click', () => onActivate(ids))`。

- [ ] **Step 4: 主进程接线**

创建调度器：`getTasks: () => service.getAll()`、`markNotified` → `service.markNotified`、`notify` → `showReminders(tasks, ids => { showWindow(); win.webContents.send(IPC.tasksHighlight, ids); })`、`onFired` 同步高亮。`app.setAppUserModelId('com.lessiskou.less-todo-window')` 必须在创建通知前调用。

- [ ] **Step 5: 验证并提交**

Run: `npm run typecheck && npm test`
Expected: 3 个用例 PASS。手动：在 dev 里通过 DevTools 调 `window.api.addTask({ text:'测试', reminderAt: new Date(Date.now()+60000).toISOString() })`，一分钟后出现系统通知，点击后窗口高亮该任务。

```bash
git add -A
git commit -m "feat: schedule and deliver task reminders"
```

---

### Task 9: 窗口、托盘、设置与开机自启

**Files:**
- Create: `src/main/tray.ts`, `src/main/window.ts`
- Modify: `src/main/index.ts`, `src/main/ipc.ts`（接通 resizeWindow/hideWindow 的依赖）
- Test: `tests/unit/windowBounds.test.ts`

**Interfaces:**
- Produces:
  - `clampToVisible(bounds: { x: number; y: number }, size: { width: number; height: number }, workAreas: { x: number; y: number; width: number; height: number }[]): { x: number; y: number }` —— 若窗口与任一工作区有交集则原样返回；否则钳制到第一个工作区内（保证标题区域可见）。
  - `createMainWindow(settings: SettingsService, onBoundsChange: (p: {x:number;y:number}) => void): BrowserWindow` —— 使用 `settings.get().bounds` 或右上角默认位置；`move` 时防抖 500ms 回调保存位置；`close` 事件 `preventDefault()` 并 `hide()`，除非 `app.isQuitting`。
  - `createTray(deps: { toggleWindow(): void; quit(): void; getAutostart(): boolean; setAutostart(v: boolean): void }): Tray` —— 菜单：显示/隐藏、开机自启（复选）、退出。

- [ ] **Step 1: 写失败测试（clampToVisible）**

```ts
import { describe, it, expect } from 'vitest';
import { clampToVisible } from '../../src/main/window';

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe('clampToVisible', () => {
  it('在屏幕内的位置保持不变', () => {
    expect(clampToVisible({ x: 100, y: 100 }, { width: 320, height: 400 }, [screen])).toEqual({ x: 100, y: 100 });
  });
  it('跑出屏幕的位置被拉回可见区域', () => {
    const p = clampToVisible({ x: 5000, y: -900 }, { width: 320, height: 400 }, [screen]);
    expect(p.x).toBeLessThanOrEqual(screen.width - 320);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(screen.height - 400);
  });
  it('多显示器时贴边的窗口保持原样', () => {
    expect(clampToVisible({ x: 1900, y: 100 }, { width: 320, height: 400 }, [screen])).toEqual({ x: 1900, y: 100 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/windowBounds.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现窗口与托盘**

`createMainWindow`：`x`/`y` 来自设置或默认 `workArea.x + workArea.width - 320 - 16`、`workArea.y + 16`；创建后 `clampToVisible`；监听 `display-metrics-changed` 重新钳制。`setOpacity(settings.get().opacity)`、`setAlwaysOnTop(settings.get().alwaysOnTop, 'floating')`。设置变化时应用。

`createTray`：图标 `nativeImage.createFromPath(join(resourcesPath, 'tray.png'))`（开发路径用 `join(__dirname, '../../resources')`）；点击托盘图标切换显示。`app.setLoginItemSettings({ openAtLogin: v })`。

`src/main/index.ts`：单实例锁（第二次启动聚焦现有窗口）；`window-all-closed` 不退出；`before-quit` 设置 `app.isQuitting = true`；`app.on('second-instance')` 显示窗口。

- [ ] **Step 4: 验证并提交**

Run: `npm run typecheck && npm test && npm run dev`
Expected: 3 个用例 PASS；窗口出现在右上角，可拖动并记住位置；托盘图标存在且菜单可用，X 号只隐藏窗口；重新 `npm run dev` 时旧窗口被聚焦而不是开第二个（打包后单实例更严格，dev 下尽力验证）。

```bash
git add -A
git commit -m "feat: frameless window, tray, settings and autostart"
```

---

### Task 10: 渲染进程外壳、今天列表与快速添加

**Files:**
- Create: `src/renderer/src/components/Header.tsx`, `TaskList.tsx`, `TaskRow.tsx`, `QuickAdd.tsx`, `src/renderer/src/hooks/useTasks.ts`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`
- Delete: 无

**Interfaces:**
- Consumes: `window.api`（Task 7）、`parseQuickAdd`、`groupTasks`、`matchesSearch`。
- Produces: 可交互的今天列表；`useTasks()` 返回 `{ tasks, today, later, done, refresh, ... }` 供 Task 11/12 复用。

- [ ] **Step 1: 实现数据钩子**

`useTasks`：启动时 `api.getTasks()`，订阅 `api.onTasksChanged` 同步；暴露 `add(text)`（调用 `parseQuickAdd(text, new Date())`，用 `api.addTask({ text: parsed.text, reminderAt: parsed.reminderAt })`；若 `parsed.timeWasPast` 设置一条 3 秒后消失的提示文本）、`toggle`、`remove`、`move`、`snooze`、`updateText`。

- [ ] **Step 2: 实现头部与列表**

`Header`：显示"今天 · n 项"（n 为未完成数）、搜索按钮、设置按钮、关闭按钮（`api.hideWindow()`）；整条 header 可拖动（`-webkit-app-region: drag`，按钮设 `no-drag`）。
`TaskRow`：复选框、时间（若 `reminderAt`，显示 `HH:mm`，已过期且未完成用强调色）、文字（最多两行省略，`title` 为全文）、悬停操作区（"提醒"按钮、`→以后`、删除）。双击文字进入行内编辑：`Enter` 调 `updateText`、`Esc` 取消、清空则删除。
`TaskList`：渲染今天未完成任务，按 `groupTasks` 顺序；底部"已完成 · n"折叠区（默认收起）。

- [ ] **Step 3: 快速添加**

`QuickAdd`：底部输入框，`autoFocus`；`Enter` 提交并清空，提交后保持焦点；解析出提醒时在输入框下方短暂显示"已设提醒 10:00"；`timeWasPast` 时显示"10:00 已过，未设提醒"。窗口任意点击不清除输入。

- [ ] **Step 4: 设置高度**

`App` 用 `ResizeObserver` 观察卡片内容高度，调用 `api.setContentHeight(height)`（节流 100ms）。

- [ ] **Step 5: 手动验收**

Run: `npm run dev`
逐项确认：输入"10:00 交周报"回车 → 出现在今天且带 10:00（若已过则保留文字并出现提示）；"买牛奶" → 无时间行；勾选 → 划线并进入已完成；双击编辑、清空删除；`→以后` 移除并清掉提醒；粘贴 500 字含换行的文本 → 只占两行且窗口不横向溢出；关闭按钮隐藏窗口。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: today list, quick add and task row interactions"
```

---

### Task 11: 以后列表与搜索

**Files:**
- Create: `src/renderer/src/components/LaterSection.tsx`, `SearchBar.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/hooks/useTasks.ts`

**Interfaces:**
- Consumes: `useTasks`、`groupTasks`、`matchesSearch`。
- Produces: 折叠的"以后 · n"区、展开后的行操作、拖拽到今天的落区、`Ctrl+F` 搜索。

- [ ] **Step 1: 以后区**

`LaterSection`：默认折叠为一行"以后 · n"；展开列出 `later` 未完成任务（复选框可完成），每行有"→ 今天"按钮（`api.moveTask(id,'today')`）。实现 HTML5 拖拽：任务行 `draggable`，今天列表作为放置区，`drop` 时 `moveTask(id,'today')`；从今天拖到"以后"栏同理。搜索时自动展开并显示匹配项。

- [ ] **Step 2: 搜索**

`SearchBar`：`Ctrl+F`（或点 🔍）展开并聚焦；输入即时过滤今天、以后、已完成三组；`Esc` 或清空关闭，关闭后恢复完整列表。

- [ ] **Step 3: 手动验收**

Run: `npm run dev`
确认：添加两条任务移到以后 → "以后 · 2"；展开后可勾选完成、可"→ 今天"；拖拽双向生效；搜索"牛奶"只剩匹配项且以后区自动展开；`Esc` 恢复；关闭窗口重开数据仍在（此时未必已有跨天，只验证持久化）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: later list, drag between lists and search"
```

---

### Task 12: 提醒高亮、稍后提醒与设置面板

**Files:**
- Create: `src/renderer/src/components/SettingsMenu.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/hooks/useTasks.ts`, `src/renderer/src/components/TaskRow.tsx`
- Modify: `src/preload/index.ts`（若订阅事件尚未全部暴露）

**Interfaces:**
- Consumes: `api.onHighlight`、`api.snoozeTask`、`api.getSettings`、`api.updateSettings`。
- Produces: 到点高亮 + 5/10 分钟稍后提醒；设置菜单（透明度滑块、始终置顶、开机自启）即时生效。

- [ ] **Step 1: 高亮与稍后提醒**

`useTasks` 订阅 `onHighlight(ids)`，保存 `highlighted: Set<string>`；`TaskRow` 在集合中时加 `highlight` 类（强调色底、短暂脉冲动画）并置顶该任务，同时显示"稍后提醒 5 分钟 / 10 分钟"按钮（调用 `snoozeTask`，随后清除该任务高亮）。完成任务、删除、修改提醒时间时也从集合移除。

- [ ] **Step 2: 设置菜单**

`SettingsMenu`：点击 ⚙ 展开小面板。透明度滑块 0.6–1（节流 200ms 调 `updateSettings({ opacity })`）；开关"始终置顶"、"开机自启"（`autostart` 由主进程 `setLoginItemSettings` 同时应用）。窗口内显示设置保存失败的错误文案。

- [ ] **Step 3: 手动验收**

Run: `npm run dev`
加一条 1 分钟后的提醒。确认：到点系统通知 + 声音；窗口内任务高亮并置顶；点"稍后提醒 5 分钟"后高亮消失、时间变为 5 分钟后（列表可见）；重启应用后该提醒不重复弹通知（只恢复高亮）；透明度滑块与置顶开关立即生效；开机自启开关在任务管理器中可见对应启动项（仅安装版完全生效）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: reminder highlight, snooze and settings panel"
```

---

### Task 13: 跨天结转接线与数据损坏提示

**Files:**
- Modify: `src/main/index.ts`, `src/main/ipc.ts`, `src/renderer/src/App.tsx`
- Test: 复用 Task 4/6 单测（无新增纯逻辑）

**Interfaces:**
- Consumes: `TaskService.rolloverIfNeeded`、`JsonStore.loadWarning`、`IPC.dataWarning`。
- Produces: 启动时、每分钟检查、唤醒时执行跨天结转；坏数据提示横幅。

- [ ] **Step 1: 接线跨天**

`app.whenReady` 内先 `service.rolloverIfNeeded()`；启动 `setInterval(() => { if (service.rolloverIfNeeded()) scheduler.reschedule(); }, 60_000)`；`powerMonitor.on('resume', () => { service.rolloverIfNeeded(); scheduler.fireDue(); scheduler.reschedule(); })`；系统时间变更时（`powerMonitor` 无直接事件，用每分钟检查兜底）同样重排。

- [ ] **Step 2: 数据损坏提示**

`JsonStore.loadWarning()` 非空时，在主进程保存提示文案，窗口 `ready-to-show` 后发送 `IPC.dataWarning`；渲染端在卡片顶部显示一条可关闭的黄色提示条。

- [ ] **Step 3: 手动验收**

Run: `npm run dev`，用 DevTools 或直接修改 `%APPDATA%/less-todo-window/data.json` 模拟：留下一条未完成任务、一条已完成任务、一条过期提醒，把 `lastRolloverDay` 改成昨天，重启应用。确认：已完成任务消失，未完成任务仍在今天，过期提醒清除且不弹通知。再把 `data.json` 写成乱码重启，确认窗口出现"已从备份恢复"提示且不崩溃。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat: wire day rollover and surface data recovery warnings"
```

---

### Task 14: 图标、打包安装包与收尾

**Files:**
- Create: `scripts/gen-icons.mjs`, `electron-builder.yml`, `README.md`
- Create (generated): `resources/icon.png`, `resources/tray.png`
- Modify: `src/main/index.ts`（托盘图标路径兼容打包环境）

**Interfaces:**
- Produces: `npm run build:win` 生成 NSIS 安装包；安装后从开始菜单启动，通知与开机自启可用。

- [ ] **Step 1: 生成图标**

`scripts/gen-icons.mjs` 用 `pngjs` 生成：`resources/icon.png`（256×256，强调色圆角方块 + 白色对勾）与 `resources/tray.png`（32×32 同图案）。保证脚本可重复执行、覆盖旧文件。Run: `npm run gen:icons`，确认两个文件存在且非空。

- [ ] **Step 2: 配置 electron-builder**

`electron-builder.yml`：`appId: com.lessiskou.less-todo-window`、`productName: Less Todo`、`directories.buildResources: resources`、`files: [out/**, resources/**]`、`win.target: nsis`、`nsis.oneClick: false`、`nsis.allowToChangeInstallationDirectory: true`、`nsis.createDesktopShortcut: true`。托盘路径：开发用 `join(__dirname, '../../resources/tray.png')`，打包后 `join(process.resourcesPath, 'tray.png')`（通过 `app.isPackaged` 分支）。

- [ ] **Step 3: 写 README**

包含：项目简介、`npm install` / `npm run dev` / `npm test` / `npm run build:win`、数据文件位置、备份位置、如何设置开机自启、已知限制（无同步、无历史、仅 Windows）。

- [ ] **Step 4: 打包并安装验收**

Run: `npm run build:win`
Expected: `dist/` 下生成 `Less Todo Setup x.y.z.exe`。

安装后逐项验收：从开始菜单启动 → 右上角置顶小窗出现；关闭到托盘，提醒仍弹出且通知显示应用名；勾选完成、跨天后重启数据符合预期；开机自启开关生效；卸载后 `%APPDATA%/less-todo-window` 数据是否保留（保留符合预期，README 中说明）。

- [ ] **Step 5: 最终检查并提交**

Run: `npm run typecheck && npm test`
Expected: 全部 PASS（quickAdd、taskOrder、rollover、store、taskService、ipcHandlers、reminders、windowBounds）。

```bash
git add -A
git commit -m "chore: icons, installer packaging and readme"
```

---

## Self-Review

- **Spec coverage**：窗口与托盘（Task 9）、今天/以后模型（Task 3、10、11）、快速添加与时间前缀（Task 2、10）、提醒与合并/高亮/稍后（Task 8、12）、跨天结转（Task 4、13）、搜索（Task 3、11）、持久化与备份（Task 5、6）、损坏回退（Task 5、13）、开机自启与设置（Task 9、12）、打包（Task 14）、验收标准逐条落在 Task 8/10/11/12/13/14 的手动验收中。
- **类型一致性**：`Task` 字段（含 `notifiedAt`）在 Task 2 定义后所有任务沿用；`RendererApi` 在 Task 7 定义、Task 10–12 使用；`resizeWindow` 与 `setContentHeight` 命名一致；`lastRolloverDay` 的存储形态在 Task 6 与 Task 13 一致。
- **Review Focus 落点**：1→Task 2；2→Task 5；3→Task 4/8/13；4→Task 8；5→Task 9；长文本→Task 10 手动验收。
