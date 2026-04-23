"""Tests for qrspi.parsers module."""

import json

from qrspi.parsers import parse_stage_output
from qrspi.workflow import Stage


class TestParseStageOutput:
    def test_parse_work_tree_normalizes_slices(self):
        content = json.dumps(
            {
                "current_slice_idx": 1,
                "slices": [
                    {
                        "name": "engine-core",
                        "description": "状态机和 runner",
                        "order": 2,
                        "tasks": [{"id": "task-1"}],
                        "checkpoint": "状态可恢复",
                    }
                ],
            },
            ensure_ascii=False,
        )

        parsed = parse_stage_output(Stage.WORK_TREE, content)

        assert parsed.stage == "W"
        assert "1 个切片" in parsed.summary
        assert parsed.structured_data["current_slice_idx"] == 1
        assert parsed.structured_data["slices"][0]["name"] == "engine-core"
        assert parsed.structured_data["slices"][0]["tasks"] == [{"id": "task-1"}]

    def test_parse_structure_extracts_slice_outline(self):
        content = """
# 结构大纲

## 类型定义
略

## 函数签名
略

## 垂直切片

### 切片 1: API 接口
- **目标**: 先打通 API
- **测试**: API 用例通过

### 切片 2: 前端联调
- **目标**: 接上页面
- **出口**: 页面可操作
"""

        parsed = parse_stage_output(Stage.STRUCTURE, content)

        assert parsed.stage == "S"
        assert len(parsed.structured_data["slices"]) == 2
        assert parsed.structured_data["slices"][0]["name"] == "API 接口"
        assert parsed.structured_data["slices"][0]["checkpoint"] == "API 用例通过"

    def test_parse_questions_extracts_questions_and_assumptions(self):
        content = """
# 技术问题清单

## 问题列表

### Q1: 入口在哪里
### Q2: 配置如何加载

## 假设清单
- 假设 A

## 风险标记
- 风险 B
"""

        parsed = parse_stage_output(Stage.QUESTIONS, content)

        assert parsed.stage == "Q"
        assert len(parsed.structured_data["questions"]) == 2
        assert parsed.structured_data["assumptions"] == ["假设 A"]
        assert parsed.structured_data["risks"] == ["风险 B"]
