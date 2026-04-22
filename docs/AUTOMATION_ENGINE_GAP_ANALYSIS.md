# QRSPI 自动化工作流引擎差距分析

> **状态：已解决** — 本文档中识别的大部分差距已通过 `qrspi/engine.py`、`qrspi/runner.py`、
> `qrspi/validators.py`、`qrspi/context.py` 及 `qrspi run` / `qrspi approve` CLI 命令实现。
> 保留此文仅供参考，不再代表当前代码状态。

## 目标

当前项目已经具备 QRSPI 的阶段模型、Prompt 模板、基础状态持久化和切片概念。

你期望的下一步不是“继续手动使用这些工具”，而是把它升级成一个真正可运行的自动化工作流引擎，使其能够：

- 自动调用 Claude Code 执行每个阶段
- 自动解析阶段产出、校验通过条件并推进
- 只在 `D`、`S`、`PR` 三个阶段暂停等待人工确认
- 自动切换阶段，并对 Context 做严格收敛和继承

这份文档的重点是识别当前项目痛点，并给出一套与现有代码结构兼容的落地方向。

## 当前项目的核心痛点

## 1. 现在只有“工作流定义”，没有“工作流执行闭环”

现状：

- [`qrspi/workflow.py`](/opt/case/iamx/qrspi-agent/qrspi/workflow.py) 定义了阶段枚举、状态切换、产物存取。
- [`qrspi/prompts.py`](/opt/case/iamx/qrspi-agent/qrspi/prompts.py) 定义了每个阶段的 Prompt 模板。
- [`qrspi/cli.py`](/opt/case/iamx/qrspi-agent/qrspi/cli.py) 主要提供 `prompt`、`advance`、`status` 这类手动命令。

问题：

- 执行者仍然是人，系统不会主动运行任何阶段。
- `advance` 只检查“有没有产物文件”，不检查“产物是否合格”。
- 系统并不知道 Claude Code 是否真的执行了，也不知道执行结果是否满足阶段要求。

结论：

当前仓库本质上是“阶段化模板工具”，不是“自动化 workflow engine”。

## 2. Agent 编排是模拟实现，不是真实执行链路

现状：

- [`qrspi/agents.py`](/opt/case/iamx/qrspi-agent/qrspi/agents.py) 里虽然有 `SubAgent`、`AgentOrchestrator`、`ContextFirewall`。
- 但 `SubAgent.execute()` 里调用的是 `_simulate_execution()`，不是 Claude Code，也不是任何真实 LLM Runner。

问题：

- 没有进程级执行器，无法真正拉起 Claude Code。
- 没有任务级输入输出协议，无法让阶段产出变成下一阶段的确定输入。
- 没有失败重试、超时、中断恢复、日志留存这些工作流引擎必需能力。

结论：

现在的 agent 层更像概念样例，不足以承接“自动执行每个阶段”的要求。

## 3. 阶段推进条件过于粗糙，缺少结构化验证

现状：

- 每个 Prompt 都带了 validation rules。
- 但这些校验规则只存在于文案层，没有真正落到代码执行路径里。
- `workflow.advance()` 不会读取规则，也不会解析产物内容。

问题：

- Q 阶段输出 2 个问题、或者夹带实现建议，系统也能推进。
- D 阶段没有列出候选方案，S 阶段没有函数签名，系统也无法识别。
- PR 阶段即使没有测试结果，也不会被拦住。

结论：

“验证标准”目前只是 Prompt 的一部分，不是引擎规则的一部分。

## 4. 人工确认点没有被建模成 Gate

现状：

- README 里强调 `D`、`S`、`PR` 需要高人工参与。
- 代码里没有 `pause_for_human`、`approval_required`、`gate_status` 之类的概念。

问题：

- 系统无法区分“自动推进阶段”和“必须停下来等人”的阶段。
- 也没有“人工确认通过后再继续”的恢复机制。
- 因为没有 Gate，对自动化执行来说，所有阶段都长得一样。

结论：

你要的“只在 D/S/PR 暂停”还没有进入状态机设计。

## 5. Context 管理只有原则，没有真实装配策略

现状：

- [`qrspi/workflow.py`](/opt/case/iamx/qrspi-agent/qrspi/workflow.py) 的 `get_context_for_stage()` 只返回一个占位摘要。
- [`qrspi/agents.py`](/opt/case/iamx/qrspi-agent/qrspi/agents.py) 的 `ContextFirewall.prepare_context()` 只是把输入文件拼起来。

问题：

