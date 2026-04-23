"""
阶段产物解析器

把 markdown / JSON 产物转成更稳定的结构化数据，
让后续阶段不必反复从自由文本中猜测关键字段。
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List

from qrspi.workflow import Stage


@dataclass
class ParsedArtifact:
    """阶段产物的结构化表示"""

    stage: str
    summary: str
    structured_data: Dict[str, Any] = field(default_factory=dict)

    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return path


def parse_stage_output(stage: Stage, content: str) -> ParsedArtifact:
    handlers = {
        Stage.QUESTIONS: _parse_q,
        Stage.RESEARCH: _parse_r,
        Stage.DESIGN: _parse_d,
        Stage.STRUCTURE: _parse_s,
        Stage.PLAN: _parse_p,
        Stage.WORK_TREE: _parse_w,
        Stage.IMPLEMENT: _parse_i,
        Stage.PULL_REQUEST: _parse_pr,
    }
    handler = handlers.get(stage, _parse_generic)
    return handler(content)


def _parse_generic(content: str) -> ParsedArtifact:
    return ParsedArtifact(stage="UNKNOWN", summary=_shorten(content))


def _parse_q(content: str) -> ParsedArtifact:
    questions = re.findall(r"^###\s+(Q\d+):\s+(.+)$", content, flags=re.MULTILINE)
    assumptions = _extract_bullets(content, "## 假设清单")
    risks = _extract_bullets(content, "## 风险标记")
    summary = f"识别出 {len(questions)} 个技术问题，{len(assumptions)} 个假设，{len(risks)} 个风险。"
    return ParsedArtifact(
        stage=Stage.QUESTIONS.value,
        summary=summary,
        structured_data={
            "questions": [{"id": qid, "title": title} for qid, title in questions],
            "assumptions": assumptions,
            "risks": risks,
        },
    )


def _parse_r(content: str) -> ParsedArtifact:
    findings = re.findall(r"^##\s+(Q\d+):\s+(.+)$", content, flags=re.MULTILINE)
    unresolved = _extract_bullets(content, "## 未解决问题")
    summary = f"研究覆盖 {len(findings)} 个问题，未解决问题 {len(unresolved)} 个。"
    return ParsedArtifact(
        stage=Stage.RESEARCH.value,
        summary=summary,
        structured_data={
            "findings": [{"id": qid, "title": title} for qid, title in findings],
            "unresolved": unresolved,
        },
    )


def _parse_d(content: str) -> ParsedArtifact:
    decisions = re.findall(r"^###\s+决策\s+\d+:\s+(.+)$", content, flags=re.MULTILINE)
    pending = re.findall(r"需要确认\*?\*?:\s*(.+)", content)
    summary = f"设计文档包含 {len(decisions)} 个决策，待人工确认 {len(pending)} 项。"
    return ParsedArtifact(
        stage=Stage.DESIGN.value,
        summary=summary,
        structured_data={
            "decisions": decisions,
            "pending_confirmations": pending,
        },
    )


def _parse_s(content: str) -> ParsedArtifact:
    slices = []
    for idx, match in enumerate(
        re.finditer(r"^###\s+切片\s+(\d+):\s+(.+)$", content, flags=re.MULTILINE),
        start=1,
    ):
        order = int(match.group(1))
        title = match.group(2).strip()
        start_pos = match.end()
        next_match = re.search(r"^###\s+切片\s+\d+:", content[start_pos:], flags=re.MULTILINE)
        end_pos = start_pos + next_match.start() if next_match else len(content)
        block = content[start_pos:end_pos]
        checkpoint = _extract_named_line(block, "测试") or _extract_named_line(block, "出口")
        slices.append(
            {
                "name": title,
                "description": _extract_named_line(block, "目标") or title,
                "order": order or idx,
                "checkpoint": checkpoint,
            }
        )

    summary = f"结构大纲定义了 {len(slices)} 个垂直切片。"
    return ParsedArtifact(
        stage=Stage.STRUCTURE.value,
        summary=summary,
        structured_data={"slices": slices},
    )


def _parse_p(content: str) -> ParsedArtifact:
    checkpoints = _extract_bullets(content, "## 回滚策略")
    summary = "实施计划已生成。"
    if checkpoints:
        summary = f"实施计划已生成，并包含 {len(checkpoints)} 条回滚策略。"
    return ParsedArtifact(
        stage=Stage.PLAN.value,
        summary=summary,
        structured_data={"rollback_items": checkpoints},
    )


def _parse_w(content: str) -> ParsedArtifact:
    data = json.loads(content)
    raw_slices = data.get("slices", [])
    normalized_slices: List[Dict[str, Any]] = []

    for idx, item in enumerate(raw_slices, start=1):
        normalized_slices.append(
            {
                "name": item.get("name", f"slice-{idx}"),
                "description": item.get("description", ""),
                "order": item.get("order", idx),
                "dependencies": item.get("dependencies", []),
                "testable": item.get("testable", True),
                "status": item.get("status", "pending"),
                "checkpoint": item.get("checkpoint", ""),
                "tasks": item.get("tasks", []),
            }
        )

    total_tasks = sum(len(item.get("tasks", [])) for item in normalized_slices)
    summary = f"工作树包含 {len(normalized_slices)} 个切片、{total_tasks} 个任务。"
    return ParsedArtifact(
        stage=Stage.WORK_TREE.value,
        summary=summary,
        structured_data={
            "current_slice_idx": data.get("current_slice_idx", 0),
            "slices": normalized_slices,
        },
    )


def _parse_i(content: str) -> ParsedArtifact:
    modified = _extract_bullets(content, "## 完成的修改")
    tests = _extract_bullets(content, "## 测试结果")
    summary = f"实现阶段记录 {len(modified)} 项修改、{len(tests)} 条测试结果。"
    return ParsedArtifact(
        stage=Stage.IMPLEMENT.value,
        summary=summary,
        structured_data={
            "modified_items": modified,
            "tests": tests,
        },
    )


def _parse_pr(content: str) -> ParsedArtifact:
    tests = _extract_bullets(content, "## 测试")
    summary = f"PR 产物已生成，测试条目 {len(tests)} 条。"
    return ParsedArtifact(
        stage=Stage.PULL_REQUEST.value,
        summary=summary,
        structured_data={"tests": tests},
    )


def _extract_bullets(content: str, header: str) -> List[str]:
    pattern = re.escape(header) + r"\n(?P<body>.*?)(?:\n## |\Z)"
    match = re.search(pattern, content, flags=re.DOTALL)
    if not match:
        return []

    bullets = []
    for line in match.group("body").splitlines():
        stripped = line.strip()
        if stripped.startswith(("- ", "* ")):
            bullets.append(stripped[2:].strip())
    return bullets


def _extract_named_line(block: str, label: str) -> str:
    match = re.search(rf"\*\*{re.escape(label)}\*\*:\s*(.+)", block)
    if match:
        return match.group(1).strip()
    return ""


def _shorten(content: str, limit: int = 200) -> str:
    compact = " ".join(content.split())
    if len(compact) <= limit:
        return compact
    return compact[:limit].rstrip() + "..."
