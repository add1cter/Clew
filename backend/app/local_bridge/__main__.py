from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import sys

import anyio
from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.server.lowlevel.helper_types import ReadResourceContents

from app.local_bridge.service import LocalWorkspaceBridge, STATES
from app.mcp_server import tools as read_tools
from app.services.repository import GraphRepository

RESOURCE_URI = "ui://clew-local/workspace.html"


def build_server(bridge: LocalWorkspaceBridge, html_path: Path) -> Server:
    server = Server("Clew Local", instructions=(
        "Clew Local shares the user's desktop database. Read open_local_workspace before discussing progress. "
        "Use read_local_topic for lesson context. When the user wants to record study progress, prepare_local_progress "
        "stages a review only; the user applies it in the UI. Never claim a staged change is saved. "
        "Closed states require an actual desktop completion-test record when closure tests are enabled. "
        "The hosted Clew plugin is separate; these tools use local desktop data."))
    schema = lambda props, required: {"type": "object", "properties": props, "required": required, "additionalProperties": False}
    text = {"type": "string", "minLength": 1, "maxLength": 160}
    ui = {"ui": {"resourceUri": RESOURCE_URI, "visibility": ["model", "app"]}, "openai/outputTemplate": RESOURCE_URI}
    definitions = [
        types.Tool(name="open_local_workspace", description="打开与桌面版共用的本地学习图谱和最新进度。", inputSchema=schema({"graph_id": text}, []),
            annotations=types.ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False), _meta=ui),
        types.Tool(name="read_local_topic", description="读取桌面图谱中主题的讲解上下文、资源、笔记和邻居。", inputSchema=schema({"graph_id": text, "topic_id": text}, ["graph_id", "topic_id"]),
            annotations=types.ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)),
        types.Tool(name="prepare_local_progress", description="准备主题进度修改供用户审阅；不会立即改变进度。", inputSchema=schema({
            "graph_id": text, "topic_id": text, "state": {"type": "string", "enum": sorted(STATES)},
            "expected_graph_version": {"type": "integer", "minimum": 1}, "reason": {"type": "string", "minLength": 1, "maxLength": 1000}},
            ["graph_id", "topic_id", "state", "expected_graph_version", "reason"]),
            annotations=types.ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False), _meta=ui),
        types.Tool(name="apply_local_progress", description="仅在用户点击应用进度后提交已保存的审阅；校验版本并创建可回退快照。", inputSchema=schema({"review_id": text}, ["review_id"]),
            annotations=types.ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=False), _meta={"ui": {"visibility": ["app"]}}),
    ]

    @server.list_tools()
    async def list_tools():
        return definitions

    @server.list_resources()
    async def list_resources():
        return [types.Resource(uri=RESOURCE_URI, name="Clew Local workspace", mimeType="text/html;profile=mcp-app")]

    @server.read_resource()
    async def read_resource(uri):
        if str(uri) != RESOURCE_URI:
            raise ValueError("Unknown resource.")
        return [ReadResourceContents(content=html_path.read_text(encoding="utf-8"), mime_type="text/html;profile=mcp-app",
            meta={"ui": {"prefersBorder": False, "csp": {"connectDomains": [], "resourceDomains": []}}})]

    @server.call_tool()
    async def call_tool(name, arguments):
        args = arguments or {}
        try:
            if name == "open_local_workspace":
                result = bridge.workspace(args.get("graph_id"))
            elif name == "read_local_topic":
                result = read_tools.get_node(bridge.repository.current().workspace, graph_id=args["graph_id"], node_id=args["topic_id"])
            elif name == "prepare_local_progress":
                result = bridge.prepare(args["graph_id"], args["topic_id"], args["state"], args["expected_graph_version"], args["reason"])
            elif name == "apply_local_progress":
                result = bridge.apply(args["review_id"])
            else:
                raise ValueError("Unknown local tool.")
            return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False))], structuredContent=result)
        except (KeyError, ValueError) as exc:
            return types.CallToolResult(content=[types.TextContent(type="text", text=str(exc))], isError=True)

    return server


async def run(db_path: Path, html_path: Path):
    if not db_path.is_file():
        raise FileNotFoundError("Desktop database not found. Open Clew once or set CLEW_DB_PATH.")
    if not html_path.is_file():
        raise FileNotFoundError("Build the local plugin UI before starting its server.")
    server = build_server(LocalWorkspaceBridge(GraphRepository(db_path)), html_path)
    # Keep ownership of the process handles. The SDK's temporary TextIOWrapper
    # otherwise closes stdout before the frozen Windows bootloader's final flush.
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8")
    async with stdio_server(stdin=anyio.wrap_file(sys.stdin), stdout=anyio.wrap_file(sys.stdout)) as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=Path(os.environ.get("CLEW_DB_PATH", str(Path(os.environ.get("APPDATA", Path.home())) / "clew/data/knowledge_graph.sqlite3"))))
    parser.add_argument("--ui", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(run(args.db.resolve(), args.ui.resolve()))


if __name__ == "__main__":
    main()
