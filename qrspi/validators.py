"""
阶段产物校验器

MVP 先基于 markdown 结构做启发式校验，
把“有文件就推进”升级成“内容基本合格才推进”。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from qrspi.workflow import Stage


@dataclass
class ValidationResult:
    stage: str
    passed: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "stage": self.stage,
                    "passed": self.passed,
                    "errors": self.errors,
                    "warnings": self.warnings,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return path


def validate_stage_output(stage: Stage, content: str) -> ValidationResult:
    handlers = {
        Stage.QUESTIONS: _validate_q,
        Stage.RESEARCH: _validate_r,
        Stage.DESIGN: _validate_d,
        Stage.STRUCTURE: _validate_s,
        Stage.PLAN: _validate_p,
        Stage.WORK_TREE: _validate_w,
        Stage.IMPLEMENT: _validate_i,
        Stage.PULL_REQUEST: _validate_pr,
    }
    handler = handlers.get(stage)
    if handler is None:
        result = ValidationResult(stage=stage.value, passed=False)
        result.errors.append(f"未知的阶段: {stage.value}")
        return result
    return handler(content)


def validate_stage_artifact(stage: Stage, content: str) -> ValidationResult:
    """提供与结构大纲一致的校验入口命名。"""
    return validate_stage_output(stage, content)


def _base(stage: Stage, content: str) -> ValidationResult:
    result = ValidationResult(stage=stage.value, passed=True)
    if not content.strip():
        result.passed = False
        result.errors.append("产物内容为空")
    return result


def _require(result: ValidationResult, condition: bool, message: str):
    if not condition:
        result.passed = False
        result.errors.append(message)


def _validate_q(content: str) -> ValidationResult:
    result = _base(Stage.QUESTIONS, content)
    questions = re.findall(r"^###\s+Q\d+:", content, flags=re.MULTILINE)
    _require(result, 5 <= len(questions) <= 15, "Q 阶段问题数量必须在 5-15 之间")
    _require(result, "## 假设清单" in content, "Q 阶段缺少“假设清单”")
    _require(result, "## 风险标记" in content, "Q 阶段缺少“风险标记”")
    return result


def _validate_r(content: str) -> ValidationResult:
    result = _base(Stage.RESEARCH, content)
    findings = re.findall(r"^##\s+Q\d+:", content, flags=re.MULTILINE)
    _require(result, len(findings) >= 1, "R 阶段至少要逐题给出研究发现")
    _require(result, "相关文件" in content or "文件" in content, "R 阶段缺少文件级引用")
    _require(result, "## 未解决问题" in content, "R 阶段缺少“未解决问题”")
    return result


def _validate_d(content: str) -> ValidationResult:
    result = _base(Stage.DESIGN, content)
    _require(result, "## 1. 当前状态" in content, "D 阶段缺少“当前状态”")
    _require(result, "## 2. 期望最终状态" in content, "D 阶段缺少“期望最终状态”")
    _require(result, "## 3. 设计决策" in content, "D 阶段缺少“设计决策”")
    _require(result, content.count("备选方案") >= 2, "D 阶段至少需要两个备选方案")
    _require(result, "需要确认" in content, "D 阶段必须明确标记需要人工确认的点")
    return result


def _validate_s(content: str) -> ValidationResult:
    result = _base(Stage.STRUCTURE, content)
    _require(result, "## 类型定义" in content, "S 阶段缺少“类型定义”")
    _require(result, "## 函数签名" in content, "S 阶段缺少“函数签名”")
    _require(result, "## 垂直切片" in content, "S 阶段缺少“垂直切片”")
    slice_count = len(re.findall(r"^###\s+切片\s+\d+:", content, flags=re.MULTILINE))
    _require(result, slice_count >= 2, "S 阶段至少需要 2 个垂直切片")
    return result


def _validate_p(content: str) -> ValidationResult:
    result = _base(Stage.PLAN, content)
    _require(result, "# 实施计划" in content, "P 阶段缺少“实施计划”标题")
    _require(result, "### 修改清单" in content, "P 阶段缺少“修改清单”")
    _require(result, "### 测试策略" in content, "P 阶段缺少“测试策略”")
    _require(result, "## 回滚策略" in content, "P 阶段缺少“回滚策略”")
    return result


def _validate_w(content: str) -> ValidationResult:
    result = _base(Stage.WORK_TREE, content)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        result.passed = False
        result.errors.append("W 阶段产物必须是合法 JSON")
        return result

    slices = data.get("slices", [])
    _require(result, isinstance(slices, list) and len(slices) >= 1, "W 阶段至少需要一个切片")
    return result


def _validate_i(content: str) -> ValidationResult:
    result = _base(Stage.IMPLEMENT, content)
    _require(result, "## 完成的修改" in content, "I 阶段缺少“完成的修改”")
    _require(result, "## 测试结果" in content, "I 阶段缺少“测试结果”")
    _require(result, "## 下一切片准备" in content, "I 阶段缺少“下一切片准备”")
    return result


def _validate_pr(content: str) -> ValidationResult:
    result = _base(Stage.PULL_REQUEST, content)
    _require(result, "## 变更摘要" in content, "PR 阶段缺少“变更摘要”")
    _require(result, "## 修改清单" in content, "PR 阶段缺少“修改清单”")
    _require(result, "## 测试" in content, "PR 阶段缺少“测试”")
    _require(result, "## Review 检查清单" in content, "PR 阶段缺少“Review 检查清单”")
    return result
