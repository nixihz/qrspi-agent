"""
QRSPI Context 装配

把阶段产物压缩成当前阶段真正需要的 focused context，
避免把整个历史直接塞给执行器。
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List

from qrspi.workflow import QRSPIWorkflow, Stage


@dataclass
class ContextEntry:
    stage: str
    artifact_path: str
    summary: str


@dataclass
class ContextPack:
    stage: str
    entries: List[ContextEntry] = field(default_factory=list)
    focused_context: str = ""

    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")
        return path


class ContextBuilder:
    """按阶段构建最小必要上下文。"""

    def __init__(self, workflow: QRSPIWorkflow, max_chars_per_artifact: int = 2400):
        self.workflow = workflow
        self.max_chars_per_artifact = max_chars_per_artifact

    def build(self, stage: Stage) -> ContextPack:
        deps = Stage.get_dependencies(stage)
        entries: List[ContextEntry] = []
        blocks: List[str] = []

        for dep in deps:
            artifact_path = self.workflow.latest_artifact_path(dep)
            if not artifact_path:
                continue

            raw = artifact_path.read_text(encoding="utf-8")
            summary = self._summarize(raw)
            entries.append(
                ContextEntry(
                    stage=dep.value,
                    artifact_path=str(artifact_path),
                    summary=summary,
                )
            )
            blocks.append(f"## {dep.full_name}\n\n{summary}")

        focused = "\n\n---\n\n".join(blocks)
        return ContextPack(stage=stage.value, entries=entries, focused_context=focused)

    def _summarize(self, content: str) -> str:
        lines = [line.rstrip() for line in content.splitlines() if line.strip()]
        cleaned = "\n".join(lines[:40])
        if len(cleaned) > self.max_chars_per_artifact:
            return cleaned[: self.max_chars_per_artifact].rstrip() + "\n...[truncated]"
        return cleaned
