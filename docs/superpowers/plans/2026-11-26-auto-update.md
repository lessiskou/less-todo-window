# 应用内自动更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安装版启动后静默检查 GitHub 正式 Release，发现新版本时轻提示一次，确认后下载并在退出时安装。

**Architecture:** 主进程用 `electron-updater` 包一层可注入的 `UpdateAdapter`，状态机（idle → checking → available → downloading → downloaded）通过 IPC 广播给渲染层；渲染层只负责显示提示条和设置里的检查入口。提示频率由主进程比较 `promptedUpdateVersion` 决定。

**Tech Stack:** Electron 45、React 19、TypeScript 7、Vitest 5、electron-updater 6；electron-builder 26 + GitHub Releases。

**Spec:** `docs/superpowers/specs/2026-11-26-auto-update-design.md`

## Global Constraints

- 仅 Windows，NSIS 安装包，`oneClick: false`、per-user 安装。
- 只有 `app.isPackaged === true` 才检查更新；开发模式必须跳过。
- 只跟正式 Release，不做 beta / 预发布。
- 不新增代码签名；未签名安装包继续接受 SmartScreen 提示。
- 更新不修改、不删除 `%APPDATA%\less-todo-window\` 下的任何数据。
- 更新逻辑全部在主进程；渲染层不直接调用 GitHub 或 `electron-updater`。
- 发布仓库：`lessiskou/less-todo-window`（公开）。版本号本次统一为 `1.4.0`。
- 发布是公开、不可逆的外部操作；执行前确认工作树干净、测试通过。

## Review Focus

- 开发模式 / 未打包运行点「检查更新」：不发起网络请求，给出“开发模式不检查更新”，不能抛异常。
- 断网或 GitHub 接口失败时的自动检查：完全静默，不显示错误、不影响待办操作。
- 同一版本已提示过，再次启动：自动检查不再弹提示条；设置里的手动检查仍能看到结果。
- 下载过程中关闭窗口或退出：不打断、不丢任务数据；下载状态不阻塞其他操作。
- 发布资产缺少 `latest.yml` 或文件名与其中 `url` 不一致：更新会检测失败；发布任务必须核对资产。

---

### Task 1: 更新状态类型与设置字段

**Files:**
- Create: `src/shared/update.ts`
- Modify: `src/shared/types.ts:13-25`
- Test: `tests/unit/settingsService.test.ts`（新建）

**Interfaces:**
- Produces:

```ts
export type UpdatePhase =
  | 'idle' | 'checking' | 'not-available'
  | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  percent?: number
  message?: string
  prompt?: boolean
}
```

- Produces: `Settings.promptedUpdateVersion: string | null`，`DEFAULT_SETTINGS.promptedUpdateVersion = null`。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/settingsService.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { SettingsService } from '../../src/main/settingsService'
import type { JsonStore } from '../../src/main/store'
import type { Settings } from '../../src/shared/types'

const store = (data: Partial<Settings> = {}): JsonStore<Settings> =>
  ({
    load: () => data as Settings,
    save: () => undefined
  }) as unknown as JsonStore<Settings>

describe('SettingsService', () => {
  it('默认 promptedUpdateVersion 为 null', () => {
    expect(new SettingsService(store()).get().promptedUpdateVersion).toBeNull()
  })
  it('保存并返回 promptedUpdateVersion', () => {
    const svc = new SettingsService(store())
    expect(svc.update({ promptedUpdateVersion: '1.4.0' }).promptedUpdateVersion).toBe('1.4.0')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/settingsService.test.ts`
Expected: FAIL — `promptedUpdateVersion` 为 `undefined`。

- [ ] **Step 3: 实现**

