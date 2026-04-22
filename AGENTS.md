# AGENTS.md — QRSPI Agent 项目指南

> 本文档面向 AI Coding Agent。如果你对这个项目一无所知，从这里开始。

---

## 项目概述

**QRSPI Agent** 是一个结构化编程 Agent 工作流框架，实现从 RPI (Research-Plan-Implement) 到 QRSPI/CRISPY 的可落地方案。

核心目标：解决当前 AI 编程 Agent 在复杂代码库中「计划读起来合理、代码却无法集成」的失败模式。通过 8 阶段工作流、指令预算控制、垂直切片和 Context 管理，让 Agent 产出可靠、可验证、可集成的代码。

项目当前处于 Beta 阶段（v1.0.0）。

---

## 技术栈

- **语言**: Python 3.8+
- **构建工具**: setuptools（`pyproject.toml` + `setup.py` 双配置）
- **核心依赖**: 无 — 框架本身不绑定任何特定 LLM
- **开发依赖**: `pytest>=7.0`, `black>=22.0`, `mypy>=0.950`
- **CLI 入口**: `qrspi`（`qrspi.cli:main`）
- **运行器依赖**（可选，按需安装）:
  - `claude` CLI（Claude Code）
  - `codex` CLI（OpenAI Codex CLI）

---

## 构建与安装

```bash
# 开发安装（可编辑模式）
pip install -e .

# 安装开发依赖
pip install -e ".[dev]"

# 验证安装
qrspi --help
```

---

## 测试命令

```bash
# 运行 pytest（当前项目中尚无测试文件，但 pytest 是标准测试工具）
pytest

# 类型检查
mypy qrspi/

# 代码格式化
black qrspi/

# 编译检查
python3 -m compileall qrspi
```

**注意**: 当前仓库没有 `tests/` 目录或测试文件。如果需要添加测试，请遵循 pytest 惯例，在仓库根目录创建 `tests/` 目录。

---

## 代码组织

```
qrspi-agent/
├── qrspi/                      # 核心源码包
│   ├── __init__.py             # 版本信息（1.0.0）
│   ├── workflow.py             # 8 阶段状态机 + SessionConfig + 产物持久化
│   ├── prompts.py              # Prompt 模板系统（指令预算控制）
│   ├── engine.py               # 自动化工作流引擎（runner + validator + context）
│   ├── runner.py               # CLI 运行器（claude / codex / mock）
│   ├── validators.py           # 阶段产物启发式校验器
│   ├── context.py              # Context 装配器（按阶段构建最小上下文）
│   ├── agents.py               # 子 Agent 编排 + Context 防火墙（当前为模拟实现）
│   └── cli.py                  # 命令行接口（所有子命令入口）
├── scripts/
│   └── demo.py                 # 无外部依赖的完整工作流演示脚本
├── skills/qrspi-cli-workflow/  # 本地 skill，指导 Agent 优先调用 qrspi CLI
├── docs/
│   ├── AUTOMATION_ENGINE_GAP_ANALYSIS.md   # 引擎差距分析（已大部分实现）
│   └── EXAMPLE.md              # 完整使用示例（用户认证功能）
├── pyproject.toml              # PEP 621 项目元数据
├── setup.py                    # setuptools 兼容配置
└── README.md                   # 面向人类用户的使用文档（中文）
```

---

## 核心架构概念

### 8 阶段工作流

| 阶段 | 代码 | 名称 | 类型 | 需要人工确认 |
|------|------|------|------|-------------|
| Q | `QUESTIONS` | 提问 | 对齐 | 否 |
| R | `RESEARCH` | 研究 | 对齐 | 否 |
| D | `DESIGN` | 设计讨论 | 对齐 | **是** |
| S | `STRUCTURE` | 结构大纲 | 对齐 | **是** |
| P | `PLAN` | 计划 | 对齐 | 否 |
| W | `WORK_TREE` | 工作树 | 执行 | 否 |
| I | `IMPLEMENT` | 实现 | 执行 | 否 |
| PR | `PULL_REQUEST` | 拉取请求 | 执行 | **是** |

