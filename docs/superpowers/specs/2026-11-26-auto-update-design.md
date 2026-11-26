# 应用内自动更新 — 设计

日期：2026-11-26

## 意图

安装版用户目前升级要自己找到新的 `Less Todo Setup x.y.z.exe`、下载、覆盖安装。
仓库已经有公开的 GitHub Releases（v1.1.0–v1.3.0），具备接自动更新的条件。让应用
自己发现新版本、下载并在退出时安装，用户不用再手动找安装包。

交互上继续遵守这个应用的轻量原则：不弹模态框、不抢焦点、失败静默，更新永远不能
挡在用户和待办之间。

## 目标

- 应用启动后静默检查 GitHub 上最新**正式** Release 的版本，不阻塞窗口。
- 发现更高版本时，在窗口顶部用现有提示条轻提示一次；提供「更新」和「跳过此版本」。
- 点「更新」后后台下载；下载完成提示「更新已就绪」，可立即重启安装，或退出时自动安装。
- 设置里显示当前版本号，并提供手动「检查更新」和状态文案。
- 每个版本最多主动提示一次（`promptedUpdateVersion` 持久化）；跳过/关闭后不再主动提示，
  但设置里的手动检查仍能看到。
- 无新版本、离线、GitHub API 失败：自动检查静默忽略；手动检查给出简短失败提示。
- 更新过程不改动、不清空 `%APPDATA%\less-todo-window\` 下的任务与设置。

## 非目标

- 不做 beta / 预发布渠道，只跟正式 Release。
- 不做增量差分更新，使用完整安装包。
- 不做强制更新、静默安装、后台自动重启。
- 不做代码签名（继续未签名安装包，接受 Windows SmartScreen 提示）。
- 不改任务数据结构。

## 约束

- 仅 Windows，NSIS 安装包（`oneClick: false`）。
- 只有安装版（`app.isPackaged`）才检查更新；`electron-vite dev` 与未打包运行必须跳过。
- **当前已装的 1.3.0 没有更新代码，无法自动升级到 1.4.0**；用户需要手动装一次 1.4.0，
  此后版本的自动更新才生效。README 与发布说明要写清楚。
- GitHub 仓库公开：`lessiskou/less-todo-window`；发布产物需包含安装包、`latest.yml`
  与 `.blockmap`。现有 v1.3.0 Release 缺 `latest.yml`，不影响新版本，但 1.3.0 也不会
  被自动更新发现。
- 新增运行时依赖 `electron-updater`；更新逻辑全部在主进程，渲染层只展示状态。
- 自动检查用 GitHub 匿名接口，注意速率限制（每次启动一次检查，频率很低）。

## 方案

`electron-updater` + GitHub Releases provider。

考虑过但未采用：

- **自己调 GitHub API + 下载安装**：可控，但要自己处理版本比较、下载校验、NSIS 静默
  安装参数、退出时安装、差分包，重复造轮子且容易出错。
- **只打开浏览器到 Release 页**：最简单，但仍是手动下载安装，没解决用户的问题。

## 数据与设置

`Settings` 增加一个字段：

```ts
promptedUpdateVersion: string | null  // 最近一次主动提示过的版本
```

- 默认 `null`。
- 主进程在 `update-available` 时比较：`version !== promptedUpdateVersion` → 状态里带
  `prompt: true`，否则 `prompt: false`。自动检查只在 `prompt: true` 时显示提示条。
- 渲染层在**提示条真正显示时**把 `promptedUpdateVersion` 写回设置（窗口隐藏时不算提示过）。
- 设置里手动检查不受该字段限制，始终带 `prompt: true` 展示结果。

## 主进程

新增 `src/main/updater.ts`：

```ts
export type UpdatePhase =
  | 'idle' | 'checking' | 'not-available'
  | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  percent?: number
  message?: string
  prompt?: boolean    // 仅 available：是否应该主动显示提示条
}

