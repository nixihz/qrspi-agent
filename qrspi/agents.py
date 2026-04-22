"""
子 Agent 编排系统 - Context 防火墙

核心设计原则（基于文章洞察）:
1. 子 Agent 不是"角色"（研究员/规划师），而是 Context 边界
2. 昂贵模型用于编排和决策，便宜模型用于子任务
3. 每个子 Agent 在自己的 Context Window 中运作，只包含需要的信息
4. 编排 Agent 接收压缩的结果，保持自己的 Context 精干
5. 通过文件系统产物协调，不是共享 Context

参考模式: Anthropic 100K 行编译器项目 - 16 个并行 Agent，
每个专门化，通过文件系统产物协调。
"""

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Callable
from enum import Enum
import time


class AgentRole(Enum):
    """
    Agent 角色 - 注意：这些是 Context 边界，不是人格角色
    """
    ORCHESTRATOR = "orchestrator"    # 编排者：决策和协调，用昂贵模型
    CODE_SEARCH = "code_search"       # 代码搜索：范围有限，用快速模型
    ANALYZER = "analyzer"             # 分析器：格式化输出和总结
    TEST_RUNNER = "test_runner"       # 测试执行：隔离测试环境
    DOCUMENTER = "documenter"         # 文档生成：格式化产物


@dataclass
class Task:
    """子 Agent 任务定义"""
    id: str
    role: AgentRole
    description: str
    input_files: List[Path] = field(default_factory=list)
    output_file: Optional[Path] = None
    context_budget: int = 4000  # token 预算
    timeout_seconds: int = 300
    dependencies: List[str] = field(default_factory=list)  # 依赖的任务ID

    @property
    def context_summary(self) -> str:
        """生成 Context 摘要 - 用于编排 Agent"""
        return f"Task({self.id}, {self.role.value}, deps={self.dependencies})"


@dataclass
class TaskResult:
    """任务执行结果"""
    task_id: str
    success: bool
    output_file: Optional[Path] = None
    summary: str = ""  # 压缩后的结果摘要
    full_output: str = ""  # 完整输出路径
    execution_time: float = 0.0
    tokens_used: int = 0


