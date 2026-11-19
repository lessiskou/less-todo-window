# 青瓷 × 霞鹜文楷 视觉改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把渲染层换成青瓷色系 + 全篇霞鹜文楷，替换 emoji 图标并补齐浅/深两套主题，功能与窗口行为不变，版本升到 1.2.0。

**Architecture:** 只动 `src/renderer` 与打包配置。字体通过 npm 依赖随包打入 `out/renderer/assets`；图标抽成 `icons.tsx` 的 SVG 组件；`styles.css` 用 CSS 变量实现青瓷浅/深主题，组件类名与 props 基本不变。`main/`、`preload/`、`shared/` 与全部业务逻辑不动。

**Tech Stack:** Electron 45 + electron-vite + React 19 + TypeScript 7 + Vitest 5；`lxgw-wenkai-screen-webfont@1.7.0`（SIL OFL 1.1）。

**Spec:** `docs/superpowers/specs/2026-11-19-celadon-wenkai-redesign-design.md`

## Global Constraints

- 窗口固定 320 × 420、无边框透明、高度自适应逻辑不变；不修改 `src/main/**`、`src/preload/**`、`src/shared/**`。
- 不加任何功能；任务/IPC/数据格式/提醒/托盘逻辑保持原样。
- 字体离线可用，不引用 CDN；只引 `lxgwwenkaigbscreen.css`（约 4.33 MB），不引 `style.css`（18.8 MB）。
- 基础字号 13.5px / 行高 1.55；标题 16px / 400 / 0.04em；字体回退 `'Microsoft YaHei UI', sans-serif`。
- 青瓷浅色：底 `#E9EFE7→#DFE8DE`，字 `#1D2A23`，次要 `#586A5F`，强调 `#2F6A50`，危险 `#AD4C33`。
- 青瓷深色：底 `#151C17→#0F1510`，字 `#E4EBDD`，次要 `#8FA095`，强调 `#7FB894`，危险 `#E08A66`。
- 版本号 1.2.0；最终产出 `dist/Less Todo Setup 1.2.0.exe`。
- **不自动提交**：完成并由用户确认后再决定是否 commit / push。
- UI 没有组件测试框架：每个任务的自动化检查是 `npm run typecheck` + `npm run build`，视觉变化按任务里的截图/目检步骤验收；既有单元测试必须全绿。

## Review Focus

- 字体在未联网、asar 打包、首屏未加载完时：必须回退雅黑，布局不塌、不闪烁到不可用。
- 320px 宽度 + 悬停浮出的三个图标按钮：长文本仍能两行截断，时间列不被挤压。
- 深色主题下次要文字、过期时间、计数胶囊、输入框内描边的对比度与辨识度。
- 纯图标操作的可达性：每个按钮有 `aria-label` / `title`，键盘 Tab 有可见焦点环。
- 文楷比例数字：时间列固定宽度下允许轻微参差，但过期时间加粗后仍要一眼可辨。

---

### Task 1: 字体管线与许可

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/renderer/src/main.tsx:1-10`
- Create: `resources/LXGW-WenKai-OFL.txt`
- Modify: `electron-builder.yml`

**Interfaces:**
- Produces: 全局可用字体族 `'LXGW WenKai Screen'`；打包后 `win-unpacked/resources/LXGW-WenKai-OFL.txt` 存在。

- [ ] **Step 1: 安装字体包**

Run: `npm install lxgw-wenkai-screen-webfont@1.7.0 --save`
Expected: `package.json` dependencies 出现 `"lxgw-wenkai-screen-webfont": "^1.7.0"`。

- [ ] **Step 2: 在入口引入 GB Screen 字体 CSS**

`src/renderer/src/main.tsx` 顶部、`./styles.css` 之前加：

```ts
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'
```

- [ ] **Step 3: 附带字体许可**

Run: `cp node_modules/lxgw-wenkai-screen-webfont/OFL.txt resources/LXGW-WenKai-OFL.txt`
Expected: 文件存在且以 `SIL OPEN FONT LICENSE Version 1.1` 开头。

- [ ] **Step 4: 把许可文件打进安装包**

`electron-builder.yml` 的 `extraResources` 增加一项，保留现有 `tray.png`：

```yaml
  - from: resources/LXGW-WenKai-OFL.txt
    to: LXGW-WenKai-OFL.txt