- 没有明确区分“原始产物”“压缩摘要”“阶段专用上下文包”。
- 没有 token 预算估算策略。
- 没有在阶段切换时自动裁剪上下文。
- 没有为 D/S/PR 保留更高保真度上下文，为 I 阶段只注入切片级上下文。

结论：

当前 Context 管理还停留在设计口号，离“阶段自动切换和 Context 管理”还有明显差距。

## 6. Work Tree 和 Implement 还没有真正串起来

现状：

- `slice --add` 只是往 `work_tree.json` 里加记录。
- `I` 阶段没有消费 work tree 中的具体任务。
- 没有“当前切片完成 -> 自动下一个切片”的执行流。

问题：

- `W` 和 `I` 阶段之间没有真正的数据闭环。
- 无法做到“每个切片独立 session”“每个切片完成就验证并推进”。
- 也没有切片级失败恢复和重试点。

结论：

工作树目前是静态清单，不是执行计划。

## 7. 缺少统一的运行记录与可恢复状态

现状：

- 只有 `state.json` 记录当前阶段。
- 没有 run id、attempt id、stage run log、审批记录、错误记录。

问题：

- 无法回答“这个阶段是谁执行的、跑了几次、为什么失败、最后一次产物是什么”。
- 如果 Claude Code 运行中断，无法从 stage-run 级别恢复。
- 也不利于后续接入 Web UI、审计、回放和统计。

结论：

项目当前更像一次性 CLI，而不是具备耐久执行能力的 workflow runtime。

## 目标引擎应有的最小架构

建议把当前项目升级为四层结构：

## 1. Workflow State Machine

职责：

- 管理当前阶段、下一阶段、暂停点、恢复点
- 决定哪些阶段自动推进，哪些阶段必须等待人工确认

建议新增概念：

- `StagePolicy`
- `StageGate`
- `RunState`
- `StageRun`

建议规则：

- 自动阶段：`Q -> R -> P -> W -> I`
- 人工 Gate 阶段：`D`、`S`、`PR`
- 阶段结束后不是直接 `advance()`，而是 `evaluate_stage_result()`

## 2. Claude Runner

职责：

- 真实调用 Claude Code
- 注入阶段 Prompt、上下文包、输入工件
- 捕获 stdout、stderr、退出码、生成文件

建议新增模块：

- `qrspi/runner.py`
- `ClaudeCodeRunner.run_stage(stage_run: StageRun) -> RunnerResult`

它应该负责：

- 生成本次执行目录
- 落盘输入 prompt
- 调起 Claude Code
- 收集原始输出和结构化输出
- 记录超时、失败和重试信息

## 3. Artifact Parser + Validator

职责：

- 解析 Claude Code 产出
- 校验阶段产出是否满足结构要求
- 提取可供下一阶段消费的结构化信息

建议新增模块：

- `qrspi/parsers.py`
- `qrspi/validators.py`

建议输出结构：

```python
@dataclass
class ParsedArtifact:
    stage: Stage
    raw_path: Path
    summary: str
    structured_data: dict
    validation_passed: bool
    validation_errors: list[str]
```

这样阶段推进依据就不再是“文件存在”，而是：

- 有产出
- 能解析
- 校验通过
- 如果是 Gate 阶段，已获人工确认

## 4. Context Pack Builder

职责：

- 按阶段组装最小必要上下文
- 生成原始产物、摘要产物、切片上下文三种不同粒度

建议新增模块：

- `qrspi/context.py`

建议上下文分层：

- `raw`: 完整原始阶段产物
- `summary`: 可跨阶段传递的压缩摘要
- `focused`: 当前阶段/当前切片真正需要的内容

建议规则：

- `Q` 只看用户需求和项目元信息
- `R` 只看 Q 的结构化问题清单
- `D` 看 Q + R 的高保真摘要
- `S` 看 D 的确认版设计
- `P` 看 S 的结构大纲
- `W` 看 P 的实施计划
- `I` 只看当前切片 + 必需依赖
- `PR` 看变更摘要、测试结果、设计决策映射

## 如何满足“只在 D/S/PR 暂停”

建议显式建模为：

```python
@dataclass
class StagePolicy:
    stage: Stage
    auto_run: bool
    requires_human_approval: bool
    approval_label: str | None = None
```

建议默认策略：

| 阶段 | 自动执行 | 自动推进 | 需要人工确认 |
|------|----------|----------|--------------|
| Q | 是 | 是 | 否 |
| R | 是 | 是 | 否 |
| D | 是 | 否 | 是 |
| S | 是 | 否 | 是 |
| P | 是 | 是 | 否 |
| W | 是 | 是 | 否 |
| I | 是 | 是 | 否 |
| PR | 是 | 否 | 是 |

