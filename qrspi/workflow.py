"""
QRSPI 工作流引擎 - 8阶段状态机实现

阶段定义:
    Q(Questions)       - 提问：识别 Agent 不知道什么
    R(Research)        - 研究：收集代码库客观事实
    D(Design)          - 设计讨论：脑dump + 设计决策
    S(Structure)       - 结构大纲：header 文件式定义
    P(Plan)            - 计划：战术实施文档
    W(WorkTree)        - 工作树：垂直切片任务组织
    I(Implement)       - 实现：编码
    PR(PullRequest)    - 拉取请求：人工 Review

Context 管理原则:
    - Context Window 利用率保持在 40% 以下
    - 达到 60% 时启动新 Session
    - 进度持久化到磁盘，新 Session 只加载当前阶段所需内容
"""

import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any


class Stage(Enum):
    """QRSPI 8阶段枚举"""
    QUESTIONS = "Q"
    RESEARCH = "R"
    DESIGN = "D"
    STRUCTURE = "S"
    PLAN = "P"
    WORK_TREE = "W"
    IMPLEMENT = "I"
    PULL_REQUEST = "PR"

    @classmethod
    def alignment_stages(cls) -> List['Stage']:
        """对齐阶段"""
        return [cls.QUESTIONS, cls.RESEARCH, cls.DESIGN, cls.STRUCTURE, cls.PLAN]

    @classmethod
    def execution_stages(cls) -> List['Stage']:
        """执行阶段"""
        return [cls.WORK_TREE, cls.IMPLEMENT, cls.PULL_REQUEST]

    def next_stage(self) -> Optional['Stage']:
        """获取下一阶段"""
        stages = list(Stage)
        try:
            idx = stages.index(self)
            return stages[idx + 1] if idx + 1 < len(stages) else None
        except ValueError:
            return None

    @classmethod
    def get_dependencies(cls, stage: 'Stage') -> List['Stage']:
        """获取指定阶段的前置依赖阶段（单一数据源）"""
        _deps: Dict['Stage', List['Stage']] = {
            cls.QUESTIONS: [],
            cls.RESEARCH: [cls.QUESTIONS],
            cls.DESIGN: [cls.QUESTIONS, cls.RESEARCH],
            cls.STRUCTURE: [cls.QUESTIONS, cls.RESEARCH, cls.DESIGN],
            cls.PLAN: [cls.QUESTIONS, cls.RESEARCH, cls.DESIGN, cls.STRUCTURE],
            cls.WORK_TREE: [cls.QUESTIONS, cls.RESEARCH, cls.DESIGN, cls.STRUCTURE, cls.PLAN],
            cls.IMPLEMENT: [cls.WORK_TREE, cls.PLAN, cls.STRUCTURE],
            cls.PULL_REQUEST: [cls.IMPLEMENT, cls.WORK_TREE, cls.DESIGN],
        }
        return _deps.get(stage, [])

    @property
    def full_name(self) -> str:
        names = {
            "Q": "Questions (提问)",
            "R": "Research (研究)",
            "D": "Design Discussion (设计讨论)",
            "S": "Structure Outline (结构大纲)",
            "P": "Plan (计划)",
            "W": "Work Tree (工作树)",
            "I": "Implement (实现)",
            "PR": "Pull Request (拉取请求)"
        }
        return names.get(self.value, self.value)

    @property
    def description(self) -> str:
        descriptions = {
            "Q": "识别 Agent 不知道什么，将模糊需求变成具体技术问题",
            "R": "收集代码库客观事实，产出技术地图而非计划",
            "D": "脑dump理解，产出200行markdown设计文档，人工对齐",
            "S": "定义函数签名、新类型和高级阶段，强制垂直分片",
            "P": "战术实施文档，被 Design 和 Structure 约束",
            "W": "按垂直切片组织任务树，每个切片可测试",
            "I": "编写代码，每个垂直切片独立 Session",
            "PR": "人工 Review 代码，拥有代码，不让垃圾进入生产"
        }
        return descriptions.get(self.value, "")