class ContextFirewall:
    """
    Context 防火墙

    职责:
    1. 隔离每个子 Agent 的 Context
    2. 控制信息流入/流出
    3. 压缩结果，保持编排 Agent Context 精干
    """

    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.workspace.mkdir(parents=True, exist_ok=True)
        self._cache: Dict[str, str] = {}  # 结果缓存

    def prepare_context(self, task: Task) -> str:
        """
        为子 Agent 准备隔离的 Context

        只包含:
        - 任务描述
        - 指定的输入文件内容
        - 明确的输出格式要求

        不包含:
        - 其他任务的详细结果
        - 完整的对话历史
        - 无关的代码文件
        """
        parts = [
            f"# Task: {task.description}",
            f"# Role: {task.role.value}",
            f"# Context Budget: {task.context_budget} tokens",
            "",
        ]

        # 加载指定的输入文件
        if task.input_files:
            parts.append("# Input Files")
            for f in task.input_files:
                if f.exists():
                    content = f.read_text(encoding='utf-8')
                    # 如果内容太长，只加载摘要
                    if len(content) > task.context_budget // 2:
                        parts.append(f"## {f.name} (truncated)")
                        parts.append(content[:task.context_budget // 2])
                        parts.append("...[truncated]")
                    else:
                        parts.append(f"## {f.name}")
                        parts.append(content)
                else:
                    parts.append(f"## {f.name} (NOT FOUND)")

        parts.extend([
            "",
            "# Instructions",
            "1. Complete the task using only the provided context",
            "2. Write output to the specified file",
            "3. Return a brief summary of what was done",
            "4. Do not reference information outside the provided context",
            "",
        ])

        if task.output_file:
            parts.append(f"# Output: {task.output_file}")

        return "\n".join(parts)

    def compress_result(self, result: TaskResult, max_length: int = 500) -> str:
        """
        压缩任务结果供编排 Agent 使用

        原则: 编排 Agent 不需要知道细节，只需要知道:
        - 任务是否成功
        - 关键发现/产出
        - 是否有阻塞问题
        """
        if not result.success:
            return f"[FAIL] Task {result.task_id}: {result.summary[:max_length]}"

        # 从完整输出中提取关键信息
        summary = result.summary[:max_length]
        return f"[OK] Task {result.task_id}: {summary} (time={result.execution_time:.1f}s)"

    def cache_result(self, task_id: str, result: str):
        """缓存结果"""
        self._cache[task_id] = result

    def get_cached(self, task_id: str) -> Optional[str]:
        """获取缓存的结果"""
        return self._cache.get(task_id)


class SubAgent:
    """
    子 Agent

    特点:
    - 在自己的 Context Window 中运作
    - 只接收防火墙准备好的 Context
    - 产出写入文件系统，不返回给编排 Agent
    - 结果通过 ContextFirewall 压缩后传递
    """

    def __init__(self, role: AgentRole, model: str = "claude-sonnet"):
        self.role = role
        self.model = model  # 模型选择：orchestrator 用 opus，其他用 sonnet/haiku

    def execute(self, context: str, task: Task, firewall: ContextFirewall) -> TaskResult:
        """
        执行任务

        实际实现中，这里会调用 LLM API。
        为了演示，我们模拟执行过程。
        """
        start_time = time.time()

        # 模拟: 将 context 写入文件，模拟 Agent 处理
        task_dir = firewall.workspace / task.id
        task_dir.mkdir(exist_ok=True)

        # 写入输入 context
        (task_dir / "input.md").write_text(context, encoding='utf-8')

        # 模拟执行任务
        # 实际实现: result = call_llm(context, model=self.model)
        simulated_output = self._simulate_execution(task, context)

        # 写入输出
        if task.output_file:
            task.output_file.parent.mkdir(parents=True, exist_ok=True)
            task.output_file.write_text(simulated_output, encoding='utf-8')

        execution_time = time.time() - start_time

        # 生成摘要
        summary = simulated_output[:200] + "..." if len(simulated_output) > 200 else simulated_output

        return TaskResult(
            task_id=task.id,
            success=True,
            output_file=task.output_file,
            summary=summary,
            full_output=str(task.output_file) if task.output_file else "",
            execution_time=execution_time,
            tokens_used=len(context.split())  # 粗略估算
        )

    def _simulate_execution(self, task: Task, context: str) -> str:
        """模拟执行 - 实际实现中替换为真实 LLM 调用"""
        return f"""# Task Result: {task.id}
Role: {self.role.value}
Model: {self.model}

## Summary
Completed task: {task.description}

## Output
[This would contain the actual LLM output in production]
Context length: {len(context)} chars
"""


class AgentOrchestrator:
    """
    Agent 编排器

    职责:
    1. 将工作分解为子任务
    2. 管理任务依赖和并行执行
    3. 保持自己的 Context 精干（只保留压缩后的结果）
    4. 决策何时切换 Session
    """

    def __init__(self, project_root: Path, output_dir: Path = None):
        self.project_root = project_root
        self.output_dir = output_dir or project_root / ".qrspi" / "agent_runs"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.firewall = ContextFirewall(self.output_dir / "firewall")
        self.agents: Dict[AgentRole, SubAgent] = {
            AgentRole.ORCHESTRATOR: SubAgent(AgentRole.ORCHESTRATOR, "claude-opus"),
            AgentRole.CODE_SEARCH: SubAgent(AgentRole.CODE_SEARCH, "claude-sonnet"),
            AgentRole.ANALYZER: SubAgent(AgentRole.ANALYZER, "claude-haiku"),
            AgentRole.TEST_RUNNER: SubAgent(AgentRole.TEST_RUNNER, "claude-sonnet"),
            AgentRole.DOCUMENTER: SubAgent(AgentRole.DOCUMENTER, "claude-haiku"),
        }
        self.session_history: List[str] = []  # 只保存压缩后的摘要
        self.context_used: int = 0  # 当前 Session 已使用的 Context
        self.max_context: int = 16000  # Context Window 上限 (40% of 40K)

    def run_parallel(self, tasks: List[Task]) -> List[TaskResult]:
        """
        并行执行独立的任务

        Anthropic 编译器项目模式: 16 个并行 Agent
        我们只并行化无依赖的任务
        """
        # 筛选可立即执行的任务（无依赖或依赖已完成）
        ready_tasks = [t for t in tasks if not t.dependencies]
        pending_tasks = [t for t in tasks if t.dependencies]

        results = []

        # 执行就绪的任务
        for task in ready_tasks:
            result = self._execute_task(task)
            results.append(result)
            self._update_session_context(result)

        # 检查依赖是否满足，执行后续任务
        completed_ids = {r.task_id for r in results}
        while pending_tasks:
            newly_ready = []
            still_pending = []

            for task in pending_tasks:
                if all(dep in completed_ids for dep in task.dependencies):
                    newly_ready.append(task)
                else:
                    still_pending.append(task)

            if not newly_ready:
                break

            for task in newly_ready:
                result = self._execute_task(task)
                results.append(result)
                completed_ids.add(task.task_id)
                self._update_session_context(result)

            pending_tasks = still_pending

        return results

    def run_sequential(self, tasks: List[Task]) -> List[TaskResult]:
        """顺序执行任务（有依赖关系时）"""
        results = []
        for task in tasks:
            result = self._execute_task(task)
            results.append(result)
            self._update_session_context(result)

            # 检查是否需要切换 Session
            if self._should_switch_session():
                self._switch_session()

        return results

    def _execute_task(self, task: Task) -> TaskResult:
        """执行单个任务"""
        # 准备隔离的 Context
        context = self.firewall.prepare_context(task)

        # 获取对应的 Agent
        agent = self.agents.get(task.role, self.agents[AgentRole.ANALYZER])

        # 执行
        result = agent.execute(context, task, self.firewall)

        # 压缩结果并缓存
        compressed = self.firewall.compress_result(result)
        self.firewall.cache_result(task.id, compressed)

        print(f"[Agent] {task.id}: {compressed}")

        return result

    def _update_session_context(self, result: TaskResult):
        """更新 Session Context 使用量"""
        compressed = self.firewall.compress_result(result)
        self.session_history.append(compressed)
        self.context_used += len(compressed.split())

    def _should_switch_session(self) -> bool:
        """检查是否需要切换 Session"""
        ratio = self.context_used / self.max_context
        return ratio > 0.4  # 40% 阈值

    def _switch_session(self):
        """切换 Session - 保存进度，启动新 Session"""
        print(f"[Session] Switching session. Context used: {self.context_used}/{self.max_context}")

        # 保存 Session 历史
        session_file = self.output_dir / f"session_{len(self.session_history)}.json"
        with open(session_file, 'w') as f:
            json.dump({
                "history": self.session_history,
                "context_used": self.context_used,
            }, f, indent=2)

        # 重置 Session
        self.session_history = []
        self.context_used = 0

        print(f"[Session] New session started. History saved to {session_file}")

    def create_research_tasks(self, questions_file: Path, code_dir: Path) -> List[Task]:
        """
        为 Research 阶段创建并行搜索任务

        每个问题一个子 Agent，并行搜索代码库
        """
        with open(questions_file, 'r') as f:
            questions = json.load(f)

        tasks = []
        for i, q in enumerate(questions.get("questions", [])):
            task_id = f"research_q{i+1}"
            output_file = self.output_dir / "artifacts" / f"{task_id}_result.md"

            task = Task(
                id=task_id,
                role=AgentRole.CODE_SEARCH,
                description=f"Research: {q.get('title', 'Unknown')}",
                input_files=[questions_file],
                output_file=output_file,
                context_budget=6000,
                dependencies=[]
            )
            tasks.append(task)

        return tasks

    def create_analysis_tasks(self, research_results: List[Path]) -> List[Task]:
        """
        创建分析任务 - 整合研究结果
        """
        output_file = self.output_dir / "artifacts" / "research_summary.md"

        task = Task(
            id="research_summary",
            role=AgentRole.ANALYZER,
            description="Summarize all research findings into technical map",
            input_files=research_results,
            output_file=output_file,
            context_budget=8000,
            dependencies=[f"research_q{i+1}" for i in range(len(research_results))]
        )

        return [task]

    def get_session_status(self) -> Dict:
        """获取当前 Session 状态"""
        return {
            "context_used": self.context_used,
            "max_context": self.max_context,
            "utilization": f"{self.context_used / self.max_context * 100:.1f}%",
            "tasks_completed": len(self.session_history),
            "should_switch": self._should_switch_session(),
        }