```

- [ ] **Step 5: 验证字体进了构建产物**

Run: `npm run build && find out/renderer/assets -name '*.woff2' | wc -l`
Expected: 构建成功，woff2 数量约 100 个；`du -sh out/renderer/assets` 约 4.3 MB 增量。

- [ ] **Step 6: 回归检查**

Run: `npm run typecheck && npm test`
Expected: 全部通过。

---

### Task 2: 青瓷主题 token、卡片外壳、标题栏、SVG 图标

**Files:**
- Create: `src/renderer/src/components/icons.tsx`
- Modify: `src/renderer/src/components/Header.tsx`
- Modify: `src/renderer/src/styles.css:1-120`

**Interfaces:**
- Produces: `icons.tsx` 导出 `SearchIcon`、`SettingsIcon`、`CloseIcon`、`BellIcon`、`MoveDownIcon`、`MoveUpIcon`、`ChevronIcon`、`PlusIcon`、`CheckIcon`，签名统一为 `({ size = 14, className }: IconProps) => JSX.Element`，`IconProps = { size?: number; className?: string }`。
- Produces: 标题栏结构 `.header > .title`（含 `.count` 胶囊）+ `.icon-button`。

- [ ] **Step 1: 新建 SVG 图标模块**

`icons.tsx` 里每个图标返回：

```tsx
<svg viewBox="0 0 14 14" width={size} height={size} className={className}
  fill="none" stroke="currentColor" strokeWidth={1.4}
  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  {/* path */}
</svg>
```

路径按设计稿：search（圆 `cx=6.2 cy=6.2 r=4.2` + `M9.3 9.3 12.5 12.5`）、settings（两条横线 + 两个圆）、close（`M4 4l6 6M10 4l-6 6`）、bell、down（`M7 2.8v6M4.4 6.3 7 8.9l2.6-2.6M3 11.4h8`）、up（down 的镜像）、chevron（`M5.2 3.5 8.7 7l-3.5 3.5`）、plus（`M7 2.8v8.4M2.8 7h8.4`）、check（`M2.5 6.2 4.8 8.5 9.5 3.5`，viewBox `0 0 12 12`）。

- [ ] **Step 2: Header 换成图标 + 计数胶囊**

`Header.tsx` 中标题改为：

```tsx
<span className="title">今天{count > 0 ? <span className="count">{count}</span> : null}</span>
```

三个按钮分别放 `SearchIcon`、`SettingsIcon`、`CloseIcon`，保留 `aria-label` 与点击回调；按钮 class 仍为 `icon-button`。

- [ ] **Step 3: 重写 styles.css 的 token 与外壳**

替换 `:root` / 深色媒体查询 / `html,body,#root` / `.card` / `.header` / `.title` / `.icon-button`。关键值：

```css
:root {
  color-scheme: light dark;
  font-family: 'LXGW WenKai Screen', 'Microsoft YaHei UI', system-ui, sans-serif;
  font-size: 13.5px;
  --bg: ...linear-gradient(165deg, #e9efe7, #dfe8de);
  --fg: #1d2a23; --muted: #586a5f; --line: rgba(29,42,35,.12);
  --hover: rgba(29,42,35,.055); --accent: #2f6a50; --danger: #ad4c33;
  --edge: rgba(29,42,35,.1);
  --shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 18px 36px -14px rgba(34,60,44,.38), 0 2px 8px rgba(34,60,44,.08);
}
```

`.card` 使用 `border-radius: 15px; border: 1px solid var(--edge); background: var(--bg); box-shadow: var(--shadow);`；`.count` 为松绿胶囊（浅色底 `rgba(47,106,80,.1)`、字 `#2f6a50`、10.5px、`border-radius:999px`、`padding:1px 6px`）；`.icon-button` 24×24，悬停 `var(--hover)`。

- [ ] **Step 4: 深色 token**

`@media (prefers-color-scheme: dark)` 写入设计稿的深色值；`.count` 深色底 `rgba(127,184,148,.14)`、字 `#9cc9ae`。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm run build`
Expected: 通过。启动 `npm run dev`，标题栏显示图标与胶囊计数，窗口无破版。

---

### Task 3: 任务行、复选框、时间、悬停操作

**Files:**
- Modify: `src/renderer/src/components/TaskRow.tsx`
- Modify: `src/renderer/src/styles.css`（`.row` 及子元素段落）

**Interfaces:**
- Consumes: `CheckIcon`、`BellIcon`、`MoveDownIcon`、`MoveUpIcon`、`CloseIcon`。
- Produces: 行内操作按钮结构 `.actions > button.action`；复选框 `.check` / `.check.checked`。

- [ ] **Step 1: TaskRow 换成图标**

- 复选框内部：`{done ? <CheckIcon size={10} /> : ''}`。
- 今天任务：`BellIcon`（提醒）、`MoveDownIcon`（→以后）、`CloseIcon`（删除）。
- 以后任务：`MoveUpIcon`（→今天）、`CloseIcon`。
- 已完成：只保留 `CloseIcon`。
- 每个图标按钮加 `className="action"`，保留/补齐 `aria-label` 与 `title`（提醒 / 移到以后 / 移到今天 / 删除）。

- [ ] **Step 2: 行样式**

```css
.row { display:flex; flex-wrap:wrap; align-items:flex-start; gap:8px;
  padding:7px 8px; border-radius:7px; position:relative; }
