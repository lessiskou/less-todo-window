# 全局快捷键显示/隐藏窗口 — 设计

日期：2026-11-19

## 意图

窗口一旦收起，当前唯一入口是托盘（左键或右键菜单），需要找图标、多点一次。目标是按一个组合键就能随时把小窗叫出来，再按一次收起。

## 目标

- 全局生效（应用不在前台时也能触发）。
- 一个固定键位：`Ctrl+Shift+Space`，作为常量保存在主进程，需要时可改。
- 窗口可见时按下 → 隐藏；隐藏时按下 → 显示并聚焦。
- 托盘菜单中标注该快捷键，让用户能发现。

## 非目标

- 不做自定义/录制快捷键（方案 B 已排除）。
- 不做键位冲突检测与提示。
- 不改变托盘、提醒弹窗、二次启动对窗口显示/隐藏的既有行为。

## 约束

- 全局快捷键是独占的：注册后其他程序收不到该组合。
- Electron `globalShortcut` 必须在应用 ready 后注册，退出前注销，否则会残留无效热键。

## 方案

采用 Electron 内置 `globalShortcut`。

考虑过但未采用的两种：

- 在窗口内监听键盘事件：窗口隐藏时没有焦点，按键收不到，无法满足"随时叫出来"。
- 用 `iohook` 之类的低级键盘钩子：能实现，但要装原生依赖、杀软误报风险高，对一个轻量小工具过重。

## 实现要点

1. `src/main/index.ts`
   - 顶部定义 `const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+Space'`。
   - `setup()` 内提取 `toggleWindow()` 函数（可见则 hide，否则 show + focus），托盘回调与快捷键共用，消除重复逻辑。
   - 在 `app.whenReady()` 后注册；注册返回 `false` 时 `console.warn` 记录，不影响启动。
   - `app.on('will-quit')` 中调用 `globalShortcut.unregisterAll()`。
2. `src/main/tray.ts`
   - `TrayDeps` 增加 `shortcutLabel: string`；「显示 / 隐藏」菜单项 label 改为带快捷键后缀（如 `显示 / 隐藏  Ctrl+Shift+Space`）。
3. `README.md`
   - 「功能」列表补充一条快捷键说明。

## 留给实现者

- 快捷键标签的文案格式。
- 是否需要为 `toggleWindow` 写单元测试（主进程依赖 Electron 运行时，现有测试只覆盖纯函数，倾向不写）。
