from __future__ import annotations

import secrets
import time
from copy import deepcopy

from app.core.config import Settings
from app.models.domain import WorkspaceDocument
from app.services.quiz_service import QuizService
from app.services.repository import GraphRepository, RepositoryConflictError
from app.services.repository_storage import load_current_workspace

STATES = {"not_started", "learning", "shaky", "solid", "mastered", "needs_review"}


class LocalWorkspaceBridge:
    def __init__(self, repository: GraphRepository):
        self.repository = repository
        with repository._connect() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS local_progress_reviews (
                id TEXT PRIMARY KEY, graph_id TEXT NOT NULL, topic_id TEXT NOT NULL,
                graph_version INTEGER NOT NULL, old_state TEXT NOT NULL, new_state TEXT NOT NULL,
                reason TEXT NOT NULL, expires_at REAL NOT NULL, applied_snapshot_id INTEGER)""")

    def workspace(self, graph_id: str | None = None) -> dict:
        envelope = self.repository.current()
        workspace = envelope.workspace
        selected = graph_id or workspace.active_graph_id
        graph = next((item for item in workspace.graphs if item.graph_id == selected), None)
        if selected and graph is None:
            raise ValueError("图谱不存在，请刷新后重新选择。")
        return {
            "source": "local_desktop", "snapshot_id": envelope.snapshot.id,
            "graphs": [{"graph_id": item.graph_id, "title": item.title, "version": item.version} for item in workspace.graphs],
            "graph": graph.model_dump(mode="json") if graph else None,
        }

    @staticmethod
    def _validate_completion(graph, topic, state: str, config) -> None:
        if state not in {"solid", "mastered"}:
            return
        if not config.enable_closure_tests:
            return
        closure = QuizService(Settings(), require_prerequisites=config.require_prerequisite_closure_for_completion).build_closure_status(graph, topic.id)
        if not closure.can_award_completion:
            raise ValueError("该主题的先修条件已变化，请先在桌面版检查完成条件。")
        if not any(attempt.topic_id == topic.id and attempt.passed and attempt.closure_awarded for attempt in graph.quiz_attempts):
            raise ValueError("请先在桌面版通过该主题的完成测验，再同步已掌握状态。")

    def prepare(self, graph_id: str, topic_id: str, state: str, expected_graph_version: int, reason: str) -> dict:
        if state not in STATES:
            raise ValueError("Unknown progress state.")
        reason = reason.strip()
        if not reason or len(reason) > 1000:
            raise ValueError("请提供不超过 1000 字的学习依据。")
        envelope = self.repository.current()
        graph = next((item for item in envelope.workspace.graphs if item.graph_id == graph_id), None)
        if graph is None:
            raise ValueError("图谱不存在。")
        if graph.version != expected_graph_version:
            raise RepositoryConflictError("图谱已更新，请刷新后重新准备进度修改。")
        topic = next((item for item in graph.topics if item.id == topic_id), None)
        if topic is None:
            raise ValueError("Topic not found.")
        self._validate_completion(graph, topic, state, envelope.workspace.config)
        review = {"id": secrets.token_hex(16), "graph_id": graph_id, "topic_id": topic_id,
                  "topic_title": topic.title, "graph_version": graph.version,
                  "old_state": topic.state, "new_state": state, "reason": reason,
                  "expires_at": time.time() + 600}
        with self.repository._connect() as conn:
            conn.execute("INSERT INTO local_progress_reviews (id,graph_id,topic_id,graph_version,old_state,new_state,reason,expires_at) VALUES (?,?,?,?,?,?,?,?)",
                         tuple(review[key] for key in ["id", "graph_id", "topic_id", "graph_version", "old_state", "new_state", "reason", "expires_at"]))
        return {**self.workspace(graph_id), "review": review}

    def apply(self, review_id: str) -> dict:
        with self.repository._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT * FROM local_progress_reviews WHERE id=?", (review_id,)).fetchone()
            if row is None:
                raise ValueError("进度修改不存在。")
            if row["applied_snapshot_id"] is not None:
                receipt = int(row["applied_snapshot_id"])
            else:
                if row["expires_at"] < time.time():
                    raise ValueError("进度修改已过期，请重新准备。")
                current = load_current_workspace(conn)
                workspace = WorkspaceDocument.model_validate(deepcopy(current.workspace.model_dump()))
                graph = next((item for item in workspace.graphs if item.graph_id == row["graph_id"]), None)
                if graph is None or graph.version != row["graph_version"]:
                    raise RepositoryConflictError("图谱已更新，本次进度修改尚未应用；请刷新后重试。")
                topic = next((item for item in graph.topics if item.id == row["topic_id"]), None)
                if topic is None or topic.state != row["old_state"]:
                    raise RepositoryConflictError("主题进度已改变，请刷新后重试。")
                self._validate_completion(graph, topic, row["new_state"], workspace.config)
                topic.state = row["new_state"]
                receipt = self.repository._insert_snapshot(conn, workspace, source="local.progress.apply",
                    reason=row["reason"], parent_snapshot_id=current.snapshot.id)
                conn.execute("UPDATE local_progress_reviews SET applied_snapshot_id=? WHERE id=?", (receipt, review_id))
        return {**self.workspace(row["graph_id"]), "receipt": {"review_id": review_id, "snapshot_id": receipt}}