阶段定义在 `qrspi/workflow.py` 的 `Stage` 枚举中。Gate 策略在 `qrspi/engine.py` 的 `WorkflowEngine.POLICIES` 中硬编码。

### 关键数据类

- `SessionConfig`: 工作流会话配置，定义 `feature_id`、`project_root`、`output_dir`（默认 `.qrspi`）
- `QRSPIWorkflow`: 状态机，管理当前阶段、产物存取、状态持久化（`state.json`）
- `EngineState`: 引擎运行状态，包含审批记录、尝试次数、历史运行记录（`engine_state.json`）
- `StageArtifact`: 阶段产物，自动保存为 `artifacts/<STAGE>_<YYYY-MM-DD>.md`
- `VerticalSlice` / `WorkTree`: 垂直切片定义和执行跟踪
- `ContextPack` / `ContextBuilder`: 按阶段依赖组装最小上下文

### Context 管理原则

- Context Window 利用率目标: **< 40%**
- 强制切换 Session 阈值: **60%**
- 每个阶段只加载前置依赖产物的摘要，不加载完整历史
- 阶段依赖关系定义在 `qrspi/context.py` 的 `STAGE_DEPENDENCIES`

### Prompt 模板系统

- 每个阶段有独立的 `PromptTemplate` 子类（`qrspi/prompts.py`）
- **指令预算**: 每阶段 8-13 条指令，远低于 150 条警戒线
- **无魔法词**: 默认行为就是正确行为
- 全局注册表: `qrspi.prompts.registry`

### Runner 系统

- `ClaudeCodeRunner`: 调用本机 `claude` CLI（`-p` 模式）
- `CodexCliRunner`: 调用本机 `codex exec --full-auto` CLI
- `MockRunner`: 生成占位输出，用于本地验证状态机
- 模型解析优先级: 命令行 `--model` > `QRSPI_<RUNNER>_MODEL` 环境变量 > `QRSPI_MODEL` > runner 默认值
- 默认模型: claude → `kimi-for-coding`, codex → `gpt-5.4`

---

## CLI 命令参考

```bash
qrspi init <feature_id> --root <dir>          # 初始化工作流
qrspi stage --root <dir>                      # 查看当前阶段
qrspi prompt <Q/R/D/S/P/W/I/PR> --render     # 获取/渲染阶段 prompt
qrspi advance --root <dir>                    # 手动推进到下一阶段
qrspi approve --root <dir>                    # 确认 gate 阶段并继续
qrspi run --root <dir> --input "需求"         # 自动执行直到 gate 或结束
qrspi status --root <dir>                     # 查看完整状态
qrspi slice --add/--list --root <dir>         # 管理垂直切片
qrspi budget                                  # 查看指令预算报告
qrspi context --root <dir>                    # 查看当前阶段 Context 策略
```

---

## 开发约定

### 语言与注释

- 项目所有文档、注释、CLI 输出、docstring 均使用**中文**
- 代码标识符（类名、函数名、变量名）使用英文
- 修改代码时保持中文注释风格

### 代码风格

- 使用 `black` 进行格式化
- 使用 `mypy` 进行类型检查（已有类型注解，但未强制通过 mypy）
- 导入顺序: 标准库 → 第三方库 → 本地模块
- 使用 `from __future__ import annotations` 支持延迟类型评估（Python 3.8+）

### 产物与状态文件

工作流运行时在目标项目下创建 `.qrspi/<feature_id>/` 目录：

```
.qrspi/<feature_id>/
├── state.json                  # 工作流状态（当前阶段）
├── engine_state.json           # 引擎状态（审批、历史、错误）
├── artifacts/                  # 阶段产物（*.md）
│   ├── Q_2026-04-22.md
│   ├── R_2026-04-22.md
│   └── ...
├── runs/                       # 每次运行的完整记录
│   └── <STAGE>_<timestamp>_attempt<N>/
│       ├── prompt.md
│       ├── context.json
│       ├── runner_stdout.txt
│       ├── runner_stderr.txt
│       ├── runner_meta.json
│       └── validation.json
├── slices/                     # 垂直切片定义
│   └── work_tree.json
└── sessions/                   # Session 历史（预留）
```

