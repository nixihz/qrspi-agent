"""
CLI 运行器

MVP 支持：
- claude: 真实调用本机 claude CLI
- codex: 真实调用本机 codex CLI
- mock: 生成占位输出，便于本地验证状态机
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from qrspi.workflow import Stage


DEFAULT_RUNNER_NAME = "claude"
DEFAULT_MODELS = {
    "claude": "kimi-for-coding",
    "codex": "gpt-5.4",
    "mock": "gpt-5.4",
}


def supported_runner_names() -> List[str]:
    return ["claude", "codex", "mock"]


def resolve_runner_name(runner_name: Optional[str] = None) -> str:
    return runner_name or os.getenv("QRSPI_RUNNER") or DEFAULT_RUNNER_NAME


def resolve_runner_model(runner_name: str, model: Optional[str] = None) -> str:
    if model:
        return model

    runner_key = runner_name.upper()
    return (
        os.getenv(f"QRSPI_{runner_key}_MODEL")
        or os.getenv("QRSPI_MODEL")
        or DEFAULT_MODELS.get(runner_name, "")
    )


@dataclass
class RunnerResult:
    ok: bool
    command: List[str]
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool = False


class BaseRunner:
    name = "base"

    def run(self, stage: Stage, prompt: str, project_root: Path, run_dir: Path) -> RunnerResult:
        raise NotImplementedError

    @staticmethod
    def _run_subprocess(
        command: List[str],
        cwd: Path,
        input_text: str,
        timeout_seconds: int,
        tool_name: str,
    ) -> RunnerResult:
        """统一封装 subprocess 调用，处理超时和结果封装"""
        try:
            completed = subprocess.run(
                command,
                cwd=str(cwd),
                input=input_text,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            raw_stdout = exc.stdout or b""
            raw_stderr = exc.stderr or b""
            return RunnerResult(
                ok=False,
                command=command,
                stdout=raw_stdout.decode("utf-8", errors="replace") if isinstance(raw_stdout, bytes) else raw_stdout,
                stderr=(raw_stderr.decode("utf-8", errors="replace") if isinstance(raw_stderr, bytes) else raw_stderr)
                + f"\n{tool_name} command timed out after {timeout_seconds}s",
                exit_code=124,
                timed_out=True,
            )

        return RunnerResult(
            ok=completed.returncode == 0,
            command=command,
            stdout=completed.stdout,
            stderr=completed.stderr,
            exit_code=completed.returncode,
            timed_out=False,
        )


class ClaudeCodeRunner(BaseRunner):
    name = "claude"

    def __init__(
        self,
        model: Optional[str] = None,
        effort: str = "medium",
        permission_mode: str = "bypassPermissions",
        timeout_seconds: int = 180,
        additional_args: Optional[List[str]] = None,
    ):
        self.model = resolve_runner_model(self.name, model)
        self.effort = effort
        self.permission_mode = permission_mode
        self.timeout_seconds = timeout_seconds
        self.additional_args = additional_args or []

    def run(self, stage: Stage, prompt: str, project_root: Path, run_dir: Path) -> RunnerResult:
        claude_bin = shutil.which("claude")
        if not claude_bin:
            return RunnerResult(False, [], "", "claude command not found", 127)

        command = [
            claude_bin,
            "-p",
            "--output-format",
            "text",
            "--model",
            self.model,
            "--effort",
            self.effort,
            "--permission-mode",
            self.permission_mode,
            "--verbose",
            "--add-dir",
            str(project_root),
        ]
        command.extend(self.additional_args)

        return self._run_subprocess(
            command=command,
            cwd=project_root,
            input_text=prompt,
            timeout_seconds=self.timeout_seconds,
            tool_name="Claude",
        )


class CodexCliRunner(BaseRunner):
    name = "codex"

    def __init__(
        self,
        model: Optional[str] = None,
        timeout_seconds: int = 180,
        profile: Optional[str] = None,
        config_overrides: Optional[List[str]] = None,
        additional_args: Optional[List[str]] = None,
    ):
        self.model = resolve_runner_model(self.name, model)
        self.timeout_seconds = timeout_seconds
        self.profile = profile
        self.config_overrides = config_overrides or []
        self.additional_args = additional_args or []

    def run(self, stage: Stage, prompt: str, project_root: Path, run_dir: Path) -> RunnerResult:
        codex_bin = shutil.which("codex")
        if not codex_bin:
            return RunnerResult(False, [], "", "codex command not found", 127)

        output_file = run_dir / "codex_last_message.txt"
        command = [
            codex_bin,
            "exec",
            "--full-auto",
            "--cd",
            str(project_root),
            "--output-last-message",
            str(output_file),
            "--color",
            "never",
        ]
        if self.model:
            command.extend(["--model", self.model])
        if self.profile:
            command.extend(["--profile", self.profile])
        for override in self.config_overrides:
            command.extend(["-c", override])
        command.extend(self.additional_args)

        result = self._run_subprocess(
            command=command,
            cwd=project_root,
            input_text=prompt,
            timeout_seconds=self.timeout_seconds,
            tool_name="Codex",
        )

        if not result.timed_out and output_file.exists():
            saved_output = output_file.read_text(encoding="utf-8").strip()
            if saved_output:
                return RunnerResult(
                    ok=result.ok,
                    command=result.command,
                    stdout=saved_output,
                    stderr=result.stderr,
                    exit_code=result.exit_code,
                    timed_out=result.timed_out,
                )

        return result


class MockRunner(BaseRunner):
    name = "mock"

    def __init__(self, model: Optional[str] = None):
        self.model = resolve_runner_model(self.name, model)

    _OUTPUTS = {
        Stage.QUESTIONS: """# 技术问题清单

