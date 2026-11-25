# Clew Local：与桌面版共用进度

Clew Local 是本分支的自用 Codex 插件。它直接打开同一台电脑上的 Clew 桌面数据库，显示已有图谱、笔记和学习状态，无需重复导入。官方托管 Clew 插件仍使用自己的云端数据。

## 安装

先构建本分支桌面版，并至少启动一次以创建工作区。插件运行时使用随桌面打包的 `ClewBackend.exe`，不依赖系统 Python 或 Node。以下源码安装命令需要构建环境的 Python，以及已安装的 Codex CLI：

```powershell
npm --prefix frontend run build:plugin
.\.venv\Scripts\python plugins/clew-local/install.py --backend 'D:\Clew\Clew\resources\backend\ClewBackend.exe' --activate
```

请将后端路径改成自己的安装目录；必须使用包含本功能的新后端。默认数据库为 `%APPDATA%\clew\data\knowledge_graph.sqlite3`，可以用 `--db` 指定。不存在的数据库会明确报错，不会创建空地图替代。生成的自用市场和插件放在 `%LOCALAPPDATA%\ClewLocal`；其中只有运行路径和界面，没有登录凭据。

安装后重启 Codex 或新建对话，让宿主加载新插件。选择 **Clew Local**，发送“打开我的桌面学习图谱”。如需手动注册已生成的插件：

```powershell
codex plugin marketplace add "$env:LOCALAPPDATA\ClewLocal" --json
codex plugin add clew-local@clew-personal --json
```

## 使用

- 桌面通过测验或修改图谱后，插件窗口约 4 秒自动刷新；重新切回窗口也会刷新。
- 对话中读取主题和学习进度，讲解后可以准备进度修改。在插件预览中点击“应用进度”，桌面约 3 秒后刷新。
- 桌面编辑布局、设置或作答期间暂停自动刷新，结束后继续。隐藏窗口暂停轮询，重新聚焦后更新。
- 每次应用都会创建快照，可在桌面设置中回退。发生版本冲突或预览超过十分钟，需要重新准备修改，避免覆盖别处的新进度。
- 开启完成测验时，“已掌握”需要已有合格测验记录；插件不会代替你作答或伪造通过记录。完整测验仍在桌面进行。

桌面程序可以关闭，插件仍能使用同一个数据库。需要两边指向同一文件；不要把正在使用的 SQLite 文件直接放进通用网盘做跨电脑双向同步。图谱和相关学习上下文会被当前助手读取，用于对话中的讲解。

## 更新与移除

更新本分支后重新构建桌面及插件界面，再运行安装命令。Codex 若缓存旧版本，可先执行 `codex plugin remove clew-local@clew-personal`，再运行安装命令并重启。移除插件不会删除桌面数据库。

本功能不回写官方托管插件，也不跨电脑同步；两者可以同时保留。使用时选择 Clew Local，避免把云端地图当作桌面实时进度。
