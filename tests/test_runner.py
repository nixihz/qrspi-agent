"""Tests for qrspi.runner module."""

import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from qrspi.runner import (
    BaseRunner,
    ClaudeCodeRunner,
    CodexCliRunner,
    MockRunner,
    RunnerResult,
    build_runner,
    execute_runner,
    resolve_runner_model,
    resolve_runner_name,
    supported_runner_names,
)
from qrspi.validators import ValidationResult, validate_stage_artifact
from qrspi.workflow import Stage


def _set_env(**updates):
    original = {key: os.environ.get(key) for key in updates}
    for key, value in updates.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    return original


def _restore_env(snapshot):
    for key, value in snapshot.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


class TestRunnerProtocol:
    def test_supported_runner_names_includes_mock(self):
        assert supported_runner_names() == ["claude", "codex", "mock"]

    def test_resolve_runner_name_prefers_argument_then_env_then_default(self):
        snapshot = _set_env(QRSPI_RUNNER="codex")
        try:
            assert resolve_runner_name("mock") == "mock"
            assert resolve_runner_name() == "codex"
        finally:
            _restore_env(snapshot)

        snapshot = _set_env(QRSPI_RUNNER=None)
        try:
            assert resolve_runner_name() == "claude"
        finally:
            _restore_env(snapshot)

    def test_build_runner_mock_returns_base_runner(self):
        runner = build_runner("mock", model="mock-model")

        assert isinstance(runner, BaseRunner)
        assert runner.name == "mock"
        assert runner.model == "mock-model"

    def test_build_runner_returns_codex_runner_with_options(self):
        runner = build_runner(
            "codex",
            model="codex-model",
            timeout_seconds=33,
            codex_profile="fast",
            codex_config_overrides=["model_reasoning_effort=high"],
        )

        assert isinstance(runner, CodexCliRunner)
        assert runner.model == "codex-model"
        assert runner.timeout_seconds == 33
        assert runner.profile == "fast"
        assert runner.config_overrides == ["model_reasoning_effort=high"]

    def test_build_runner_defaults_to_claude_runner(self):
        runner = build_runner("claude", model="claude-model", timeout_seconds=21)

        assert isinstance(runner, ClaudeCodeRunner)
        assert runner.model == "claude-model"
        assert runner.timeout_seconds == 21

    def test_execute_runner_with_mock_is_deterministic(self):
        runner = build_runner("mock", model="stable-model")

        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            run_dir = project_root / "runs" / "mock"
            run_dir.mkdir(parents=True, exist_ok=True)

            first = execute_runner(runner, Stage.QUESTIONS, "固定 prompt", project_root, run_dir)
            second = execute_runner(runner, Stage.QUESTIONS, "固定 prompt", project_root, run_dir)

        assert first.ok is True
        assert second.ok is True
        assert first.stdout == second.stdout
        assert first.stderr == second.stderr
        assert first.command == second.command == ["mock", "--stage", "Q", "--model", "stable-model"]

    def test_execute_runner_delegates_to_runner_protocol(self):
        class SpyRunner(BaseRunner):
            name = "spy"

            def __init__(self):
                self.calls = []

            def run(self, stage, prompt, project_root, run_dir):
                self.calls.append((stage, prompt, project_root, run_dir))
                return RunnerResult(True, ["spy"], "ok", "", 0)

        runner = SpyRunner()

        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            run_dir = project_root / "runs" / "spy"
            run_dir.mkdir(parents=True, exist_ok=True)

            result = execute_runner(runner, Stage.RESEARCH, "协议测试", project_root, run_dir)

        assert result.stdout == "ok"
        assert runner.calls == [(Stage.RESEARCH, "协议测试", project_root, run_dir)]

    def test_resolve_runner_model_prefers_cli_argument(self):
        snapshot = _set_env(QRSPI_CODEX_MODEL="env-runner", QRSPI_MODEL="env-global")
        try:
            assert resolve_runner_model("codex", "cli-model") == "cli-model"
        finally:
            _restore_env(snapshot)

    def test_resolve_runner_model_prefers_runner_env_over_global(self):
        snapshot = _set_env(QRSPI_CODEX_MODEL="env-runner", QRSPI_MODEL="env-global")
        try:
            assert resolve_runner_model("codex") == "env-runner"
        finally:
            _restore_env(snapshot)

    def test_resolve_runner_model_falls_back_to_global_then_default(self):
        snapshot = _set_env(QRSPI_CODEX_MODEL=None, QRSPI_MODEL="env-global")
        try:
            assert resolve_runner_model("codex") == "env-global"
        finally:
            _restore_env(snapshot)

        snapshot = _set_env(QRSPI_CODEX_MODEL=None, QRSPI_MODEL=None)
        try:
            assert resolve_runner_model("codex") == "gpt-5.4"
        finally:
            _restore_env(snapshot)

    def test_run_subprocess_returns_success_result(self):
        completed = subprocess.CompletedProcess(args=["tool"], returncode=0, stdout="ok", stderr="")
        with patch("qrspi.runner.subprocess.run", return_value=completed) as run_mock:
            result = BaseRunner._run_subprocess(
                command=["tool"],
                cwd=Path("."),
                input_text="prompt",
                timeout_seconds=5,
                tool_name="Tool",
            )

        assert result == RunnerResult(ok=True, command=["tool"], stdout="ok", stderr="", exit_code=0, timed_out=False)
        run_mock.assert_called_once()

    def test_run_subprocess_decodes_timeout_bytes(self):
        timeout = subprocess.TimeoutExpired(cmd=["tool"], timeout=5, output=b"partial", stderr=b"slow")
        with patch("qrspi.runner.subprocess.run", side_effect=timeout):
            result = BaseRunner._run_subprocess(
                command=["tool"],
                cwd=Path("."),
                input_text="prompt",
                timeout_seconds=5,
                tool_name="Tool",
            )

        assert result.ok is False
        assert result.stdout == "partial"
        assert result.stderr == "slow\nTool command timed out after 5s"
        assert result.exit_code == 124
        assert result.timed_out is True

    def test_claude_runner_returns_not_found_when_binary_missing(self):
        runner = ClaudeCodeRunner(model="claude-model")

        with TemporaryDirectory() as temp_dir, patch("qrspi.runner.shutil.which", return_value=None):
            result = runner.run(Stage.QUESTIONS, "prompt", Path(temp_dir), Path(temp_dir))

        assert result.ok is False
        assert result.stderr == "claude command not found"
        assert result.exit_code == 127

    def test_claude_runner_builds_expected_command(self):
        runner = ClaudeCodeRunner(
            model="claude-model",
            effort="high",
            permission_mode="strict",
            timeout_seconds=9,
            additional_args=["--dangerously-skip-permissions"],
        )

        expected = RunnerResult(True, ["claude"], "stdout", "", 0)
        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            run_dir = project_root / "runs" / "claude"
            run_dir.mkdir(parents=True, exist_ok=True)
            with patch("qrspi.runner.shutil.which", return_value="/usr/local/bin/claude"), patch.object(
                ClaudeCodeRunner,
                "_run_subprocess",
                return_value=expected,
            ) as subprocess_mock:
                result = runner.run(Stage.DESIGN, "prompt", project_root, run_dir)

        assert result is expected
        subprocess_mock.assert_called_once_with(
            command=[
                "/usr/local/bin/claude",
                "-p",
                "--output-format",
                "text",
                "--model",
                "claude-model",
                "--effort",
                "high",
                "--permission-mode",
                "strict",
                "--verbose",
                "--add-dir",
                str(project_root),
                "--dangerously-skip-permissions",
            ],
            cwd=project_root,
            input_text="prompt",
            timeout_seconds=9,
            tool_name="Claude",
        )

    def test_codex_runner_returns_not_found_when_binary_missing(self):
        runner = CodexCliRunner(model="codex-model")

        with TemporaryDirectory() as temp_dir, patch("qrspi.runner.shutil.which", return_value=None):
            result = runner.run(Stage.QUESTIONS, "prompt", Path(temp_dir), Path(temp_dir))

        assert result.ok is False
        assert result.stderr == "codex command not found"
        assert result.exit_code == 127

    def test_codex_runner_reads_saved_last_message(self):
        runner = CodexCliRunner(
            model="codex-model",
            timeout_seconds=11,
            profile="batch",
            config_overrides=["model_reasoning_effort=high"],
            additional_args=["--skip-git-repo-check"],
        )

        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            run_dir = project_root / "runs" / "codex"
            run_dir.mkdir(parents=True, exist_ok=True)
            output_file = run_dir / "codex_last_message.txt"

            def fake_run_subprocess(**kwargs):
                output_file.write_text("saved output\n", encoding="utf-8")
                return RunnerResult(
                    ok=True,
                    command=kwargs["command"],
                    stdout="ignored stdout",
                    stderr="",
                    exit_code=0,
                    timed_out=False,
                )

            with patch("qrspi.runner.shutil.which", return_value="/usr/local/bin/codex"), patch.object(
                CodexCliRunner,
                "_run_subprocess",
                side_effect=fake_run_subprocess,
            ) as subprocess_mock:
                result = runner.run(Stage.PLAN, "prompt", project_root, run_dir)

        assert result.stdout == "saved output"
        assert result.command == [
            "/usr/local/bin/codex",
            "exec",
            "--full-auto",
            "--cd",
            str(project_root),
            "--output-last-message",
            str(output_file),
            "--color",
            "never",
            "--model",
            "codex-model",
            "--profile",
            "batch",
            "-c",
            "model_reasoning_effort=high",
            "--skip-git-repo-check",
        ]
        subprocess_mock.assert_called_once()

    def test_codex_runner_falls_back_to_runner_stdout_on_timeout(self):
        runner = CodexCliRunner(model="codex-model")

        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            run_dir = project_root / "runs" / "codex"
            run_dir.mkdir(parents=True, exist_ok=True)
            expected = RunnerResult(True, ["codex"], "direct stdout", "", 0, timed_out=True)

            with patch("qrspi.runner.shutil.which", return_value="/usr/local/bin/codex"), patch.object(
                CodexCliRunner,
                "_run_subprocess",
                return_value=expected,
            ):
                result = runner.run(Stage.PLAN, "prompt", project_root, run_dir)

        assert result is expected


class TestStageArtifactValidation:
    def test_validate_stage_artifact_accepts_gate_stage_outputs(self):
        for stage in (Stage.DESIGN, Stage.STRUCTURE, Stage.PULL_REQUEST):
            result = validate_stage_artifact(stage, MockRunner._OUTPUTS[stage])

            assert isinstance(result, ValidationResult)
            assert result.passed is True
            assert result.errors == []

    def test_validate_stage_artifact_reports_stable_fail_reasons(self):
        result = validate_stage_artifact(Stage.PLAN, "# 实施计划")

        assert result.passed is False
        assert result.errors == [
            "P 阶段缺少“修改清单”",
            "P 阶段缺少“测试策略”",
            "P 阶段缺少“回滚策略”",
        ]
