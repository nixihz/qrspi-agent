"""Tests for qrspi.context module."""

from pathlib import Path

from qrspi.context import ContextBuilder, ContextPack
from qrspi.workflow import QRSPIWorkflow, SessionConfig, Stage, VerticalSlice


class TestContextBuilder:
    def test_build_with_no_artifacts(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        builder = ContextBuilder(workflow)
        pack = builder.build(Stage.QUESTIONS)
        assert pack.stage == "Q"
        assert pack.entries == []
        assert pack.focused_context == ""

    def test_build_loads_dependencies(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.save_artifact(Stage.QUESTIONS, "Q artifact content")

        builder = ContextBuilder(workflow)
        pack = builder.build(Stage.RESEARCH)
        assert pack.stage == "R"
        assert len(pack.entries) == 1
        assert pack.entries[0].stage == "Q"
        assert "Q artifact content" in pack.entries[0].summary
        assert "Questions" in pack.focused_context

    def test_summarize_truncates_long_content(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        # 构造一个带有大量标题和列表的长文档，确保触发截断
        lines = ["# 标题", "> 元数据", "## Content"]
        for i in range(200):
            lines.append(f"- 列表项 {i}: {'x' * 50}")
        long_content = "\n".join(lines)
        workflow.save_artifact(Stage.QUESTIONS, long_content)

        builder = ContextBuilder(workflow, max_chars_per_artifact=200)
        pack = builder.build(Stage.RESEARCH)
        assert len(pack.entries[0].summary) <= 250  # 200 + 截断标记余量
        assert "...[truncated]" in pack.entries[0].summary

    def test_context_pack_save(self, tmp_path: Path):
        pack = ContextPack(stage="Q", focused_context="test")
        path = tmp_path / "ctx.json"
        pack.save(path)
        assert path.exists()
        import json
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["stage"] == "Q"
        assert data["focused_context"] == "test"

    def test_implement_stage_includes_work_tree_summary(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.save_artifact(Stage.WORK_TREE, '{"slices": []}')
        workflow.create_work_tree(
            [VerticalSlice(name="engine-core", description="状态机", order=1, checkpoint="状态可恢复")]
        )

        builder = ContextBuilder(workflow)
        pack = builder.build(Stage.IMPLEMENT)

        assert "Work Tree 摘要" in pack.focused_context
        assert "engine-core" in pack.focused_context
