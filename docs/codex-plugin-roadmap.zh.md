# QRSPI Codex Plugin 方案草案

本文沉淀 QRSPI Agent 后续以 Codex plugin 形态交付的目标形态和第一版落地范围。核心原则是：先把最终方向定清楚，再用一个“麻雀虽小，五脏俱全”的 preview 版本让团队看到完整闭环。

## 背景

QRSPI Agent 当前已经具备两类核心资产：

- `packages/qrspi`：QRSPI CLI 和 workflow engine，负责 `.qrspi/` 状态、stage、gate、artifact、runner、validation。
- `skills/qrspi-cli-workflow`：Codex skill，负责告诉 agent 如何正确使用 `qrspi` CLI，而不是手工模拟状态机。

当前的问题不是 CLI 不存在，而是直接让团队成员通过脚本和命令管理 AI coding harness，使用门槛仍然偏高。Codex plugin 的价值在于把 CLI、skill、MCP、dashboard、hooks 组合成一个更自然的入口，让用户在 Codex 中管理 feature workflow。

## 产品定位

最终形态建议定义为：

> QRSPI 是 Codex 里的结构化交付工作台，用来管理 AI coding feature 从需求到 PR 的完整生命周期。

它不只是一个“运行脚本的插件”，而是一个 AI engineering workflow cockpit：

- 用户在 Codex 中提出需求或说“用 QRSPI 管这个 feature”。
- Plugin 识别项目和 workflow 状态。
- Skill 规范 agent 行为。
- MCP 提供结构化操作工具。
- CLI 继续作为权威状态机。
- Dashboard 展示当前 stage、artifact、gate 和运行状态。
- 用户在 Codex 中完成 approve、reject、rewind 等人类决策。

## 仓库策略

第一阶段建议仍然放在现有 `qrspi-agent` 仓库中，而不是单独创建新项目。

原因：

- plugin 的核心能力直接依赖现有 CLI、skill、README 和版本语义。
- 第一版 MCP 大概率只是 CLI wrapper，拆仓会增加同步成本。
- 当前产品方向还在成型，同仓更方便快速迭代和团队 demo。
- 团队成员打开一个仓库就能看到 engine、plugin、skill、dashboard 的完整关系。

推荐边界：

- `packages/qrspi`：纯 CLI / engine，不依赖 Codex plugin。
- `skills/`、`apps/`、`hooks/`、`.codex-plugin/`：Codex plugin 层，可以依赖 CLI。
- `packages/qrspi-mcp`：桥接层，先 shell 调 CLI，后续可切到 package API。
- README 中区分 CLI usage 和 Codex plugin usage，避免概念混在一起。

未来满足以下条件时，再考虑拆仓：

- plugin 有独立发布节奏，CLI 不变但 plugin 经常变。
- plugin 需要支持多个 workflow engine，不只是 QRSPI。
- dashboard / MCP 复杂度超过 CLI 配套工具边界。
- plugin 需要作为团队或商业 marketplace 包独立治理。

## 最终架构

```text
User intent
  -> Codex Plugin
  -> Skill decides behavior
  -> MCP performs structured operations
  -> QRSPI CLI owns state machine
  -> App shows human gate and progress
  -> User approves / rejects / rewinds
```

建议目录形态：

```text
qrspi-agent/
  .codex-plugin/
    plugin.json

  skills/
    qrspi-cli-workflow/
      SKILL.md
      agents/openai.yaml

  packages/
    qrspi/
      src/...

    qrspi-mcp/
      package.json
      src/index.ts

  apps/
    qrspi-dashboard/
      .app.json
      src/...

  hooks/
    qrspi-hooks.json

  assets/
    icon.png
    logo.png
    screenshot-dashboard.png
```

## 组件职责

### Plugin Manifest

`.codex-plugin/plugin.json` 是插件入口，负责声明：

- 插件名称、版本、作者、仓库、license。
- skills 路径。
- MCP server 配置路径。
- app / dashboard 配置路径。
- hooks 配置路径。
- Codex UI 展示信息、默认 prompt、icon、logo、截图。

