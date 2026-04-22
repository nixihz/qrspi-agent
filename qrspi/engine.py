"""
QRSPI 自动化工作流引擎

把文章中的阶段、验证、gate 和 context 管理真正串成执行闭环。
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from qrspi.context import ContextBuilder
from qrspi.prompts import registry
from qrspi.runner import BaseRunner, ClaudeCodeRunner, MockRunner
from qrspi.validators import validate_stage_output
from qrspi.workflow import QRSPIWorkflow, SessionConfig, Stage


@dataclass
class StagePolicy:
    stage: Stage
    requires_human_approval: bool = False


@dataclass
class StageRunRecord:
    stage: str
    attempt: int
    status: str
    run_dir: str
    artifact_path: str = ""
    validation_path: str = ""
    error: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class EngineState:
    feature_id: str
    current_stage: str
    status: str = "ready"
    approvals: List[str] = field(default_factory=list)
    stage_attempts: Dict[str, int] = field(default_factory=dict)
    history: List[StageRunRecord] = field(default_factory=list)
    last_error: str = ""
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: Path, feature_id: str, current_stage: Stage) -> "EngineState":
        if not path.exists():
            return cls(feature_id=feature_id, current_stage=current_stage.value)

        data = json.loads(path.read_text(encoding="utf-8"))
        history = [StageRunRecord(**record) for record in data.get("history", [])]
        return cls(
            feature_id=data.get("feature_id", feature_id),
            current_stage=data.get("current_stage", current_stage.value),
            status=data.get("status", "ready"),
            approvals=data.get("approvals", []),
            stage_attempts=data.get("stage_attempts", {}),
            history=history,
            last_error=data.get("last_error", ""),
            updated_at=data.get("updated_at", datetime.now().isoformat()),
        )


class WorkflowEngine:
    POLICIES = {
        Stage.QUESTIONS: StagePolicy(Stage.QUESTIONS, False),
        Stage.RESEARCH: StagePolicy(Stage.RESEARCH, False),
        Stage.DESIGN: StagePolicy(Stage.DESIGN, True),
        Stage.STRUCTURE: StagePolicy(Stage.STRUCTURE, True),
        Stage.PLAN: StagePolicy(Stage.PLAN, False),
        Stage.WORK_TREE: StagePolicy(Stage.WORK_TREE, False),
        Stage.IMPLEMENT: StagePolicy(Stage.IMPLEMENT, False),
        Stage.PULL_REQUEST: StagePolicy(Stage.PULL_REQUEST, True),
    }

    def __init__(self, config: SessionConfig, runner: Optional[BaseRunner] = None):
        self.config = config.ensure_dirs()
        self.workflow = QRSPIWorkflow(config)
        self.runner = runner or ClaudeCodeRunner()
        self.context_builder = ContextBuilder(self.workflow)
        self.state_path = self.config.output_path / "engine_state.json"
        self.state = EngineState.load(self.state_path, self.config.feature_id, self.workflow.current_stage)

    @classmethod
    def with_runner_name(
        cls,
        config: SessionConfig,
        runner_name: str,
        timeout_seconds: int = 180,
        model: str = "kimi-for-coding",
    ) -> "WorkflowEngine":
        if runner_name == "mock":
            runner: BaseRunner = MockRunner()
        else:
            runner = ClaudeCodeRunner(timeout_seconds=timeout_seconds, model=model)
        return cls(config, runner=runner)

    def run(self, user_input: str = "", until_gate: bool = True, max_stages: Optional[int] = None) -> List[str]:
        messages: List[str] = []
        stages_run = 0

        while True:
            current = self.workflow.current_stage

            if self.state.status == "waiting_approval":
                messages.append(f"阶段 {current.value} 正在等待人工确认")
                break

            if max_stages is not None and stages_run >= max_stages:
                break

            result_message = self._run_current_stage(user_input=user_input if current == Stage.QUESTIONS else "")
            messages.append(result_message)
            stages_run += 1

            if self.state.status in {"failed", "completed"}:
                break

            if until_gate and self.state.status == "waiting_approval":
                break

        return messages

    def approve(self, stage_name: Optional[str] = None) -> str:
        current = self.workflow.current_stage
        if self.state.status != "waiting_approval":
            return "当前没有等待人工确认的阶段"

        if stage_name and stage_name.upper() != current.value:
            return f"当前等待确认的是 {current.value}，不是 {stage_name.upper()}"

        if current.value not in self.state.approvals:
            self.state.approvals.append(current.value)

        next_stage = current.next_stage()
        if next_stage is None:
            self.state.status = "completed"
            self.workflow.save_state()
            self._save_engine_state()
            return f"{current.value} 已确认，工作流完成"

        self.workflow.transition_to(next_stage)
        self.state.current_stage = next_stage.value
        self.state.status = "ready"
        self.state.updated_at = datetime.now().isoformat()
        self._save_engine_state()
        return f"{current.value} 已确认，已进入 {next_stage.value}"

    def get_status(self) -> Dict[str, str]:
        return {
            "stage": self.workflow.current_stage.value,
            "stage_name": self.workflow.current_stage.full_name,
            "status": self.state.status,
            "runner": self.runner.name,
            "last_error": self.state.last_error,
        }

    def _run_current_stage(self, user_input: str = "") -> str:
        stage = self.workflow.current_stage
        attempt = self.state.stage_attempts.get(stage.value, 0) + 1
        self.state.stage_attempts[stage.value] = attempt

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = self.config.output_path / "runs" / f"{stage.value}_{timestamp}_attempt{attempt}"
        run_dir.mkdir(parents=True, exist_ok=True)

        context_pack = self.context_builder.build(stage)
        context_pack_path = context_pack.save(run_dir / "context.json")

        prompt_template = registry.get(stage.value)
        prompt_text = prompt_template.render(
            context=context_pack.focused_context,
            user_input=user_input,
        )
        prompt_path = run_dir / "prompt.md"
        prompt_path.write_text(prompt_text, encoding="utf-8")

        runner_result = self.runner.run(stage, prompt_text, Path(self.config.project_root), run_dir)
        (run_dir / "runner_stdout.txt").write_text(runner_result.stdout, encoding="utf-8")
        (run_dir / "runner_stderr.txt").write_text(runner_result.stderr, encoding="utf-8")
        (run_dir / "runner_meta.json").write_text(
            json.dumps(
                {
                    "ok": runner_result.ok,
                    "exit_code": runner_result.exit_code,
                    "command": runner_result.command,
                    "context_path": str(context_pack_path),
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        if not runner_result.ok:
            self.state.status = "failed"
            self.state.last_error = runner_result.stderr.strip() or "runner failed"
            self.state.history.append(
                StageRunRecord(
                    stage=stage.value,
                    attempt=attempt,
                    status="failed",
                    run_dir=str(run_dir),
                    error=self.state.last_error,
                )
            )
            self._save_engine_state()
            if runner_result.timed_out:
                return f"{stage.value} 执行超时: {self.state.last_error}"
            return f"{stage.value} 执行失败: {self.state.last_error}"

        artifact_path = self.workflow.save_artifact(stage, runner_result.stdout, metadata={"runner": self.runner.name, "attempt": attempt})
        validation = validate_stage_output(stage, runner_result.stdout)
        validation_path = validation.save(run_dir / "validation.json")

        run_status = "passed" if validation.passed else "validation_failed"
        self.state.history.append(
            StageRunRecord(
                stage=stage.value,
                attempt=attempt,
                status=run_status,
                run_dir=str(run_dir),
                artifact_path=str(artifact_path),
                validation_path=str(validation_path),
                error="; ".join(validation.errors),
            )
        )

        if not validation.passed:
            self.state.status = "failed"
            self.state.last_error = "; ".join(validation.errors)
            self._save_engine_state()
            return f"{stage.value} 校验失败: {self.state.last_error}"

        policy = self.POLICIES[stage]
        next_stage = stage.next_stage()

        if policy.requires_human_approval:
            self.state.status = "waiting_approval"
            self.state.current_stage = stage.value
            self.state.last_error = ""
            self._save_engine_state()
            return f"{stage.value} 已完成并通过校验，等待人工确认"

        if next_stage is None:
            self.state.status = "completed"
            self.state.current_stage = stage.value
            self.state.last_error = ""
            self._save_engine_state()
            return f"{stage.value} 已完成，工作流结束"

        self.workflow.transition_to(next_stage)
        self.state.status = "ready"
        self.state.current_stage = next_stage.value
        self.state.last_error = ""
        self._save_engine_state()
        return f"{stage.value} 已完成并自动推进到 {next_stage.value}"

    def _save_engine_state(self):
        self.state.updated_at = datetime.now().isoformat()
        self.state.save(self.state_path)