对应运行逻辑：

1. 引擎自动执行当前阶段
2. 解析产物并跑校验
3. 若校验失败，重试或标记失败
4. 若阶段属于 `D/S/PR`，进入 `waiting_approval`
5. 人工确认后再切到下一阶段
6. 非 Gate 阶段直接自动进入下一阶段

## 如何满足“自动解析产出、验证、推进”

建议每个阶段有自己的结构化契约，而不是只认 Markdown 文本。

推荐做法：

- 让 Claude Code 输出两份内容：
- 一份人类可读的 `*.md`
- 一份机器可读的 `*.json`

例如：

- `Q`: `questions.md` + `questions.json`
- `R`: `research.md` + `research.json`
- `D`: `design.md` + `design.json`
- `S`: `structure.md` + `structure.json`
- `P`: `plan.md` + `plan.json`
- `W`: `work_tree.md` + `work_tree.json`
- `I`: `implementation_report.md` + `implementation_report.json`
- `PR`: `pr.md` + `pr.json`

这样验证器可以直接校验：

- Q 是否有 5-15 个问题
- R 是否逐题有发现
- D 是否每个决策至少 2 个方案
- S 是否包含函数签名和切片
- P 是否细化到文件级修改
- W 是否形成无环任务树
- I 是否包含测试结果和完成切片
- PR 是否关联设计决策和测试结果

## 如何满足“阶段自动切换和 Context 管理”

建议引入一次完整运行对象：

```python
@dataclass
class WorkflowRun:
    run_id: str
    feature_id: str
    current_stage: Stage
    status: str
    approved_stages: list[str]
    current_context_pack: str | None
```

每个阶段运行对象：

```python
@dataclass
class StageRun:
    run_id: str
    stage: Stage
    attempt: int
    status: str
    prompt_file: Path
    context_manifest_file: Path
    raw_output_file: Path | None
    parsed_output_file: Path | None
    validation_file: Path | None
```

自动切换逻辑建议如下：

```text
start_run
  -> build_context
  -> render_prompt
  -> invoke_claude
  -> parse_output
  -> validate_output
  -> if failed: retry or stop
  -> if gate stage: wait_human
  -> else: goto next_stage
```

这样 Context 管理才会和阶段推进绑定在一起，而不是现在这样只在文档里提原则。

## 对当前代码的改造优先级

## 第一优先级：把“手动工具”升级成“自动执行器”

建议先补以下文件：

- `qrspi/engine.py`
- `qrspi/runner.py`
- `qrspi/parsers.py`
- `qrspi/validators.py`
- `qrspi/context.py`

先不要急着做复杂并行，先把单条主链跑通：

`Q -> R -> D -> S -> P -> W -> I -> PR`

## 第二优先级：为每个阶段建立机器可校验契约

比起继续写更长的 Prompt，更重要的是：

- 约束 Claude Code 必须同时输出 `md + json`
- 为每个阶段实现 validator
- 把 `advance` 变成 `run-next`

这是“自动解析、验证、推进”的基础。

## 第三优先级：把 D/S/PR Gate 真正写入状态机

需要的不是 README 说明，而是代码状态：

- `pending`
- `running`
- `waiting_approval`
- `approved`
- `failed`
- `completed`

## 第四优先级：实现切片级 I 阶段执行

I 阶段不要把整个实现当成一次大任务。

建议：

- 先由 `W` 产出结构化任务树
- `I` 按切片逐个执行
- 每个切片一个独立 session
- 每个切片完成后跑测试并写回状态

这样才能真正体现你要的 Context 管理能力。

## 最小可行版本建议

如果我们下一步要开始实现，我建议 MVP 只做下面这些：

1. 新增 `qrspi run` 命令，启动自动阶段执行器
2. 真实接一个 Claude Code Runner
3. 每阶段产出 `md + json`
4. 每阶段接一个 validator
5. D/S/PR 进入 `waiting_approval`
6. 新增 `qrspi approve <stage>` 用于人工确认恢复
7. I 阶段先只支持串行切片执行，不做并发

这个版本一旦跑通，项目就会从“辅助使用 QRSPI 的 CLI”升级成“可自动推进的工作流 runtime”。

## 一句话结论

当前项目最大的痛点不是阶段定义不够，而是缺少执行器、验证器、Gate 状态机和真实 Context 装配机制。

你要的自动化工作流引擎是完全合理的，而且和现有项目方向一致；只是现在这套代码还停留在“框架草图”阶段，下一步应该优先补齐运行闭环，而不是继续扩充 Prompt 模板。