## Feature 概述
示例功能

## 问题列表

### Q1: 当前入口在哪？
- **目标**: 找到主入口
- **搜索方向**: `src/` `main.py`
- **阻塞性**: blocking

### Q2: 当前路由层如何组织？
- **目标**: 理解接口编排
- **搜索方向**: `router` `api`
- **阻塞性**: blocking

### Q3: 数据模型在哪里？
- **目标**: 确认核心实体
- **搜索方向**: `models` `schema`
- **阻塞性**: blocking

### Q4: 配置和环境变量如何加载？
- **目标**: 确认配置入口
- **搜索方向**: `config` `.env`
- **阻塞性**: nice-to-have

### Q5: 测试基建是否存在？
- **目标**: 了解验证手段
- **搜索方向**: `tests` `pytest`
- **阻塞性**: nice-to-have

## 假设清单
- 当前项目有明确入口

## 风险标记
- 需求与现有结构可能不匹配
""",
        Stage.RESEARCH: """# 技术地图

## Q1: 当前入口在哪？
### 发现
- **相关文件**: `app/main.py`
- **关键代码**: `main()`
- **数据流**: CLI -> service

### 验证
- **假设验证**: 确认
- **依赖项**: argparse

## 未解决问题
- 暂无
""",
        Stage.DESIGN: """# 设计讨论文档

## 1. 当前状态
当前通过手动命令推进。

## 2. 期望最终状态
实现自动阶段推进和人工 gate。

## 3. 设计决策

### 决策 1: 状态持久化
- **问题**: 如何恢复执行
- **推荐方案**: 单独 engine_state.json
- **备选方案 A**: 扩展 state.json - 优点: 简单 缺点: 职责混杂
- **备选方案 B**: 单独 run db - 优点: 清晰 缺点: 复杂
- **需要确认**: 是否接受单文件持久化

## 4. 架构约束
- 与现有 workflow.py 兼容

## 5. 风险与缓解
- 校验过严会阻塞推进
""",
        Stage.STRUCTURE: """# 结构大纲