**注意**: Agent 不应直接手工修改 `.qrspi/` 下的状态文件，应通过 `qrspi` CLI 操作。

### 阶段推进规则

1. `qrspi run` 自动执行当前阶段 → 调用 runner → 保存产物 → 运行 validator
2. 若 validation 失败，状态标记为 `failed`，停止推进
3. 若阶段是 Gate（D/S/PR），状态变为 `waiting_approval`，等待 `qrspi approve`
4. 非 Gate 阶段且校验通过，自动进入下一阶段
5. `qrspi advance` 只检查产物文件是否存在（不验证内容），建议优先使用 `qrspi run`

---

## 测试策略

当前项目缺少自动化测试。如果你要添加测试，建议覆盖以下方面：

1. **状态机测试**: `Stage.next_stage()`, `QRSPIWorkflow.transition_to()`, `advance()`
2. **Validator 测试**: 每个阶段的 `_validate_x()` 函数对各种输入的判定
3. **ContextBuilder 测试**: 阶段依赖解析、摘要截断逻辑
4. **Runner 测试**: MockRunner 的确定性输出，真实 runner 的命令组装
5. **Engine 测试**: Gate 暂停、审批恢复、失败重试、状态持久化

---

## 安全注意事项

1. **Runner 执行安全**:
   - `ClaudeCodeRunner` 默认使用 `--permission-mode bypassPermissions`，Claude Code 可能会执行任意 shell 命令
   - `CodexCliRunner` 使用 `--full-auto` 模式，同样具有完全自动执行能力
   - 在生产环境或敏感代码库中使用时，应审查 runner 参数

2. **Context 隔离**:
   - `ContextFirewall` 理论上隔离子 Agent 的上下文，但当前 `agents.py` 中的 `SubAgent.execute()` 是模拟实现，未真正调用 LLM
   - 真实 LLM 调用时应注意不泄露敏感信息（如 `.env`、密钥文件）到 prompt 中

3. **状态文件**:
   - `.qrspi/` 目录包含工作流历史、产物和 runner 输出，可能包含敏感代码分析结果
   - 建议将 `.qrspi/` 加入 `.gitignore`

4. **依赖最小化**:
   - 框架本身零核心依赖，降低了供应链攻击面
   - 但实际运行依赖外部 CLI 工具（`claude`、`codex`），需确保这些工具来源可信

---

## 扩展与修改指南

### 添加新阶段

1. 在 `qrspi/workflow.py` 的 `Stage` 枚举中添加新阶段
2. 在 `qrspi/prompts.py` 中创建对应的 `PromptTemplate` 子类
3. 在 `qrspi/validators.py` 中添加 `_validate_xxx()` 函数
4. 在 `qrspi/engine.py` 的 `POLICIES` 中定义是否需要人工确认
5. 在 `qrspi/context.py` 的 `STAGE_DEPENDENCIES` 中定义前置依赖

### 添加新 Runner

1. 在 `qrspi/runner.py` 中继承 `BaseRunner` 实现新 runner
2. 在 `build_runner()` 和 `supported_runner_names()` 中注册
3. 在 `cli.py` 的 `_add_runner_args()` 中添加相关参数（如有需要）

### 改进 Validator

当前 validator 基于 markdown 结构和正则表达式做启发式校验。如需更严格的校验：
- 可扩展为同时校验配套的 JSON 结构化输出
- 可在 `ValidationResult` 中增加 `structured_data` 字段

---

## 已知限制

1. `qrspi/agents.py` 中的 `SubAgent.execute()` 当前是模拟实现（`_simulate_execution`），不调用真实 LLM。真实 Agent 编排需要后续接入实际 LLM API 或 CLI。
2. `WorkTree` 和 `Implement` 阶段的切片级自动执行尚未完整实现 — `I` 阶段目前作为一个整体运行，未按垂直切片拆分独立 Session。
3. 没有 `tests/` 目录，测试覆盖率为零。
4. ContextBuilder 的摘要逻辑目前只是截断前 40 行，未做真正的智能摘要。
5. 项目没有 CI/CD 配置。