@dataclass
class SessionConfig:
    """Session 配置 - Context 管理核心"""
    max_context_ratio: float = 0.4  # 最大 Context Window 利用率
    session_switch_threshold: float = 0.6  # 强制切换 Session 阈值
    feature_id: str = ""  # 特性ID
    project_root: str = ""  # 项目根目录
    output_dir: str = ".qrspi"  # 输出目录

    @property
    def output_path(self) -> Path:
        return Path(self.project_root) / self.output_dir / self.feature_id

    def ensure_dirs(self):
        """确保目录结构存在"""
        dirs = ["sessions", "artifacts", "slices", "prompts", "runs"]
        for d in dirs:
            (self.output_path / d).mkdir(parents=True, exist_ok=True)
        return self


@dataclass
class StageArtifact:
    """阶段产物"""
    stage: str
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def save(self, path: Path):
        """保存产物到磁盘"""
        filepath = path / f"{self.stage}_{self.timestamp[:10]}.md"
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"# {Stage(self.stage).full_name}\n\n")
            f.write(f"> Generated: {self.timestamp}\n\n")
            if self.metadata:
                f.write(f"## Metadata\n```json\n{json.dumps(self.metadata, indent=2)}\n```\n\n")
            f.write("## Content\n\n")
            f.write(self.content)
        return filepath


@dataclass
class VerticalSlice:
    """垂直切片 - 可测试的工作单元"""
    name: str
    description: str
    order: int
    dependencies: List[str] = field(default_factory=list)
    testable: bool = True
    status: str = "pending"  # pending, in_progress, completed, reviewed
    checkpoint: str = ""  # 每个切片后的验证点

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class WorkTree:
    """工作树 - 垂直切片集合"""
    slices: List[VerticalSlice] = field(default_factory=list)
    current_slice_idx: int = 0

    @property
    def current_slice(self) -> Optional[VerticalSlice]:
        if 0 <= self.current_slice_idx < len(self.slices):
            return self.slices[self.current_slice_idx]
        return None

    def next_slice(self) -> Optional[VerticalSlice]:
        self.current_slice_idx += 1
        return self.current_slice

    def save(self, path: Path):
        path.mkdir(parents=True, exist_ok=True)
        filepath = path / "work_tree.json"
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                "current_slice_idx": self.current_slice_idx,
                "slices": [s.to_dict() for s in self.slices]
            }, f, indent=2, ensure_ascii=False)
        return filepath