建议展示定位：

- display name: `QRSPI`
- short description: `Structured programming workflow for AI coding agents`
- category: `Productivity`
- capabilities: `Interactive`, `Write`, `Run Commands`

默认 prompts 可以先放：

- `Start a QRSPI workflow for this feature.`
- `Show the current QRSPI stage.`
- `Review the current QRSPI gate artifact.`

### Skill

现有 `skills/qrspi-cli-workflow` 是第一版最重要的可用能力。

它需要继续保证：

- 优先调用 `qrspi` CLI，不手工模拟状态机。
- 不直接修改 `.qrspi` 内部状态文件。
- 多 workflow 时必须显式选择 `--feature <id>`。
- `D`、`S`、`PR` gate 必须等待用户 approve / reject。
- `run` 默认不跳过 gate。
- 读取 runner 输出时使用 `.qrspi/<feature>/runs/.../live_stdout.txt` 和 `live_stderr.txt`。
- CLI 缺失时提示安装 `qrspi-agent` 或使用 `npx qrspi-agent`。

### MCP

MCP 层负责把 CLI 操作变成结构化工具，减少 agent 自由拼 shell 命令和解析文本输出的风险。

第一版先做薄实现，内部可以直接调用 CLI：

- `qrspi_list`
- `qrspi_status`
- `qrspi_init`
- `qrspi_run`
- `qrspi_approve_or_reject`

后续再扩展：

- `qrspi_stage`
- `qrspi_render_prompt`
- `qrspi_rewind`
- `qrspi_reject`
- `qrspi_list_artifacts`
- `qrspi_read_artifact`
- `qrspi_list_runs`
- `qrspi_read_run_log`

原则：

- MCP 不成为第二个状态机。
- MCP 不直接写 `.qrspi` 状态文件。
- 权威状态仍然来自 CLI / engine。
- MCP 返回结构化 JSON，便于 Codex 判断下一步。

### Dashboard / App

Dashboard 第一版可以很薄，但要表达完整产品方向。

第一版展示：

- 当前项目路径。
- workflow 列表。
- 当前 feature。
- 当前 stage：`Q/R/D/S/P/W/I/PR`。
- workflow 状态：`ready`、`running`、`waiting_approval`、`blocked`。
- 最近 artifact 路径。
- 最近 run log 路径。
- `Run next stage`、`Approve`、`Reject`、`Rewind` 的操作入口。

第一版允许部分按钮只是薄调用 MCP 或展示意图。重点是让团队看到 QRSPI 最终不是命令行，而是 workflow cockpit。

### Hooks

Hooks 第一版做提醒型能力，不做复杂自动化。

触发场景：

- 用户说“开始一个 feature”。
- 用户说“推进这个需求”。
- 用户说“生成 PR”。
- 用户提到 `QRSPI`、`CRISPY`、`.qrspi`、`stage`、`gate`。
- 用户要求查看当前阶段或审批设计。

行为：

- 提醒 Codex 使用 `qrspi-cli-workflow` skill。
- 在可用时优先使用 MCP tools。
- 避免自动跨过人类 gate。

## 外部依赖与扩展

QRSPI plugin 最终不一定只依赖 `qrspi-agent`。它可以预留为更上层的 AI engineering workflow plugin。

潜在依赖：

- QRSPI：结构化 feature workflow engine。
- Modu / 魔都项目：多项目、多模块、worktree 编排。
- Codex / Claude：实际执行 runner。
- Git / GitHub CLI：分支、PR、review。
- Context7：库文档和 API 文档查询。
- Lark / Sentry 等团队系统：会议、任务、告警、发布协作。

第一版不把这些全部塞进实现，但 manifest、MCP schema、dashboard 文案要承认未来会有外部集成。

建议采用 capability detection：