`src/shared/types.ts` 的 `Settings` 与 `DEFAULT_SETTINGS` 增加 `promptedUpdateVersion: string | null`（默认 `null`）。
新建 `src/shared/update.ts`，内容为上面的 `UpdatePhase` / `UpdateState`。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/unit/settingsService.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/update.ts tests/unit/settingsService.test.ts
git commit -m "feat: 增加更新状态类型与提示版本设置"
```

---

### Task 2: 可测试的更新状态机

**Files:**
- Create: `src/main/updater.ts`
- Test: `tests/unit/updater.test.ts`

**Interfaces:**
- Consumes: `UpdateState`。
- Produces:

```ts
export interface UpdateAdapter {
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  quitAndInstall(): void
  onAvailable(cb: (version: string) => void): void
  onNotAvailable(cb: () => void): void
  onProgress(cb: (percent: number) => void): void
  onDownloaded(cb: (version: string) => void): void
  onError(cb: (message: string) => void): void
}

export interface UpdaterDeps {
  adapter: UpdateAdapter
  isPackaged: boolean
  getPromptedVersion(): string | null
  broadcast(state: UpdateState): void
}

export interface Updater {
  getState(): UpdateState
  check(manual: boolean): Promise<void>
  download(): Promise<void>
  install(): void
}