.row:hover, .row:focus-within { background:var(--hover); }
.check { width:15px; height:15px; border-radius:4.5px; border:1.5px solid var(--muted);
  background:transparent; color:var(--check-fg-on); padding:0; display:flex;
  align-items:center; justify-content:center; }
.check.checked { background:var(--accent); border-color:var(--accent); }
.time { width:33px; font-size:11.5px; color:var(--muted); font-variant-numeric:tabular-nums; }
.time.overdue { color:var(--danger); font-weight:600; }
.text { flex:1 1 0; min-width:0; line-height:1.55; -webkit-line-clamp:2; ... }
.actions { display:flex; gap:1px; margin:-2px -4px -2px 2px; opacity:0; }
.row:hover .actions, .row:focus-within .actions { opacity:1; }
.action { width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center;
  border:0; border-radius:5px; background:transparent; color:var(--muted); padding:0; }
.action:hover { background:var(--hover); color:var(--fg); }
```

`--check-fg-on` 浅色 `#f1f6f1`，深色 `#101510`。

- [ ] **Step 3: 提醒编辑器与稍后提醒**

`.reminder-editor` 保持整行换行；`input[type='time']` 用 `1px solid var(--line)`、圆角 7、松绿聚焦。`.snooze` 整行；`.small.primary` 用 `var(--accent)`；`.small` 字号 11.5px、圆角 5。

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 通过。手动检查：320px 下长任务两行截断；悬停出现三个图标；双击仍能编辑。

---

### Task 4: 列表、折叠区、空状态

**Files:**
- Modify: `src/renderer/src/components/TaskList.tsx`
- Modify: `src/renderer/src/components/LaterSection.tsx`
- Modify: `src/renderer/src/styles.css`（`.content`、`.task-list`、折叠段）

**Interfaces:**
- Consumes: `ChevronIcon`。
- Produces: 折叠按钮结构 `.fold-toggle > svg + 文案 + .fold-count`，展开时 svg 加 `.is-open`。

- [ ] **Step 1: 折叠按钮换 SVG**

`TaskList.tsx` 的"已完成"按钮与 `LaterSection.tsx` 的"以后"按钮：

```tsx
<button type="button" className="fold-toggle" onClick={...}>
  <ChevronIcon className={open ? 'is-open' : ''} />
  已完成 <span className="fold-count">{done.length}</span>
</button>
```

保留原有的展开状态逻辑与 `forceShowDone` / `searching` 行为。

- [ ] **Step 2: 空状态文案**

今天：`今天还没有任务，在下面写点什么`；以后展开为空：`以后没有任务`。class 仍为 `.empty`。

- [ ] **Step 3: 列表样式**

`.content` 滚动区、`.content-inner` 左右 6px；`.task-list` 最小高度不变；`.done-section` / `.later-section` 用 `border-top:1px solid var(--line)`；`.fold-toggle` 12px、次要色、圆角 7、悬停 `var(--hover)`；`svg.is-open` 旋转 90°（`transform:rotate(90deg)` + `transition: transform .12s ease`）。滚动条：

```css
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--muted) 35%, transparent); border-radius: 3px; }
```

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 通过。手动检查：已完成 / 以后折叠、搜索时自动展开、拖拽移回今天均正常。

---

### Task 5: 快速添加、搜索、设置、提示条

**Files:**
- Modify: `src/renderer/src/components/QuickAdd.tsx`
- Modify: `src/renderer/src/components/SearchBar.tsx`
- Modify: `src/renderer/src/components/SettingsMenu.tsx`
- Modify: `src/renderer/src/App.tsx`（仅提示条关闭按钮图标）
- Modify: `src/renderer/src/styles.css`（对应段落）

**Interfaces:**
- Consumes: `PlusIcon`、`SearchIcon`、`CloseIcon`。
- Produces: `.quick-add > .quick-field > .add-plus + input.quick-input + .kbd`；搜索栏同一胶囊视觉。

- [ ] **Step 1: 快速添加**