- 有 `qrspi`：启用 workflow stage 管理。
- 有 `modu`：启用多模块 / worktree 管理。
- 有 `gh`：启用 PR 创建和查看。
- 有 `codex`：启用 Codex runner。
- 有 `claude`：启用 Claude runner。
- 缺失依赖：Dashboard 显示 `not configured`，skill 引导安装或降级。

## 第一版目标：Preview Thin Slice

第一版不是极简 wrapper，而是完整形态的薄切片。

目标：

- 功能可以简单，但主要模块都出现。
- 团队成员能看到最终方向。
- 所有真实状态仍由 CLI 管理。
- 不引入第二套状态机。

建议第一版包含：

```text
qrspi-agent/
  .codex-plugin/plugin.json
  skills/qrspi-cli-workflow/
  packages/qrspi-mcp/
  apps/qrspi-dashboard/
  hooks/qrspi-hooks.json
  assets/
```

第一版验收标准：

1. 插件能被 Codex 识别和展示。
2. 用户能通过默认 prompt 启动 QRSPI 工作流。
3. Skill 能引导 agent 正确调用 CLI。
4. MCP 至少能执行 list、status、init、run、approve / reject。
5. Dashboard 能展示 workflow、stage、gate、artifact 和操作入口。
6. README 包含插件使用说明和架构说明。
7. 不手工修改 `.qrspi` 状态文件。
8. 不默认跳过 `D`、`S`、`PR` 人类 gate。

## 分阶段计划

### Milestone 1：Plugin Shell

新增 `.codex-plugin/plugin.json`，让当前仓库成为可识别的 Codex plugin。

内容：

- 声明 `skills: ./skills/`。
- 填写 interface 信息。
- 放置默认 prompts。
- 准备 icon / logo / screenshot 占位。

目标：插件能安装、展示、被发现。

### Milestone 2：Skill Productization

打磨现有 `qrspi-cli-workflow` skill。

内容：

- 强化多 workflow 处理。
- 强化 CLI 缺失处理。
- 强化 gate review playbook。
- 增加 plugin 场景说明。
- 保持中文输入和英文命令兼容。

目标：agent 行为稳定，不绕过 CLI 和 gate。

### Milestone 3：MCP Thin Wrapper

新增 `packages/qrspi-mcp`。

内容：

- 先实现 5 个核心 tools。
- 内部调用 `qrspi` CLI。
- 返回结构化 JSON。
- 提供 `.mcp.json` 接入。

目标：Codex 可以通过结构化 tools 管理 QRSPI，而不是自由解析 shell 输出。

### Milestone 4：Dashboard Preview

新增 `apps/qrspi-dashboard`。

内容：

- 展示当前项目和 workflow 状态。
- 展示当前 stage、artifact、run log。
- 提供 approve / reject / run / rewind 操作入口。
- 第一版允许交互很薄。

目标：团队看到 workflow cockpit 的最终体验。

### Milestone 5：Hooks Preview

新增 hooks 配置。

内容：

- 对 QRSPI / CRISPY / `.qrspi` / feature workflow 相关意图进行提醒。
- 引导 Codex 使用 skill 或 MCP。

目标：减少用户记忆负担，让插件自然介入。

### Milestone 6：Team Demo Packaging

补齐团队试用材料。

内容：

- README 中新增 Codex plugin usage。
- 增加安装和启用说明。
- 增加 demo workflow。
- 增加截图。

目标：团队成员可以按文档试用 preview 版本。

## 关键设计原则

- CLI / engine 是唯一权威状态机。
- Plugin 不直接修改 `.qrspi` 状态文件。
- MCP 只是结构化操作层，不复制业务规则。
- Dashboard 是 cockpit，不是另一个 engine。
- Gate 阶段必须保留人类决策。
- 第一版功能可以薄，但模块边界要完整。
- 先同仓快速迭代，未来成熟后再考虑拆仓。

## 一句话总结

QRSPI CLI 是发动机，Codex plugin 是驾驶舱。第一版要做的不是重写发动机，而是搭出一个完整但轻量的驾驶舱，让团队看见未来如何在 Codex 里管理 AI coding workflow。
