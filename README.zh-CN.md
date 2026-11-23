# Clew Windows 自用版

[English](README.md) · [简体中文](README.zh-CN.md)

基于 [miuuyy/Clew](https://github.com/miuuyy/Clew) 的个人定制分支，主要用于 Windows 下的中文学习。Clew 用本地知识图谱组织学习主题、先修关系、测验和进度。

## 本分支的修改

- 修复 Windows 较长的 ChatGPT 登录凭据写入问题，拆分存入系统凭据库并验证完整性。
- 测验题目、选项和解析使用知识图谱的语言；修改图谱语言后重新生成旧语言的测验。
- 支持按工作区关闭先修主题的完成限制，保留先修关系和提示。
- 仅构建和发布 Windows x64 安装包，保留其它平台源码，方便以后合并上游更新。
- 新构建的更新检查和发布目标指向 [add1cter/Clew](https://github.com/add1cter/Clew/releases)。

## 使用

发布的 Windows 安装包会放在本仓库的 [Releases](https://github.com/add1cter/Clew/releases)。也可以按下文自行构建。

打开 Clew，选择 **使用 ChatGPT 继续**。应用需要 ChatGPT Plus 或 Pro 订阅，并需要授权使用订阅用量。

要生成中文测验，请将**知识图谱语言**设为简体中文（`zh-CN`），界面语言是另一项独立设置。要直接测验尚未完成先修主题的章节，将工作区配置 `require_prerequisite_closure_for_completion` 设为 `false`；通过后只完成当前主题。

图谱、对话和学习进度保存在本地工作区数据库中，登录凭据保存在系统凭据库中。AI 请求会将对话和相关学习上下文发送给 OpenAI。个人工作区的设置和数据不包含在本仓库中。

## 构建 Windows x64

准备 Windows x64、Node.js 22.22.2 或更高版本，以及带 Python 启动器的 Python 3.12。在 PowerShell 中运行：

```powershell
git clone https://github.com/add1cter/Clew.git
cd Clew
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e backend -r desktop/requirements.txt
npm ci
npm --prefix frontend ci
npm run package -- --win --x64 --publish never
npm run smoke:package
```

安装包输出到 `desktop/artifacts/`。开发时可在安装依赖后运行 `npm run dev`。更多环境说明见[桌面开发文档](docs/DESKTOP.zh-CN.md)，本分支的构建和发布范围为 Windows x64。

也可以在 GitHub Actions 中手动运行 **Release** 工作流并下载构建产物。如果 GitHub 提示未启用 Actions，需先在本 fork 中启用。版本标签构建会准备草稿发布，由仓库所有者正式发布。

## 上游与维护

这是个人定制分支，与官方项目分别维护。这里的修改作用于本仓库的桌面版源码；ChatGPT 中的托管插件由上游运营。

原项目为 [miuuyy/Clew](https://github.com/miuuyy/Clew)，作者 Aleksandr Vechenkov。保留原作者版权声明和 [MIT 许可证](LICENSE)。

更多说明：[自用分支说明](docs/PERSONAL_FORK.md) · [架构文档](docs/ARCHITECTURE.md) · [上游仓库](https://github.com/miuuyy/Clew)
