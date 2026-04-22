"""Tests for qrspi.workflow module."""

import json
from pathlib import Path

import pytest

from qrspi.workflow import (
    QRSPIWorkflow,
    SessionConfig,
    Stage,
    StageArtifact,
    VerticalSlice,
    WorkTree,
)


class TestStage:
    def test_stage_values(self):
        assert Stage.QUESTIONS.value == "Q"
        assert Stage.RESEARCH.value == "R"
        assert Stage.DESIGN.value == "D"
        assert Stage.STRUCTURE.value == "S"
        assert Stage.PLAN.value == "P"
        assert Stage.WORK_TREE.value == "W"
        assert Stage.IMPLEMENT.value == "I"
        assert Stage.PULL_REQUEST.value == "PR"

    def test_alignment_stages(self):
        alignment = Stage.alignment_stages()
        assert Stage.QUESTIONS in alignment
        assert Stage.RESEARCH in alignment
        assert Stage.DESIGN in alignment
        assert Stage.STRUCTURE in alignment
        assert Stage.PLAN in alignment
        assert Stage.WORK_TREE not in alignment

    def test_execution_stages(self):
        execution = Stage.execution_stages()
        assert Stage.WORK_TREE in execution
        assert Stage.IMPLEMENT in execution
        assert Stage.PULL_REQUEST in execution
        assert Stage.QUESTIONS not in execution

    def test_next_stage(self):
        assert Stage.QUESTIONS.next_stage() == Stage.RESEARCH
        assert Stage.RESEARCH.next_stage() == Stage.DESIGN
        assert Stage.PULL_REQUEST.next_stage() is None

    def test_full_name(self):
        assert "Questions" in Stage.QUESTIONS.full_name
        assert "Pull Request" in Stage.PULL_REQUEST.full_name

    def test_get_dependencies_single_source(self):
        """阶段依赖必须从单一数据源获取且完整覆盖所有阶段。"""
        for stage in Stage:
            deps = Stage.get_dependencies(stage)
            assert isinstance(deps, list)
            # 依赖中不应包含自己
            assert stage not in deps
            #  Questions 没有依赖
            if stage == Stage.QUESTIONS:
                assert deps == []
            # 后续阶段至少有一个依赖（对齐阶段除外第一个）
            if stage != Stage.QUESTIONS:
                assert len(deps) >= 1

    def test_dependencies_consistency(self):
        """验证依赖关系无循环。"""
        visited = set()

        def has_cycle(stage: Stage, path: set) -> bool:
            if stage in path:
                return True
            if stage in visited:
                return False
            path.add(stage)
            for dep in Stage.get_dependencies(stage):
                if has_cycle(dep, path):
                    return True
            path.remove(stage)
            visited.add(stage)
            return False

        for stage in Stage:
            assert not has_cycle(stage, set()), f"阶段 {stage.value} 存在循环依赖"


class TestSessionConfig:
    def test_output_path(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        assert config.output_path == tmp_path / ".qrspi" / "test-feat"

    def test_ensure_dirs(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        config.ensure_dirs()
        assert (config.output_path / "artifacts").exists()
        assert (config.output_path / "sessions").exists()
        assert (config.output_path / "slices").exists()


class TestQRSPIWorkflow:
    def test_init_creates_dirs(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        assert workflow.current_stage == Stage.QUESTIONS
        assert config.output_path.exists()

    def test_save_and_load_state(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.transition_to(Stage.DESIGN)
        workflow.save_state()

        # 重新加载
        workflow2 = QRSPIWorkflow(config)
        assert workflow2.current_stage == Stage.DESIGN

    def test_load_state_with_invalid_stage(self, tmp_path: Path, capsys):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.save_state()

        # 篡改状态文件
        state_file = config.output_path / "state.json"
        state_file.write_text(json.dumps({"current_stage": "INVALID"}), encoding="utf-8")

        workflow2 = QRSPIWorkflow(config)
        # 应回退到默认阶段并打印警告
        assert workflow2.current_stage == Stage.QUESTIONS
        captured = capsys.readouterr()
        assert "无效" in captured.out or "警告" in captured.out

    def test_advance(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        next_s = workflow.advance()
        assert next_s == Stage.RESEARCH
        assert workflow.current_stage == Stage.RESEARCH

    def test_advance_at_end(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.transition_to(Stage.PULL_REQUEST)
        assert workflow.advance() is None

    def test_save_and_load_artifact(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        workflow.save_artifact(Stage.QUESTIONS, "test content", metadata={"key": "val"})

        loaded = workflow.load_artifact(Stage.QUESTIONS)
        assert loaded is not None
        assert "test content" in loaded

    def test_get_context_for_stage(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        # Q 阶段没有依赖，context 应为空
        ctx = workflow.get_context_for_stage(Stage.QUESTIONS)
        assert ctx == ""

        # 先保存 Q 的产物
        workflow.save_artifact(Stage.QUESTIONS, "Q content")
        # R 阶段依赖 Q
        ctx = workflow.get_context_for_stage(Stage.RESEARCH)
        assert "Questions" in ctx

    def test_create_work_tree(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="test-feat",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        workflow = QRSPIWorkflow(config)
        slices = [
            VerticalSlice(name="api", description="Mock API", order=1),
            VerticalSlice(name="ui", description="Frontend", order=2),
        ]
        workflow.create_work_tree(slices)
        assert workflow.work_tree is not None
        assert len(workflow.work_tree.slices) == 2
        assert workflow.work_tree.current_slice.name == "api"


class TestWorkTree:
    def test_next_slice(self, tmp_path: Path):
        tree = WorkTree(
            slices=[
                VerticalSlice(name="s1", description="", order=1),
                VerticalSlice(name="s2", description="", order=2),
            ]
        )
        assert tree.current_slice.name == "s1"
        tree.next_slice()
        assert tree.current_slice.name == "s2"
        assert tree.next_slice() is None

    def test_save_and_load(self, tmp_path: Path):
        tree = WorkTree(
            slices=[VerticalSlice(name="s1", description="d1", order=1)],
            current_slice_idx=0,
        )
        path = tmp_path / "slices"
        filepath = tree.save(path)
        assert filepath.exists()
        data = json.loads(filepath.read_text(encoding="utf-8"))
        assert data["current_slice_idx"] == 0
        assert len(data["slices"]) == 1


class TestStageArtifact:
    def test_save(self, tmp_path: Path):
        artifact = StageArtifact(stage="Q", content="hello")
        path = artifact.save(tmp_path)
        assert path.exists()
        text = path.read_text(encoding="utf-8")
        assert "hello" in text
        assert "Questions" in text