```tsx
<div className="quick-add">
  {hint ? <div className="hint">{hint}</div> : null}
  <form onSubmit={...}>
    <div className="quick-field">
      <span className="add-plus"><PlusIcon size={10} /></span>
      <input className="quick-input" placeholder="写点什么…" ... />
      <span className="kbd" aria-hidden="true">↵</span>
    </div>
  </form>
</div>
```

`.add-plus` 是 17px 松绿圆底 + 白色加号；`.quick-field` 内凹胶囊：`background: rgba(255,255,255,.55)`、`box-shadow: inset 0 0 0 1px rgba(29,42,35,.07)`、`border-radius:10px`、`padding:7px 10px`。深色换成 `rgba(255,255,255,.055)` 与 `rgba(228,235,221,.1)`。

- [ ] **Step 2: 搜索栏**

放大镜改用 `SearchIcon`；输入框包进 `.search-field` 胶囊（同上视觉）；清除/关闭按钮用 `.action` + `CloseIcon`。保留 `autoFocus`、`Escape`、`Enter` 行为与 props。

- [ ] **Step 3: 设置与提示条**

`SettingsMenu` 结构不变，关闭按钮文案保留"收起"；`.setting-row` 12px、次要色；`input[type=range]` / `checkbox` 用 `accent-color: var(--accent)`。`App.tsx` 的提示条关闭按钮换成 `<CloseIcon size={12} />`，保留 `aria-label`；`.banner.warning` 浅色用 `#f3e5c3` / `#5a4310`，深色用 `#3a301a` / `#efd79f`。

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 通过。手动检查：回车添加、时间前缀提示、搜索过滤、设置滑块与勾选、数据损坏提示条。

---

### Task 6: 状态、无障碍与深浅主题验收

**Files:**
- Modify: `src/renderer/src/styles.css`（焦点、动效、高亮、深色补漏）

**Interfaces:**
- Produces: `:focus-visible` 2px 松绿焦点环；`prefers-reduced-motion` 下关闭脉冲；`.row.is-highlighted` 静态底色兜底。

- [ ] **Step 1: 焦点与动效**

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .row.is-highlighted { animation: none; }
  * { transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: 高亮与选中态**

`.row.is-highlighted` 用 `color-mix(in srgb, var(--accent) 16%, transparent)`，脉冲峰值 28%；`.snooze` 按钮保持换行、不挤压文本。

- [ ] **Step 3: 截图验收浅色 / 深色**

启动构建后的应用（或用 CDP `Emulation.setEmulatedMedia` 切 `prefers-color-scheme`），分别截图：默认列表、悬停行、已完成展开、以后展开、提醒高亮、空状态。确认：
- 正文 / 次要文字对比度 ≥ 4.5:1；
- 过期时间在浅色与深色下都清晰；
- 输入框、折叠线、滚动条不抢视线；
- 深色下没有沿用旧的 `#1f1f22` 灰。

- [ ] **Step 4: 键盘检查**

Tab 走一遍标题栏、任务行、折叠、输入框；焦点环可见；Enter / Space 能触发按钮；`Ctrl+F` / `Esc` 正常。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 通过。

---

### Task 7: 版本 1.2.0、文档、安装包

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `README.md`
- Modify: `electron-builder.yml`（Task 1 已加许可，确认无重复）

**Interfaces:**
- Produces: `dist/Less Todo Setup 1.2.0.exe`；`win-unpacked/resources/LXGW-WenKai-OFL.txt`。

- [ ] **Step 1: 升版本**

Run: `npm version 1.2.0 --no-git-tag-version`
Expected: `package.json` / `package-lock.json` 版本均为 `1.2.0`。

- [ ] **Step 2: README 补字体与视觉说明**

在"功能"之后加一节：

```markdown
## 界面与字体

界面采用青瓷色系，跟随系统浅色 / 深色主题。中文使用随应用打包的
[霞鹜文楷 Screen](https://github.com/lxgw/LxgwWenKai)，遵循 SIL Open Font
License 1.1，许可文本随安装包附带（`resources/LXGW-WenKai-OFL.txt`）。
```

- [ ] **Step 3: 全量检查**

Run: `npm test && npm run typecheck && npm run build`
Expected: 全部通过，无 TypeScript 错误。

- [ ] **Step 4: 打安装包**

Run: `npm run build:win`
Expected: `dist/Less Todo Setup 1.2.0.exe` 生成；`dist/win-unpacked/resources/LXGW-WenKai-OFL.txt` 存在；`out/renderer/assets` 含 woff2。

- [ ] **Step 5: 最终目检**

安装包或 `win-unpacked` 启动后，按 spec 的验收清单过一遍：添加、完成、移到以后、提醒、搜索、设置、深色主题、字体离线加载。记录结果，不自动提交。
