# Clew for Windows — Personal Fork

[English](README.md) · [简体中文](README.zh-CN.md)

A personal Windows fork of [miuuyy/Clew](https://github.com/miuuyy/Clew), focused on Chinese-language study. Clew organizes learning topics, prerequisites, quizzes and progress in a local knowledge graph.

## Changes in this fork

- Fix storage of long ChatGPT login credentials on Windows by splitting them into verified entries in the OS credential store.
- Generate quiz questions, choices and explanations in the graph's language. Regenerate cached quizzes when the graph language changes.
- Allow prerequisite completion requirements to be disabled per workspace, while preserving prerequisite relationships and hints.
- Build and release Windows x64 only. Keep other platform source files to make upstream merges easier.
- Point new builds' update checks and release publishing to [add1cter/Clew](https://github.com/add1cter/Clew/releases).
- Improve Chinese graph labels and direct-neighbor focus while retaining Clew's chapter clusters and lighting. Both 2D and 3D support dragging nodes and gentle cursor repulsion.

## Use

Windows installers, when published, are available from this fork's [Releases](https://github.com/add1cter/Clew/releases). You can also build from source below.

Open Clew and choose **Continue with ChatGPT**. The app requires a ChatGPT Plus or Pro plan and permission to use that plan.

For Chinese quizzes, set the **graph language** to Simplified Chinese (`zh-CN`); the interface language is a separate preference. To allow completion tests before prerequisites are finished, set the workspace configuration `require_prerequisite_closure_for_completion` to `false`. Passing a test then completes only its target topic.

Graphs, conversations and learning progress stay in the local workspace database. Login credentials stay in the OS credential store. AI requests send the conversation and relevant learning context to OpenAI. Personal workspace settings and data are not included in this repository.

## Build Windows x64

Use Windows x64, Node.js 22.22.2 or newer, and Python 3.12 installed with the Python launcher. Run in PowerShell:

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

The installer is written to `desktop/artifacts/`. For development, run `npm run dev` after installing dependencies. See [desktop development](docs/DESKTOP.md) for more details; the build and release scope of this fork is Windows x64.

The **Release** GitHub Actions workflow can also be run manually to produce downloadable build artifacts. Enable Actions in the fork first if GitHub requests it. Version tags prepare a draft release; the repository owner publishes it.

## Upstream and maintenance

This is a personal customization, maintained separately from the official project. Changes here apply to the desktop source in this repository; the hosted ChatGPT plugin is operated by upstream.

The original project is [miuuyy/Clew](https://github.com/miuuyy/Clew), created by Aleksandr Vechenkov. The original copyright notice and [MIT license](LICENSE) are retained.

More: [fork notes](docs/PERSONAL_FORK.md) · [architecture](docs/ARCHITECTURE.md) · [upstream repository](https://github.com/miuuyy/Clew)
