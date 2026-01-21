import json
import sqlite3
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


def utc_now() -> str:
    """Return current UTC timestamp string for DB columns."""
    return datetime.utcnow().isoformat(timespec="seconds")


@dataclass
class ShotRecord:
    display_index: int
    script_text: str
    image_prompt: str
    negative_prompt: str
    image_path: str
    audio_path: Optional[str] = None
    voice_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ProjectDatabase:
    """Lightweight SQLite helper for persisting projects and shots."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        if not self.db_path.parent.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    theme TEXT NOT NULL,
                    style TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft',
                    aspect_ratio TEXT NOT NULL,
                    scene_count INTEGER NOT NULL,
                    config_json TEXT,
                    audio_path TEXT,
                    video_path TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS shots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    display_index INTEGER NOT NULL,
                    script_text TEXT NOT NULL,
                    image_prompt TEXT NOT NULL,
                    negative_prompt TEXT,
                    image_path TEXT NOT NULL,
                    audio_path TEXT,
                    metadata_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(project_id, display_index)
                );
                """
            )
            # 迁移：为已存在的 shots 表添加 audio_path 列
            try:
                conn.execute("ALTER TABLE shots ADD COLUMN audio_path TEXT")
            except sqlite3.OperationalError:
                # 列已存在，忽略错误
                pass
            # 迁移：为已存在的 shots 表添加 voice_id 列
            try:
                conn.execute("ALTER TABLE shots ADD COLUMN voice_id TEXT")
            except sqlite3.OperationalError:
                # 列已存在，忽略错误
                pass

    # ------------------------------------------------------------------ Projects
    def create_project(
        self,
        *,
        theme: str,
        style: str,
        aspect_ratio: str,
        scene_count: int,
        status: str = "draft",
        config: Optional[Dict[str, Any]] = None,
    ) -> int:
        now = utc_now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO projects (
                    theme, style, status, aspect_ratio, scene_count,
                    config_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    theme,
                    style,
                    status,
                    aspect_ratio,
                    scene_count,
                    json.dumps(config or {}, ensure_ascii=False),
                    now,
                    now,
                ),
            )
            return int(cur.lastrowid)

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM projects ORDER BY id DESC"
            ).fetchall()
            return [self._row_to_project(row, include_config=True, include_shots=False) for row in rows]

    def get_project(self, project_id: int, include_shots: bool = False) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not row:
                return None
            project = self._row_to_project(row, include_config=True, include_shots=False)
            if include_shots:
                project["shots"] = self.get_shots(project_id)
            return project

    def update_project(
        self,
        project_id: int,
        *,
        status: Optional[str] = None,
        audio_path: Optional[str] = None,
        video_path: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        fields: List[str] = []
        values: List[Any] = []
        if status is not None:
            fields.append("status = ?")
            values.append(status)
        if audio_path is not None:
            fields.append("audio_path = ?")
            values.append(audio_path)
        if video_path is not None:
            fields.append("video_path = ?")
            values.append(video_path)
        if config is not None:
            fields.append("config_json = ?")
            values.append(json.dumps(config, ensure_ascii=False))

        if not fields:
            return

        fields.append("updated_at = ?")
        values.append(utc_now())
        values.append(project_id)

        with self._connect() as conn:
            conn.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id = ?", values)

    # ------------------------------------------------------------------ Shots
    def get_shots(self, project_id: int) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM shots WHERE project_id = ? ORDER BY display_index ASC",
                (project_id,),
            ).fetchall()
            return [self._row_to_shot(row) for row in rows]

    def replace_shots(self, project_id: int, shots: List[ShotRecord]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM shots WHERE project_id = ?", (project_id,))
            now = utc_now()
            for shot in shots:
                metadata = shot.metadata or {}
                conn.execute(
                    """
                    INSERT INTO shots (
                        project_id, display_index, script_text, image_prompt,
                        negative_prompt, image_path, audio_path, voice_id, metadata_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        shot.display_index,
                        shot.script_text,
                        shot.image_prompt,
                        shot.negative_prompt,
                        shot.image_path,
                        shot.audio_path,
                        shot.voice_id,
                        json.dumps(metadata, ensure_ascii=False),
                        now,
                        now,
                    ),
                )

    def update_shots(self, project_id: int, shots: List[Dict[str, Any]]) -> None:
        """Update editable fields for a batch of shots."""
        with self._connect() as conn:
            for shot in shots:
                voice_id = shot.get("voice_id")
                if voice_id is not None and voice_id == "":
                    voice_id = None
                conn.execute(
                    """
                    UPDATE shots
                    SET script_text = ?, image_prompt = ?, negative_prompt = ?, image_path = ?, voice_id = ?, updated_at = ?
                    WHERE id = ? AND project_id = ?
                    """,
                    (
                        shot["script_text"],
                        shot["image_prompt"],
                        shot.get("negative_prompt") or "",
                        shot["image_path"],
                        voice_id,
                        utc_now(),
                        shot["id"],
                        project_id,
                    ),
                )

    def update_shot_audio_path(self, shot_id: int, audio_path: str) -> None:
        """更新单个分镜的音频路径"""
        with self._connect() as conn:
            conn.execute(
                "UPDATE shots SET audio_path = ?, updated_at = ? WHERE id = ?",
                (audio_path, utc_now(), shot_id)
            )

    # ------------------------------------------------------------------ Helpers
    def _row_to_project(
        self,
        row: sqlite3.Row,
        *,
        include_config: bool,
        include_shots: bool,
    ) -> Dict[str, Any]:
        project = {
            "id": row["id"],
            "theme": row["theme"],
            "style": row["style"],
            "status": row["status"],
            "aspect_ratio": row["aspect_ratio"],
            "scene_count": row["scene_count"],
            "audio_path": row["audio_path"],
            "video_path": row["video_path"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        if include_config:
            try:
                project["config"] = json.loads(row["config_json"]) if row["config_json"] else {}
            except json.JSONDecodeError:
                project["config"] = {}
        if include_shots:
            project["shots"] = self.get_shots(row["id"])
        return project

    def _row_to_shot(self, row: sqlite3.Row) -> Dict[str, Any]:
        try:
            metadata = json.loads(row["metadata_json"]) if row["metadata_json"] else {}
        except json.JSONDecodeError:
            metadata = {}
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "index": row["display_index"],
            "script_text": row["script_text"],
            "image_prompt": row["image_prompt"],
            "negative_prompt": row["negative_prompt"] or "",
            "image_path": row["image_path"],
            "audio_path": row["audio_path"],
            "voice_id": row["voice_id"],
            "metadata": metadata,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