export interface Updater {
  getState(): UpdateState
  check(manual: boolean): Promise<void>
  download(): Promise<void>
  install(): void
}
```

- 封装 `electron-updater` 的 `autoUpdater`：`autoDownload = false`、
  `autoInstallOnAppQuit = true`。
- `isPackaged === false` 时 `check()` 直接返回 `not-available`（手动检查给出
  "开发模式不检查更新"）。
- 订阅 `update-available` / `update-not-available` / `download-progress` /
  `update-downloaded` / `error`，把状态广播给所有窗口。
- `install()` 调 `autoUpdater.quitAndInstall()`。
- 自动检查时机：窗口 `did-finish-load` 后延迟 15 秒执行一次；之后不轮询。
- `update-available` 时设置 `prompt = manual || version !== promptedUpdateVersion`。
- `error` 事件记录日志；自动检查不广播可见错误，手动检查才广播 `phase: 'error'`。

`src/main/index.ts` 装配 updater，并把初始状态和后续状态通过 IPC 发给窗口。

## IPC

`src/shared/ipc.ts` 增加：

```ts
updateGetState: 'update:get-state',
updateCheck: 'update:check',       // (manual: boolean)
updateDownload: 'update:download',
updateInstall: 'update:install',
updateChanged: 'update:changed',   // 主进程 → 渲染层
appVersionGet: 'app:version'
```

`RendererApi` 增加：

```ts
getAppVersion(): Promise<string>
getUpdateState(): Promise<UpdateState>
checkForUpdates(manual: boolean): Promise<void>
downloadUpdate(): Promise<void>
installUpdate(): Promise<void>
onUpdateChanged(cb: (state: UpdateState) => void): () => void
```

## 渲染层

- 新增 `src/renderer/src/hooks/useUpdater.ts`：订阅 `onUpdateChanged`，暴露
  `state`、`appVersion`、`check()`、`download()`、`install()`。
- 新增 `src/renderer/src/components/UpdateBanner.tsx`，放在现有数据警告条同一位置：
  - `available`：`发现新版本 {version}` + 「更新」+「跳过此版本」
  - `downloading`：`正在下载更新 {percent}%`
  - `downloaded`：`更新已就绪，退出时自动安装` + 「立即重启安装」
  - `error`（仅在手动检查后）：`检查更新失败` + 关闭
  - `checking`：`正在检查更新…`
  - 是否显示由 `state.phase === 'available' && state.prompt` 决定，本地 `dismissed`
    控制跳过；提示条显示时调用一次
    `window.api.updateSettings({ promptedUpdateVersion: state.version })`。
- `SettingsMenu.tsx` 增加：
  - `当前版本 {appVersion}`
  - 「检查更新」按钮；检查中禁用
  - 下方一行状态文案（无新版本 / 检查失败 / 已是最新等）
- 样式沿用 `.banner`、`.small`、`.setting-row` 等现有类，不新增硬编码颜色。

## 发布配置

`package.json`：

- `version` 升到 `1.4.0`。
- `dependencies` 增加 `electron-updater`。

`electron-builder.yml` 增加：

```yaml
publish:
  provider: github
  owner: lessiskou
  repo: less-todo-window
  releaseType: release
```

- 该配置让 electron-builder 生成 `app-update.yml`（打包进应用，供运行时读取），
  并在构建目录产出 `latest.yml`。
- 新增脚本 `release:win`：

  ```json
  "release:win": "npm run gen:icons && electron-vite build && electron-builder --win nsis --publish always"
  ```

  发布时用 `GH_TOKEN`（可取 `gh auth token`）注入环境，不写入仓库。
- 发布后核对 Release 资产：安装包、`latest.yml`、`.blockmap` 齐全，且 `latest.yml`
  里的 `url` 与资产文件名一致。

## 交互与边界（默认决定）

- **何时检查**：只在安装版、启动后 15 秒检查一次；不轮询、不后台常驻请求。
- **提示一次**：同一版本主动提示一次；跳过、关闭、更新都记录 `promptedUpdateVersion`。
- **手动检查**：设置里始终可用，不受提示记录限制；开发模式提示"开发模式不检查更新"。
- **下载**：用户点「更新」才开始，不在后台偷偷下载。
- **安装**：默认退出时安装；「立即重启安装」会关闭窗口并重启。下载完成前不提示重启。
- **失败**：自动检查失败完全静默；手动检查失败显示一行文字，不弹框、不打断。
- **多窗口**：当前只有一个窗口，广播到所有窗口即可。
- **更新与数据**：更新只替换程序文件，不触碰用户数据目录。

## 验证

- `npm run typecheck`、`npm test`、`npm run build`。
- 单元测试：`updater` 的状态迁移与提示判定用可注入的假 `autoUpdater` 测：
  - 发现新版本 → `available`；下载进度 → `downloading`；下载完成 → `downloaded`。
  - `isPackaged === false` 时不发起检查。
  - 同一版本已 `promptedUpdateVersion` 时，自动检查不主动提示，手动检查仍返回结果。
- 打包验证：构建后确认 `out/` 或安装目录内存在 `app-update.yml`，`dist/latest.yml`
  的版本与 `package.json` 一致。
- 手动核对（隔离 `--user-data-dir`）：
  1. 安装 1.4.0 后，对着现有 v1.3.0 Release 检查，应提示"已是最新"。
  2. 设置里显示 1.4.0 与检查按钮。
  3. 断网时启动无异常、无可见报错。
  4. 开发模式点检查，提示不检查更新。
- 真实更新联调需要发布 1.4.0 后再发一个更高版本，属于发布后验证，不在本次构建内完成。

## 风险与说明

- 未签名安装包：首次安装仍可能出现 SmartScreen 提示；自动更新过程本身不需要签名，
  但企业策略较严的机器可能拦截。
- 1.3.0 用户必须手动升级一次，这是无法绕过的事实；README / Release 说明要写清楚。
- GitHub 匿名 API 有速率限制；每启动一次检查一次，正常使用远低于阈值。
- `electron-updater` 在 Windows 上依赖 NSIS 安装目录信息；`oneClick: false` 且
  per-user 安装是受支持的组合。

## 留给实现者

- 提示条的具体文案、按钮顺序与下载百分比格式。
- 自动检查延迟（15 秒）与是否需要加一个"稍后检查"。
- 设置里版本号与检查按钮的具体排版。
- 是否在托盘菜单也加入"检查更新"入口（本期可不做）。