## 类型定义
```python
class EngineState: ...
```

## 函数签名
```python
def run() -> None
def approve(stage: str) -> None
```

## 垂直切片

### 切片 1: 状态机
- **目标**: 管理阶段推进
- **入口**: engine.py
- **出口**: gate 生效
- **函数**: run, approve
- **测试**: 状态流转

### 切片 2: 校验器
- **目标**: 校验阶段产物
- **入口**: validators.py
- **出口**: passed=True
- **函数**: validate_stage_output
- **测试**: 各阶段规则
""",
        Stage.PLAN: """# 实施计划

## 切片 1: 状态机
### 修改清单
| 文件 | 操作 | 内容 | 风险 |
|------|------|------|------|
| `qrspi/engine.py` | add | 增加运行状态机 | medium |

### 测试策略
- 运行 mock runner 验证状态切换

### 检查点
- [ ] 能在 gate 暂停

## 回滚策略
删除新增 engine 层

## 时间表估算
- 1 小时
""",
        Stage.WORK_TREE: json.dumps(
            {
                "slices": [
                    {
                        "name": "engine-core",
                        "description": "状态机和 runner",
                        "order": 1,
                        "tasks": [
                            {
                                "id": "engine-state",
                                "description": "实现状态持久化",
                                "estimated_minutes": 20,
                                "context_budget": "low",
                                "dependencies": [],
                            }
                        ],
                        "checkpoint": "状态可恢复",
                    }
                ]
            },
            ensure_ascii=False,
            indent=2,
        ),
        Stage.IMPLEMENT: """# 实现报告: engine-core

## 完成的修改
- `qrspi/engine.py`: 新增自动运行和 gate 恢复

## 测试结果
- `python3 -m compileall qrspi`: pass
- 覆盖率: 未统计

## 偏差记录
- 当前先用启发式 validator

## 下一切片准备
- 后续接入结构化 JSON 契约
""",
        Stage.PULL_REQUEST: """# PR: engine-core

## 变更摘要
新增自动工作流引擎 MVP。

## 修改清单
| 文件 | 变更 | 对应设计决策 |
|------|------|-------------|
| `qrspi/engine.py` | add | 状态持久化 |

## 测试
- `python3 -m compileall qrspi`
- 结果: pass
- 覆盖率: N/A

## Review 检查清单
- [ ] 函数签名与结构大纲一致
- [ ] 没有引入遗留模式
- [ ] 错误处理完整
- [ ] 性能影响评估通过

## 需要关注的代码
- gate 恢复逻辑
""",
    }

    def run(self, stage: Stage, prompt: str, project_root: Path, run_dir: Path) -> RunnerResult:
        stdout = MockRunner._OUTPUTS.get(stage, f"# {stage.value}\n\nMock output")
        command = ["mock", "--stage", stage.value, "--model", self.model]
        return RunnerResult(ok=True, command=command, stdout=stdout, stderr="", exit_code=0)


def execute_runner(
    runner: BaseRunner,
    stage: Stage,
    prompt: str,
    project_root: Path,
    run_dir: Path,
) -> RunnerResult:
    """统一执行入口，便于测试与引擎复用相同协议。"""
    return runner.run(stage, prompt, project_root, run_dir)


def build_runner(
    runner_name: Optional[str] = None,
    timeout_seconds: int = 180,
    model: Optional[str] = None,
    codex_profile: Optional[str] = None,
    codex_config_overrides: Optional[List[str]] = None,
) -> BaseRunner:
    resolved_runner = resolve_runner_name(runner_name)
    if resolved_runner == "mock":
        return MockRunner(model=model)
    if resolved_runner == "codex":
        return CodexCliRunner(
            timeout_seconds=timeout_seconds,
            model=model,
            profile=codex_profile,
            config_overrides=codex_config_overrides,
        )
    return ClaudeCodeRunner(timeout_seconds=timeout_seconds, model=model)
