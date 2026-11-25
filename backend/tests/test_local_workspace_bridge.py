from __future__ import annotations

from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile
import sys
import subprocess
import unittest

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from app.local_bridge.__main__ import RESOURCE_URI
from app.local_bridge.service import LocalWorkspaceBridge
from app.models.domain import UpdateWorkspaceConfigRequest
from app.services.repository import GraphRepository, RepositoryConflictError


class LocalWorkspaceBridgeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "desktop.sqlite3"
        self.repo = GraphRepository(self.path)
        self.bridge = LocalWorkspaceBridge(self.repo)
        self.graph_id = self.repo.current().workspace.active_graph_id
        self.topic_id = self.repo.graph(self.graph_id).topics[0].id

    def prepare(self, state="learning"):
        graph = self.repo.graph(self.graph_id)
        return self.bridge.prepare(self.graph_id, self.topic_id, state, graph.version, "完成了基础概念练习")

    def test_preparing_never_changes_progress_and_another_repository_sees_the_applied_snapshot(self):
        desktop = GraphRepository(self.path)
        initial = desktop.current().snapshot.id
        draft = self.prepare()
        self.assertEqual(desktop.current().snapshot.id, initial)
        receipt = self.bridge.apply(draft["review"]["id"])
        self.assertGreater(receipt["snapshot_id"], initial)
        self.assertEqual(desktop.graph(self.graph_id).topics[0].state, "learning")
        self.assertEqual(desktop.current().snapshot.source, "local.progress.apply")

    def test_duplicate_apply_is_idempotent_and_survives_bridge_restart(self):
        draft = self.prepare()
        first = self.bridge.apply(draft["review"]["id"])
        restarted = LocalWorkspaceBridge(GraphRepository(self.path))
        second = restarted.apply(draft["review"]["id"])
        self.assertEqual(first["receipt"], second["receipt"])
        self.assertEqual(first["snapshot_id"], second["snapshot_id"])

    def test_stale_review_never_overwrites_newer_desktop_progress(self):
        a, b = self.prepare(), self.prepare("needs_review")
        self.bridge.apply(b["review"]["id"])
        snapshot = self.repo.current().snapshot.id
        with self.assertRaises(RepositoryConflictError): self.bridge.apply(a["review"]["id"])
        self.assertEqual(self.repo.graph(self.graph_id).topics[0].state, "needs_review")
        self.assertEqual(self.repo.current().snapshot.id, snapshot)

    def test_expired_review_is_rejected_without_a_snapshot(self):
        draft = self.prepare()
        initial = self.repo.current().snapshot.id
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("UPDATE local_progress_reviews SET expires_at=0 WHERE id=?", (draft["review"]["id"],))
            conn.commit()
        with self.assertRaises(ValueError): self.bridge.apply(draft["review"]["id"])
        self.assertEqual(self.repo.current().snapshot.id, initial)

    def test_completed_progress_requires_existing_test_evidence(self):
        with self.assertRaisesRegex(ValueError, "完成测验"): self.prepare("solid")
        self.repo.update_workspace_config(UpdateWorkspaceConfigRequest(enable_closure_tests=False))
        draft = self.prepare("solid")
        self.bridge.apply(draft["review"]["id"])
        self.assertEqual(self.repo.graph(self.graph_id).topics[0].state, "solid")

    def test_workspace_payload_omits_connection_secrets_and_reads_current_revision(self):
        payload = self.bridge.workspace()
        self.assertEqual(payload["source"], "local_desktop")
        self.assertNotIn("config", payload)
        self.assertNotIn("credentials", payload)
        self.assertEqual(payload["graph"]["graph_id"], self.graph_id)


class LocalBridgeStdioTests(unittest.IsolatedAsyncioTestCase):
    def test_eof_exits_cleanly_and_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / "desktop.sqlite3"
            html = Path(directory) / "workspace.html"
            html.write_text("<!doctype html><p>Local workspace</p>", encoding="utf-8")
            executable = os.environ.get("CLEW_BRIDGE_EXECUTABLE")
            command = [executable, "--local-bridge"] if executable else [sys.executable, "-m", "app.local_bridge"]
            command += ["--db", str(db), "--ui", str(html)]
            environment = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])}
            missing = subprocess.run(command, input="", capture_output=True, text=True, timeout=15, env=environment)
            self.assertNotEqual(missing.returncode, 0)
            self.assertFalse(db.exists())
            GraphRepository(db)
            result = subprocess.run(command, input="", capture_output=True, text=True, timeout=15, env=environment)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    async def test_real_stdio_tools_resource_review_and_shared_database(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / "desktop.sqlite3"
            html = Path(directory) / "workspace.html"
            html.write_text("<!doctype html><p>Local workspace</p>", encoding="utf-8")
            desktop = GraphRepository(db)
            graph = desktop.current().workspace.graphs[0]
            executable = os.environ.get("CLEW_BRIDGE_EXECUTABLE")
            parameters = StdioServerParameters(command=executable or sys.executable,
                args=(["--local-bridge"] if executable else ["-m", "app.local_bridge"]) + ["--db", str(db), "--ui", str(html)],
                env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1])})
            async with stdio_client(parameters) as (reader, writer):
                async with ClientSession(reader, writer) as session:
                    await session.initialize()
                    definitions = {item.name: item for item in (await session.list_tools()).tools}
                    self.assertEqual(definitions["apply_local_progress"].meta["ui"]["visibility"], ["app"])
                    resource = (await session.read_resource(RESOURCE_URI)).contents[0]
                    self.assertEqual(resource.mimeType, "text/html;profile=mcp-app")
                    self.assertEqual(resource.meta["ui"]["csp"]["connectDomains"], [])
                    initial = await session.call_tool("open_local_workspace", {})
                    self.assertEqual(initial.structuredContent["snapshot_id"], desktop.current().snapshot.id)
                    draft = await session.call_tool("prepare_local_progress", {"graph_id": graph.graph_id,
                        "topic_id": graph.topics[0].id, "state": "learning", "expected_graph_version": graph.version, "reason": "已完成概念练习"})
                    self.assertFalse(draft.isError, draft.content)
                    result = await session.call_tool("apply_local_progress", {"review_id": draft.structuredContent["review"]["id"]})
                    self.assertFalse(result.isError, result.content)
                    self.assertEqual(desktop.graph(graph.graph_id).topics[0].state, "learning")
                    # A separate desktop write appears on the next MCP read without restarting either process.
                    desktop.mark_topic_finished(graph.graph_id, graph.topics[1].id)
                    updated = await session.call_tool("open_local_workspace", {"graph_id": graph.graph_id})
                    self.assertEqual(updated.structuredContent["snapshot_id"], desktop.current().snapshot.id)
                    self.assertEqual(updated.structuredContent["graph"]["topics"][1]["state"], "solid")