export function createUpdater(deps: UpdaterDeps): Updater
```

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/updater.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { createUpdater, type UpdateAdapter } from '../../src/main/updater'
import type { UpdateState } from '../../src/shared/update'

function fakeAdapter() {
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const adapter: UpdateAdapter = {
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
    onAvailable: (cb) => (handlers.available = cb as (v: string) => void),
    onNotAvailable: (cb) => (handlers.notAvailable = cb),
    onProgress: (cb) => (handlers.progress = cb as (p: number) => void),
    onDownloaded: (cb) => (handlers.downloaded = cb as (v: string) => void),
    onError: (cb) => (handlers.error = cb as (m: string) => void)
  }
  return { adapter, handlers }
}

const make = (prompted: string | null = null, isPackaged = true) => {
  const { adapter, handlers } = fakeAdapter()
  const states: UpdateState[] = []
  const updater = createUpdater({
    adapter,
    isPackaged,
    getPromptedVersion: () => prompted,
    broadcast: (state) => states.push(state)
  })
  return { updater, adapter, handlers, states }
}

describe('createUpdater', () => {
  it('开发模式不请求，手动检查给出提示', async () => {
    const { updater, adapter, states } = make(null, false)
    await updater.check(true)
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(states.at(-1)).toMatchObject({ phase: 'not-available', message: '开发模式不检查更新' })
  })
  it('自动检查发现新版本会主动提示', async () => {
    const { updater, handlers, states } = make(null)
    await updater.check(false)
    handlers.available('1.4.0')
    expect(states.at(-1)).toEqual({ phase: 'available', version: '1.4.0', prompt: true })
  })
  it('已提示过的版本自动检查不再主动提示，手动检查仍然提示', async () => {
    const auto = make('1.4.0')
    await auto.updater.check(false)
    auto.handlers.available('1.4.0')
    expect(auto.states.at(-1)).toMatchObject({ phase: 'available', prompt: false })

    const manual = make('1.4.0')
    await manual.updater.check(true)
    manual.handlers.available('1.4.0')
    expect(manual.states.at(-1)).toMatchObject({ phase: 'available', prompt: true })
  })
  it('下载进度与完成状态', async () => {
    const { updater, handlers, states } = make(null)
    await updater.check(false)
    handlers.available('1.4.0')
    await updater.download()
    handlers.progress(42.6)
    expect(states.at(-1)).toEqual({ phase: 'downloading', version: '1.4.0', percent: 43 })
    handlers.downloaded('1.4.0')
    expect(states.at(-1)).toEqual({ phase: 'downloaded', version: '1.4.0' })
  })
  it('自动检查失败静默，手动检查失败报错', async () => {
    const auto = make(null)
    await auto.updater.check(false)
    auto.handlers.error('offline')
    expect(auto.states.at(-1)).toEqual({ phase: 'idle' })

    const manual = make(null)
    await manual.updater.check(true)
    manual.handlers.error('offline')
    expect(manual.states.at(-1)).toEqual({ phase: 'error', message: 'offline', manual: true })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/updater.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现**

按下面的行为写 `createUpdater`（把 `lastCheckManual` 记在闭包里）：

```ts
export function createUpdater({ adapter, isPackaged, getPromptedVersion, broadcast }: UpdaterDeps): Updater {
  let state: UpdateState = { phase: 'idle' }
  let lastCheckManual = false
  const set = (next: UpdateState): void => {
    state = next
    broadcast(next)
  }

  adapter.onAvailable((version) => {
    set({ phase: 'available', version, prompt: lastCheckManual || version !== getPromptedVersion() })
  })
  adapter.onNotAvailable(() => set({ phase: 'not-available' }))
  adapter.onProgress((percent) => {
    if (state.phase !== 'downloading') return
    set({ phase: 'downloading', version: state.version, percent: Math.round(percent) })
  })
  adapter.onDownloaded((version) => set({ phase: 'downloaded', version }))
  adapter.onError((message) => {
    if (lastCheckManual) set({ phase: 'error', message, manual: true })
    else set({ phase: 'idle' })
  })

  return {
    getState: () => state,
    async check(manual) {
      lastCheckManual = manual
      if (!isPackaged) {
        set({ phase: 'not-available', message: manual ? '开发模式不检查更新' : undefined })
        return
      }
      set({ phase: 'checking' })
      try {
        await adapter.checkForUpdates()
      } catch (error) {
        const message = error instanceof Error ? error.message : '检查更新失败'
        if (manual) set({ phase: 'error', message, manual: true })
        else set({ phase: 'idle' })
      }
    },
    async download() {
      if (state.phase !== 'available') return
      const version = state.version
      set({ phase: 'downloading', version, percent: 0 })
      try {
        await adapter.downloadUpdate()
      } catch (error) {
        set({ phase: 'error', message: error instanceof Error ? error.message : '下载更新失败', manual: true })
      }
    },
    install() {
      adapter.quitAndInstall()
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run tests/unit/updater.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/updater.ts tests/unit/updater.test.ts
git commit -m "feat: 可注入的更新状态机与提示判定"
```

---

### Task 3: electron-updater 适配器、IPC 与主进程装配

**Files:**
- Create: `src/main/updateAdapter.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/ipcHandlers.test.ts`

**Interfaces:**
- Consumes: `Updater`、`UpdateState`、`SettingsService`。
- Produces: `createElectronAdapter(): UpdateAdapter`。
- Produces: `createHandlers(service, settings, updater)`；`registerIpc(service, settings, updater, deps)`。
- Produces `RendererApi` 新方法：`getAppVersion()`、`getUpdateState()`、`checkForUpdates(manual)`、`downloadUpdate()`、`installUpdate()`、`onUpdateChanged(cb)`。

- [ ] **Step 1: 写测试**

在 `tests/unit/ipcHandlers.test.ts` 的 `setup()` 里加 fake updater：

```ts
const updater = {
  getState: () => ({ phase: 'idle' as const }),
  check: vi.fn(async () => {}),
  download: vi.fn(async () => {}),
  install: vi.fn()
}
```

`createHandlers(service, settings, updater as never)`，追加：

```ts
it('updateCheck 转发 manual 并返回状态', () => {
  const { handlers, updater } = setup()
  expect(handlers[IPC.updateGetState]()).toEqual({ phase: 'idle' })
  handlers[IPC.updateCheck](true)
  expect(updater.check).toHaveBeenCalledWith(true)
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/ipcHandlers.test.ts`
Expected: FAIL — `IPC.updateGetState` 不存在。

- [ ] **Step 3: 实现适配器**

`src/main/updateAdapter.ts`：

```ts
import { autoUpdater } from 'electron-updater'
import type { UpdateAdapter } from './updater'

export function createElectronAdapter(): UpdateAdapter {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  return {
    checkForUpdates: async () => {
      await autoUpdater.checkForUpdates()
    },
    downloadUpdate: async () => {
      await autoUpdater.downloadUpdate()
    },
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    onAvailable: (cb) => autoUpdater.on('update-available', (info) => cb(info.version)),
    onNotAvailable: (cb) => autoUpdater.on('update-not-available', () => cb()),
    onProgress: (cb) => autoUpdater.on('download-progress', (progress) => cb(progress.percent)),
    onDownloaded: (cb) => autoUpdater.on('update-downloaded', (info) => cb(info.version)),
    onError: (cb) => autoUpdater.on('error', (error) => cb(error.message))
  }
}
```

- [ ] **Step 4: 加 IPC 与 preload**

`src/shared/ipc.ts` 增加通道：

```ts
updateGetState: 'update:get-state',
updateCheck: 'update:check',
updateDownload: 'update:download',
updateInstall: 'update:install',
updateChanged: 'update:changed',
appVersionGet: 'app:version'
```

`main/ipc.ts` 的 `createHandlers` 增加：

```ts
[IPC.updateGetState]: () => updater.getState(),
[IPC.updateCheck]: (manual: boolean) => updater.check(manual),
[IPC.updateDownload]: () => updater.download(),
[IPC.updateInstall]: () => {
  updater.install()
},
[IPC.appVersionGet]: () => app.getVersion()
```

（从 `electron` 导入 `app`。）`registerIpc` 签名加 `updater` 并透传。

`preload/index.ts` 补对应方法，`onUpdateChanged` 用现有 `subscribe`。

- [ ] **Step 5: 装配主进程**

`src/main/index.ts`：

1. `const updater = createUpdater({ adapter: createElectronAdapter(), isPackaged: app.isPackaged, getPromptedVersion: () => settings.get().promptedUpdateVersion, broadcast: (state) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateChanged, state) } })`
2. `registerIpc(service, settings, updater, {...})`。
3. 窗口 `did-finish-load` 后 `setTimeout(() => void updater.check(false), 15_000)`。
4. 启动时不需要额外检查；手动检查由 IPC 触发。

- [ ] **Step 6: 运行测试与类型检查**

Run: `npx vitest run tests/unit/ipcHandlers.test.ts && npm run typecheck`
Expected: PASS，typecheck 0 errors。

- [ ] **Step 7: Commit**

```bash
git add src/main/updateAdapter.ts src/main/ipc.ts src/main/index.ts src/shared/ipc.ts src/preload/index.ts tests/unit/ipcHandlers.test.ts
git commit -m "feat: 接入 electron-updater 与更新 IPC"
```

---

### Task 4: 渲染层更新提示与设置入口

**Files:**
- Create: `src/renderer/src/hooks/useUpdater.ts`
- Create: `src/renderer/src/components/UpdateBanner.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/SettingsMenu.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `UpdateState`、`RendererApi` 新方法。
- Produces: `useUpdater(): { state, appVersion, dismissed, check(), download(), install(), dismiss() }`。
- Produces: `UpdateBanner` props：`state: UpdateState`、`onUpdate()`、`onInstall()`、`onSkip()`、`onDismissError()`。

- [ ] **Step 1: 写 hook**

`useUpdater`：

- 挂载时 `getAppVersion()`、`getUpdateState()`、`onUpdateChanged(setState)`。
- `check()`：`setDismissed(false)` 后 `checkForUpdates(true)`。
- `download()`、`install()` 直接转发。
- `dismiss()`：`setDismissed(true)`。
- 当 `state?.phase === 'available' && state.prompt && !dismissed` 时，用 `recordedRef`
  确保只调用一次 `window.api.updateSettings({ promptedUpdateVersion: state.version })`。

- [ ] **Step 2: 写 UpdateBanner**

按状态渲染（沿用 `.banner`）：

- `available`：`发现新版本 {version}` + 「更新」+「跳过此版本」
- `downloading`：`正在下载更新 {percent}%`
- `downloaded`：`更新已就绪，退出时自动安装` + 「立即重启安装」
- `error`（`manual` 为 true）：`{message}` + 关闭
- 其他：不渲染

- [ ] **Step 3: 接入 App 与设置**

`App.tsx`：

- `const updater = useUpdater()`。
- 在数据警告条上方渲染提示条：`showBanner = updater.state?.phase === 'available' ? updater.state.prompt && !updater.dismissed : ['downloading','downloaded'].includes(...) || (error && manual)`。
- `SettingsMenu` 传入 `appVersion={updater.appVersion}`、`updateState={updater.state}`、`onCheckUpdates={() => void updater.check()}`。

`SettingsMenu.tsx`：

- 新增一行 `当前版本 {appVersion}`。
- 新增「检查更新」按钮（`checking` 时禁用，文案“检查中…”）。
- 下方状态文案：`not-available` → 有 message 用 message，否则“已是最新版本”；`error` → message；`available` → `发现新版本 {version}`；`downloaded` → “更新已就绪，退出时安装”。

- [ ] **Step 4: 样式**

`styles.css` 沿用 `.banner`；新增 `.banner.update`（与 `.banner.warning` 并列，用 `--accent-soft` / `--fg`）、`.banner-actions`（横向 gap）、以及设置里的版本行沿用 `.setting-row`。不新增硬编码颜色。

- [ ] **Step 5: 验证编译**

Run: `npm run typecheck && npm run build`
Expected: 0 errors，构建成功。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useUpdater.ts src/renderer/src/components/UpdateBanner.tsx src/renderer/src/App.tsx src/renderer/src/components/SettingsMenu.tsx src/renderer/src/styles.css
git commit -m "feat: 渲染层更新提示条与设置里的检查入口"
```

---

### Task 5: 依赖、发布配置与版本文档

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`（由 npm 生成）
- Modify: `electron-builder.yml`
- Modify: `README.md`
- Modify: `docs/backlog.md`

- [ ] **Step 1: 安装依赖并升版本**

```bash
npm install electron-updater@^6
npm version 1.4.0 --no-git-tag-version
```

- [ ] **Step 2: 发布配置**

`electron-builder.yml` 追加：

```yaml
publish:
  provider: github
  owner: lessiskou
  repo: less-todo-window
  releaseType: release
```

`package.json` scripts 增加：

```json
"release:win": "npm run gen:icons && electron-vite build && electron-builder --win nsis --publish always"
```

- [ ] **Step 3: 更新 README 与 backlog**

- README 功能列表加自动更新；「已知限制」删掉“无自动更新”，写明：
  - 自动更新只跟正式 Release；
  - **1.3.0 及更早版本需要手动安装一次 1.4.0，之后才会自动更新**；
  - 未签名安装包仍可能触发 SmartScreen。
- README 增加发布说明：`GH_TOKEN=$(gh auth token) npm run release:win`，发布后核对
  安装包、`latest.yml`、`.blockmap`。
- `docs/backlog.md` 把“应用内自动更新”状态改为“已实现（1.4.0）”。

- [ ] **Step 4: 构建验证**

Run: `npm run typecheck && npm test && npm run build && npm run build:win`
Expected: 全部通过；`dist/latest.yml` 的 `version` 为 `1.4.0`；`dist/win-unpacked/resources/app-update.yml` 存在且指向 `lessiskou/less-todo-window`。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron-builder.yml README.md docs/backlog.md
git commit -m "chore: 接入 electron-updater，版本升到 1.4.0"
```

---

### Task 6: 发布 1.4.0

**Files:** 无源码改动。

> 公开、不可逆操作。执行前确认用户已授权发布、工作树干净、Task 5 的验证全部通过。

- [ ] **Step 1: 发布前检查**

Run: `git status --short && git log --oneline -3 && node -p "require('./package.json').version"`
Expected: 工作树干净（dist/ 忽略即可）、版本 `1.4.0`、提交已就绪。

- [ ] **Step 2: 构建并发布**

```bash
GH_TOKEN="$(gh auth token)" npm run release:win
```

- [ ] **Step 3: 核对 Release 资产**

```bash
gh release view v1.4.0 --json tagName,isDraft,assets -q '{tag:.tagName,draft:.isDraft,assets:[.assets[].name]}'
```

Expected：包含 `Less-Todo-Setup-1.4.0.exe`、`latest.yml`、`.blockmap`；若 `isDraft` 为 true，
执行 `gh release edit v1.4.0 --draft=false` 并再次核对。

- [ ] **Step 4: 告知用户**

说明 1.4.0 已发布；1.3.0 需要手动安装这次安装包，之后版本才能自动更新；附 Release 链接。

- [ ] **Step 5: 收尾提交（如有）**

```bash
git status --short
git add -A
git commit -m "chore: 发布 1.4.0" || true
```