class QRSPIWorkflow:
    """
    QRSPI 工作流引擎

    核心设计原则:
    1. 每个阶段有明确的输入、输出和验证标准
    2. Context 利用率不超过 40%
    3. 产物持久化到磁盘，Session 只加载当前所需
    4. 垂直切片作为工作单元
    """

    def __init__(self, config: SessionConfig):
        self.config = config.ensure_dirs()
        self.current_stage: Stage = Stage.QUESTIONS
        self.state_file = config.output_path / "state.json"
        self.artifacts: Dict[str, StageArtifact] = {}
        self.work_tree: Optional[WorkTree] = None
        self._load_state()

    def _load_state(self):
        """从磁盘加载状态"""
        if self.state_file.exists():
            with open(self.state_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
                raw_stage = state.get("current_stage", "Q")
                try:
                    self.current_stage = Stage(raw_stage)
                except ValueError:
                    print(f"[QRSPI] 警告: 状态文件中的阶段 '{raw_stage}' 无效，回退到 Q")
                    self.current_stage = Stage.QUESTIONS
                feature_id = state.get("feature_id", self.config.feature_id)
                print(f"[QRSPI] 恢复工作流: {self.current_stage.full_name} (Feature: {feature_id})")

    def save_state(self):
        """保存状态到磁盘（原子写入，防止并发损坏）"""
        state = {
            "current_stage": self.current_stage.value,
            "feature_id": self.config.feature_id,
            "timestamp": datetime.now().isoformat(),
            "stage_name": self.current_stage.full_name
        }
        tmp_file = self.state_file.with_suffix('.tmp')
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        tmp_file.replace(self.state_file)

    def transition_to(self, stage: Stage) -> bool:
        """转换到下一阶段"""
        expected_next = self.current_stage.next_stage()
        if stage != expected_next and stage != self.current_stage:
            print(f"[警告] 非顺序跳转: {self.current_stage.value} -> {stage.value}")

        self.current_stage = stage
        self.save_state()
        print(f"[QRSPI] 进入阶段: {stage.full_name}")
        print(f"  {stage.description}")
        return True

    def advance(self) -> Optional[Stage]:
        """推进到下一阶段"""
        next_s = self.current_stage.next_stage()
        if next_s:
            self.transition_to(next_s)
        return next_s

    def save_artifact(self, stage: Stage, content: str, metadata: Dict = None) -> Path:
        """保存阶段产物"""
        artifact = StageArtifact(
            stage=stage.value,
            content=content,
            metadata=metadata or {}
        )
        self.artifacts[stage.value] = artifact
        path = self.config.output_path / "artifacts"
        filepath = artifact.save(path)
        print(f"[QRSPI] 产物已保存: {filepath}")
        return filepath

    def load_artifact(self, stage: Stage) -> Optional[str]:
        """加载阶段产物"""
        # 从磁盘加载最新的产物
        files = self.list_artifact_files(stage)
        if files:
            with open(files[-1], 'r', encoding='utf-8') as f:
                return f.read()
        return None

    def list_artifact_files(self, stage: Stage) -> List[Path]:
        """列出某阶段的产物文件"""
        artifact_dir = self.config.output_path / "artifacts"
        pattern = f"{stage.value}_*.md"
        return sorted(artifact_dir.glob(pattern))

    def latest_artifact_path(self, stage: Stage) -> Optional[Path]:
        """获取某阶段最新的产物路径"""
        files = self.list_artifact_files(stage)
        return files[-1] if files else None

    def get_context_for_stage(self, stage: Stage) -> str:
        """
        获取指定阶段所需的 Context
        只加载当前阶段需要的产物，避免 Context 膨胀
        """
        context_parts = []

        deps = Stage.get_dependencies(stage)
        for dep_stage in deps:
            content = self.load_artifact(dep_stage)
            if content:
                # 压缩: 只取关键部分，避免 Context 膨胀
                context_parts.append(f"## {dep_stage.full_name}\n\n[摘要加载]\n")
                # 实际使用时可以添加更智能的摘要

        return "\n\n---\n\n".join(context_parts)

    def create_work_tree(self, slices: List[VerticalSlice]):
        """创建工作树"""
        self.work_tree = WorkTree(slices=slices)
        slices_path = self.config.output_path / "slices"
        self.work_tree.save(slices_path)
        print(f"[QRSPI] 工作树已创建: {len(slices)} 个垂直切片")
        for s in slices:
            status = "✓" if s.testable else "○"
            print(f"  {status} [{s.order}] {s.name}: {s.description}")

    def get_stage_info(self) -> Dict:
        """获取当前阶段信息"""
        return {
            "stage": self.current_stage.value,
            "name": self.current_stage.full_name,
            "description": self.current_stage.description,
            "is_alignment": self.current_stage in Stage.alignment_stages(),
            "is_execution": self.current_stage in Stage.execution_stages(),
            "output_dir": str(self.config.output_path)
        }

    def print_workflow_status(self):
        """打印工作流状态"""
        print("\n" + "=" * 60)
        print("QRSPI 工作流状态")
        print("=" * 60)

        all_stages = list(Stage)
        current_idx = all_stages.index(self.current_stage)

        for i, stage in enumerate(all_stages):
            marker = ">>>" if i == current_idx else "   "
            check = "✓" if i < current_idx else " "
            phase = "[对齐]" if stage in Stage.alignment_stages() else "[执行]"
            print(f"{marker} {check} {stage.value}: {stage.full_name} {phase}")

        print("=" * 60)

        if self.work_tree and self.work_tree.slices:
            print(f"\n垂直切片进度: {self.work_tree.current_slice_idx + 1}/{len(self.work_tree.slices)}")
            current = self.work_tree.current_slice
            if current:
                print(f"当前切片: {current.name} ({current.status})")
