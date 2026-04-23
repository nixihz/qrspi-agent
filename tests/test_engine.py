"""Tests for qrspi.engine module."""

import json
from datetime import datetime
from pathlib import Path

from qrspi.engine import WorkflowEngine
from qrspi.workflow import SessionConfig, Stage


class TestWorkflowEngine:
    def test_run_persists_structured_artifacts(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="engine-flow",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        engine = WorkflowEngine.with_runner_name(config, "mock")

        messages = engine.run(user_input="实现自动化引擎", until_gate=True)

        assert any("D 已完成并通过校验，等待人工确认" in msg for msg in messages)
        structured_q = config.output_path / "structured" / f"Q_{datetime.now().strftime('%Y-%m-%d')}.json"
        assert structured_q.exists()

    def test_work_tree_is_materialized_after_w_stage(self, tmp_path: Path):
        config = SessionConfig(
            feature_id="work-tree-flow",
            project_root=str(tmp_path),
            output_dir=".qrspi",
        )
        engine = WorkflowEngine.with_runner_name(config, "mock")

        engine.run(user_input="实现自动化引擎", until_gate=True)
        assert engine.workflow.current_stage == Stage.DESIGN

        engine.approve("D")
        engine.run(until_gate=True)
        assert engine.workflow.current_stage == Stage.STRUCTURE

        engine.approve("S")
        engine.run(until_gate=True)

        work_tree_file = config.output_path / "slices" / "work_tree.json"
        assert work_tree_file.exists()

        data = json.loads(work_tree_file.read_text(encoding="utf-8"))
        assert len(data["slices"]) == 1
        assert data["slices"][0]["name"] == "engine-core"

        status = engine.get_status()
        assert status["current_slice"] == "engine-core"
        assert status["current_slice_status"] == "pending"
