# Less Todo

一个常驻 Windows 桌面的置顶待办小窗：一眼看清今天要做什么，随手记下临时任务，到点弹出系统提醒。

## 功能

- **置顶小窗**：固定停靠屏幕右上角，可拖动、记忆位置；不抢任务栏。
- **今天 / 以后**：回车添加默认进入"今天"；不属于今天的事一键收进"以后"，再拖回来。
- **快速添加**：在输入框直接写 `10:00 交周报`、`10点30分 开会`，自动设当天提醒；时间已过则只记任务并给出轻提示。
- **提醒**：到点发 Windows 系统通知 + 提示音，并在窗口内高亮该任务；可"稍后提醒 5 / 10 分钟"。重启应用不会重复提醒。
- **搜索**：`Ctrl+F` 或点 🔍，两个列表加上已完成任务一起过滤。
- **跨天结转**：没做完的任务第二天仍留在今天；已完成任务自动清除；过期提醒不补发。
- **快捷键**：`Ctrl+Shift+Space` 随时显示 / 隐藏小窗；托盘菜单同样会标出。
- **托盘常驻**：关闭窗口收进托盘，提醒照常；托盘菜单可显示/隐藏、开关开机自启、退出。
- **设置**：窗口透明度、始终置顶、开机自启。
- **本地数据**：不上传、不联网；数据损坏时自动从备份恢复并提示。

## 界面与字体

界面采用青瓷色系，跟随系统浅色 / 深色主题。中文使用随应用打包的
[霞鹜文楷 Screen](https://github.com/lxgw/LxgwWenKai)，遵循 SIL Open Font
License 1.1；许可文本随安装包附带（`resources/LXGW-WenKai-OFL.txt`）。

## 开发

需要 Node 22+（Windows 10/11）。

```bash
npm install
npm run dev        # 启动开发模式
npm test           # 运行单元测试（时间解析、排序、结转、存储、提醒、窗口位置）
npm run typecheck  # TypeScript 类型检查
```

首次安装如果 Electron 二进制下载失败，可先设置镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## 打包安装包

```bash
npm run build:win
```

产物在 `dist/`，运行 `Less Todo Setup x.y.z.exe` 安装。安装版才会完整支持系统通知与开机自启（Windows 通知依赖开始菜单快捷方式的 AUMID）。

如果 electron-builder 下载构建工具失败，可设置：

```bash
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 数据与备份

数据保存在 `%APPDATA%\less-todo-window\`：

- `data.json`：任务与上次结转日期（`lastRolloverDay`）。
- `data.json.bak1..3`：最近三次写入的备份，主文件损坏时自动回退。
- `settings.json`：窗口位置、透明度、置顶、开机自启。

卸载时该目录会保留；需要彻底清除请手动删除。

## 已知限制

- 仅支持 Windows。
- 不做账号、云同步、多人协作。
- 不留历史记录与统计：跨天时已完成任务直接删除。
- 不支持重复任务、子任务、标签、优先级。
- 无自动更新，升级需重新安装。
- 只提供 NSIS 安装包，不提供便携版。
