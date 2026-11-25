"""Build-independent Windows installer for the local plugin (no account tokens)."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess


def install(backend: Path, output: Path, db: Path, *, activate: bool = False) -> Path:
    source = Path(__file__).resolve().parent
    html = source / "dist/workspace.html"
    if not backend.is_file() or not db.is_file() or not html.is_file():
        raise FileNotFoundError("Build the plugin UI and backend, and open Clew once before installing.")
    root = output.resolve()
    plugin = root / "clew-local"
    (plugin / ".codex-plugin").mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / ".codex-plugin/plugin.json", plugin / ".codex-plugin/plugin.json")
    shutil.copy2(html, plugin / "workspace.html")
    config = {"mcpServers": {"clew-local": {"command": str(backend.resolve()),
        "args": ["--local-bridge", "--db", str(db.resolve()), "--ui", str(plugin / "workspace.html")]}}}
    (plugin / "mcp.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    marketplace = {"name": "clew-personal", "owner": {"name": "add1cter"},
        "plugins": [{"name": "clew-local", "source": "./clew-local", "description": "Clew desktop shared workspace"}]}
    (root / ".agents/plugins").mkdir(parents=True, exist_ok=True)
    (root / ".agents/plugins/marketplace.json").write_text(json.dumps(marketplace, ensure_ascii=False, indent=2), encoding="utf-8")
    if activate:
        # Invoke the supported native CLI directly, never a shell-built command.
        cli = shutil.which("codex.exe") or shutil.which("codex.cmd") or shutil.which("codex")
        if not cli:
            raise FileNotFoundError("Codex CLI not found; install the generated local marketplace in Codex.")
        subprocess.run([cli, "plugin", "marketplace", "add", str(root), "--json"], check=True)
        subprocess.run([cli, "plugin", "add", "clew-local@clew-personal", "--json"], check=True)
    return root


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--db", type=Path, default=Path(os.environ.get("APPDATA", str(Path.home()))) / "clew/data/knowledge_graph.sqlite3")
    parser.add_argument("--output", type=Path, default=Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ClewLocal")
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    print(install(args.backend, args.output, args.db, activate=args.activate))
