# QRSPI Codex Plugin 路线图

本文记录当前的 Codex plugin 方向。

2026-04-28 的工程评审结论：当前实现按 **1A：CLI-backed reviewer queue 垂直切片** 推进。也就是说，先做一个真正能围绕 QRSPI CLI JSON 读取 pending gate、展示 artifact、生成 approve/reject handoff、并通过 CLI 持久化 gate review 的最小队列闭环。

完整 Team Workbench 需求不丢，沉淀在 [QRSPI Team Workbench 完整需求](./qrspi-team-workbench-requirements.zh.md)。当前 roadmap 只约束最近一轮实现范围；完整需求文档约束后续扩展方向。

## 当前结论

QRSPI plugin 的核心边界是：

```text
Codex Plugin
  ├─ skills：负责 SOP、对话、判断下一步
  └─ qrspi CLI：负责状态机、产物、JSON 事实输出
```

MCP 不作为新状态层。如果需要保留或修复 MCP，只能作为 CLI JSON 的薄包装：调用 `qrspi ... --json`，返回结构化事实，不解析 human text，不直接读写 `.qrspi` 状态。

dashboard / workbench 不替代 CLI。当前 GUI 降级为 preview asset，不作为默认安装的 plugin app，也不作为 workspace-backed 控制台。真实状态查看和变更必须走 `qrspi ... --json`、MCP thin wrapper、`qrspi approve` 或 `qrspi reject`。

## 1A UI 信息架构

当前 dashboard / workbench 是任务型 App UI，不是 landing page。第一屏必须服务 reviewer 的审批判断，不能以 hero 文案或泛 workflow 总览作为最高层级。

首屏只允许优先回答 3 个问题：

1. 哪些 gate 正在等人处理？
2. 哪些 gate 有 validation failure、blocked、needs-context 或高龄等待风险？
3. 对当前选中的 gate，reviewer 下一步应读什么、复制什么命令、或进入哪一个 gate review skill？

推荐屏幕结构：

```text
QRSPI Workbench
├─ Top utility bar
│  ├─ Source / project selector
│  ├─ Refresh
│  └─ Import project folder / CLI JSON
├─ Reviewer action queue  [primary first viewport]
│  ├─ Pending DESIGN gates
│  ├─ Pending STRUCTURE gates
│  ├─ Pending PR gates
│  └─ Blocked / needs-context sessions
└─ Selected feature detail
   ├─ Decision summary: stage, validation, age, required reviewer action
   ├─ Artifact + structured facts
   ├─ Gate history + run logs
   ├─ Command handoff
   └─ Stage track + WorkTree slices
```

Navigation rule:

```text
Open workbench
  -> scan reviewer action queue
  -> select highest-risk pending gate
  -> read artifact + structured facts
  -> review gate history / run log only if confidence is low
  -> copy approve/reject command or launch qrspi-gate-review
```

Secondary content such as stage track, WorkTree slices, run output, and capability detection must support the selected queue item. They should not compete with the pending action queue in the first viewport.

## 1A 交互状态覆盖

所有状态必须描述 reviewer 看到什么，而不是只描述内部数据是否存在。空白面板不是合法状态。

| Feature | Loading | Empty | Error | Success | Partial |
|---------|---------|-------|-------|---------|---------|
| Project import | 显示正在读取项目文件、已扫描文件数、当前识别 `.qrspi/` 或 CLI JSON 的进度。 | 显示“没有找到 QRSPI workflow”，提供重新导入、切换 demo、查看期望目录结构三个动作。 | 显示无法读取的文件或 JSON 解析失败原因，并保留重新导入动作。 | 显示项目名、workflow 数、pending gate 数、最后刷新时间。 | 如果只读到部分 workflow，标出缺失的 state/engine/artifact 文件，并继续展示可验证的 workflow。 |
| Reviewer action queue | 显示 skeleton rows，按 DESIGN / STRUCTURE / PR / blocked 分组占位。 | 显示“当前没有待审 gate”，并显示最近完成或 blocked workflow 的入口，避免误以为空项目。 | 显示 queue 构建失败原因，提示用户运行 `qrspi status --json` 验证数据源。 | 每个 row 显示 feature、stage、age、validation、required reviewer action。 | 对缺 owner/source/age 的 row 显示 `Unknown`，并把缺字段列入 row warning。 |
| Artifact markdown | 显示正在加载 artifact path。 | 显示“该 stage 尚未产生 artifact”，并给出 `qrspi run` next command。 | 显示读取失败路径和错误原因，不隐藏 selected feature。 | 显示 artifact 标题、路径、stage、正文预览。 | 如果 artifact 存在但 structured facts 缺失，artifact 仍可读，并提示 structured summary unavailable。 |
| Structured facts | 显示正在解析 structured JSON。 | 显示“没有 structured artifact”，说明 gate review 将依赖 markdown 原文。 | 显示 schema/parse 错误和原始 JSON 路径。 | 显示关键 facts：推荐方案、拒绝方案、风险、待确认点。 | 如果只解析到部分字段，显示已解析字段和缺失字段，不得编造 summary。 |
| Gate history | 显示正在读取 `engine_state.json` gate review records。 | 显示“还没有 gate review history”，并解释首次 review 会写入 `gate_reviews/`。 | 显示 engine state 读取失败原因。 | 显示每次 approve/reject 的 stage、时间、note/feedback source file。 | 如果只有 engine history 没有 copied markdown，标出 source file missing。 |
| Run logs | 显示正在读取 latest stdout/stderr。 | 显示“没有 run log”，并显示 latest run directory if known。 | 显示 log 文件读取失败路径。 | 显示 stdout 或 stderr，错误输出优先。 | 如果 latest runDir 缺 live 文件，显示 run metadata 并提示 live log unavailable。 |
| Command handoff | 显示正在生成 commands。 | 显示无可执行命令，并说明缺少 feature 或 stage。 | 显示命令生成失败原因，不自动执行。 | 显示 status、run、context、approve/reject、rewind 等可复制命令。 | 对 approve/reject 命令标明需要 note-file/feedback-file 才能持久化 review。 |
| WorkTree slices | 显示正在读取 `slices/work_tree.json`。 | 显示“该 workflow 尚未到 W stage”，不要把 0 slices 当错误。 | 显示 work tree JSON 读取或解析失败原因。 | 显示 slice name、order、checkpoint、model_tier if present。 | 如果 model_tier 缺失，显示 slice 但标明 routing metadata unavailable。 |

Approve/reject handoff 的成功状态必须明确告诉 reviewer：命令已经复制或 note/feedback 文件已经生成；失败状态必须保留原命令文本，避免用户丢失决策内容。

## 1A Reviewer Journey

Reviewer 打开 workbench 时的核心情绪不是“探索功能”，而是“我能不能安全地做这个 gate decision”。界面必须围绕降低误批、漏批和证据不足的焦虑来组织。

| Step | User does | User feels | Plan specifies |
|------|-----------|------------|----------------|
| 1 | 打开 workbench 或导入项目目录。 | 想快速知道有没有自己要处理的 gate。 | 第一屏显示 reviewer action queue，pending gate 和 blocked/needs-context 优先。 |
| 2 | 扫描 queue row。 | 想知道哪个最急、哪个最危险。 | Row 必须显示 stage、age、validation、required action；风险状态用文字和颜色同时表达。 |
| 3 | 选择一个 pending gate。 | 担心 artifact 太长或信息不全。 | Detail 顶部先给 decision summary，再给 artifact 和 structured facts。 |
| 4 | 阅读 artifact 和 structured facts。 | 想确认推荐方案、拒绝方案、风险和待确认点。 | Structured facts 不可用时，明确提示回退到 markdown 原文，不得生成假 summary。 |
| 5 | 查看 gate history / run logs。 | 想确认这不是重复审批或失败重跑后的残留状态。 | Gate history 和 run logs 支持建立信任，但作为二级证据，不抢第一屏主层级。 |
| 6 | 复制 approve/reject handoff 或进入 `qrspi-gate-review` skill。 | 希望决策被记录，而不是只推进状态。 | Handoff 必须强调 `--note-file` / `--feedback-file` 持久化 review。 |
| 7 | 执行命令后刷新。 | 想确认 gate 已经离开 waiting approval，review record 已落盘。 | Success state 显示最新 gate review record、source file、engine status 和 next stage。 |

时间尺度：

- **5 秒**：用户能看出项目是否有待审 gate、最高风险 gate 是哪一个、下一步动作是什么。
- **5 分钟**：用户能从 artifact、structured facts、history、logs 中建立足够信心，做 approve 或 reject。
- **长期**：用户能相信 workbench 不会绕过 QRSPI CLI、不隐藏失败、不丢 review reason。

## 1A Visual Direction and AI Slop Guardrails

Classifier: **App UI**。Workbench 是 task-focused reviewer tool，不是 marketing / landing page。实现必须使用安静、密集、可扫描的工作台布局。

所有设计决策以 `docs/design-system.md` 为准。本节是 1A workbench 的具体化约束；如果后续 UI 与 `docs/design-system.md` 冲突，优先更新设计系统或收窄本节，不要在实现里临场发明第三套视觉规则。

Hard rules:

- 不允许 hero-first。顶部可以有 utility bar，但第一主区域必须是 reviewer action queue。
- 不允许用大号宣传 headline 占据首屏；文案必须服务 orientation、status、action。
- 不允许低对比正文、低对比按钮或淡色大字。正文对比度至少 4.5:1，关键状态和命令必须可读。
- Cards 只用于 queue row、metric、artifact/log framed reader、command item。不得把整个页面做成装饰性 stacked card mosaic。
- 页面每个区域只有一个 job：queue 负责选择待审 gate，detail 负责建立决策信心，commands 负责 handoff。
- 避免 generic SaaS copy，例如 “cockpit”、泛 “track every feature” 作为首屏主信息。优先使用 reviewer 语言：`Pending gates`、`Needs review`、`Validation failed`、`Approve with note`、`Reject with feedback`。
- 色彩必须表达状态，不做装饰主导。warning/danger/success/live/muted 的颜色和文本标签必须成对出现，不能只靠颜色。
- 字体可以保持现有 serif/sans 对比，但 app 内标题不得使用 hero-scale type。紧凑 panel 标题应服务扫描，不应像品牌海报。

Current screenshot risks to correct before treating the dashboard as production design:

- Hero-first layout hides the reviewer queue below marketing copy.
- Very low contrast text makes workflow state, commands, and logs hard to read.
- The first viewport reads as a demo poster, not a gate decision workspace.
- Capability detection and stage track compete with pending gate action, even though they are secondary evidence.

## 1A Responsive and Accessibility Requirements

Responsive behavior:

| Viewport | Layout requirement | What must remain visible |
|----------|--------------------|--------------------------|
| Desktop >= 1200px | Utility bar, reviewer action queue, and selected detail may use a two-column workbench layout. Supporting evidence can use secondary columns. | Pending gate count, selected gate status, required action, and command handoff. |
| Tablet 768-1199px | Queue remains first. Selected detail can sit below queue or beside it if readable. Evidence panels collapse to one or two columns based on content width. | Queue row labels, validation status, artifact path, approve/reject handoff. |
| Mobile < 768px | Queue becomes a single-column list. Selecting a row opens detail below the row or in a full-width detail section. Stage track becomes a compact timeline or segmented list. | Feature id, stage, status, age, required action, copyable command. |

Accessibility acceptance criteria:

- Keyboard focus order follows the reviewer journey: utility bar -> queue -> selected decision summary -> artifact/facts -> commands -> secondary evidence.
- Every clickable queue row, command, import control, and refresh action has a visible `:focus-visible` state.
- Touch targets are at least 44px by 44px.
- Use semantic landmarks: header/utility bar, main, queue navigation or aside, selected detail sections.
- Status is never color-only; every warning/danger/success state includes visible text.
- Body text contrast is at least 4.5:1; disabled or unavailable text still needs readable explanation.
- Command text remains selectable/copyable and is not hidden behind icon-only controls.
- Approve, reject, rewind, run, context, and copy actions have distinct accessible names.
- Loading, empty, error, success, and partial states are announced by visible headings and machine-readable text, not only by animations.
- Placeholder text is never the only label for import, note, feedback, or future intake fields.

Implementation verification should include at least one desktop screenshot, one tablet/narrow viewport screenshot, one mobile viewport screenshot, and a keyboard-only pass through the reviewer journey before treating the UI as ready.

## 1A Gate Decision Handoff

Default approve/reject UX must preserve the review reason.

Decision:

- Workbench defaults to generating a note/feedback draft and a command that uses `--note-file` or `--feedback-file`.
- Bare `qrspi approve` / `qrspi reject` commands are fallback-only and must be visually secondary.
- The command handoff must show where the note/feedback file will be saved or what the user must save before running the command.
- After refresh, success state must show the latest gate review record from CLI JSON, including stage, decision, recordedAt, and sourceFile.

Recommended handoff flow:

```text
Select pending gate
  -> read artifact + structured facts
  -> choose Approve with note or Reject with feedback
  -> review/edit generated markdown draft
  -> copy command using --note-file / --feedback-file
  -> run command in terminal
  -> refresh workbench
  -> confirm gate review record is visible
```

Draft content should include:

- Feature id
- Stage
- Decision
- Reviewer note or rejection feedback
- Artifact path reviewed
- Structured facts path reviewed, if present
- Timestamp

This keeps the GUI as handoff and evidence preparation, not a second workflow engine.

## What already exists

- `docs/design-system.md` now defines the project-level design system for QRSPI UI.
- `apps/qrspi-dashboard` contains a static dashboard preview with demo data, project folder import, workflow list, stage track, artifact preview, run logs, WorkTree slices, capability list, and command copy. It is kept as a preview asset, not the current product surface.
- `assets/screenshot-dashboard.png` records the current dashboard direction; use it as a before-reference, not as final production design.
- `packages/qrspi` owns the CLI state machine and JSON output.
- `skills/qrspi-gate-review` owns the conversational human gate review flow.
- `docs/qrspi-team-workbench-requirements.zh.md` preserves the larger team workbench product scope.

## NOT in scope for 1A

- Full Feishu two-way sync: defer because 1A only supports manual link / pasted markdown intake.
- Shared team storage: defer until at least 3 real dogfood requirements prove the local reviewer queue is valuable.
- Dashboard-owned automatic model routing controls: defer for 1A; the CLI now consumes W-stage `model_tier` during I-stage slice execution.
- Full traceability platform: defer because 1A is only gate visibility and handoff, not requirement-code-test lineage.
- GUI-owned workflow state mutation: explicitly rejected because `qrspi` CLI remains the only state machine.
- Marketing site or landing page design: not applicable because workbench is App UI.

## 组件边界

- `packages/qrspi`：唯一状态机和 artifact owner，负责 stage、gate、runner、validation、parser、JSON 输出。
- `skills/qrspi-cli-workflow`：通用 QRSPI CLI 操作 SOP，避免 agent 手写或篡改 `.qrspi` 状态。
- `skills/qrspi-gate-review`：gate 阶段的一问一答 review SOP，负责把 DESIGN / STRUCTURE / PR gate 收敛为 approve 或 reject。
- `plugins/qrspi/.codex-plugin/plugin.json`：声明 plugin 元数据、skills、hooks 和入口提示。
- `plugins/qrspi/hooks/qrspi-hooks.json`：把 QRSPI 相关意图引导到正确 skill。
- `apps/qrspi-dashboard`：如果进入当前切片，只做 CLI-backed reviewer queue，不直接成为第二套 engine。
- `packages/qrspi-mcp`：如果保留，只做 CLI JSON wrapper，不自定义状态模型。

## MVP 能力

### P0：CLI JSON 输出

已落地：

- `qrspi status --json`
- `qrspi stage --json`
- `qrspi list --json`
- `qrspi context --json`
- `qrspi run --json`
- `qrspi approve --json`
- `qrspi reject --json`
- `--output text|json`
- `--json` 作为别名
- `run --json` 默认不塞完整 runner 输出
- `run --include-runner-output` 显式带 runner stdout/stderr
- JSON 模式错误输出统一 envelope

关键约束：

- stdout 只输出 JSON
- exit code 仍表达成功或失败
- human text 输出保持兼容
- JSON schema 应保持稳定，避免破坏 skills 和脚本

### P1：Gate Review Skill

已落地：

- `qrspi-gate-review` skill
- 读取 `qrspi status --json`
- 确认当前 stage 是 gate 且等待审批
- 读取 latest artifact 和 structured artifact
- 按 stage 类型提取人工确认点
- 一次只问一个问题
- 最终生成 gate decision markdown
- 通过 `approve --note-file` 或 `reject --feedback-file` 写回 CLI

### P2：Gate Review 历史沉淀

已落地：

- `qrspi approve --note-file <path>`
- `qrspi reject --feedback-file <path>`
- approve note 进入 approval comment
- reject feedback 进入 engine `lastError`
- `engine_state.json` 记录 `gate_reviews[]`
- 每条 gate review 包含 `stage`、`decision`、`recordedAt`、`sourceFile` 和 note/feedback 内容
- `.qrspi/<feature_id>/gate_reviews/` 保存 review markdown 副本
- JSON 输出返回最近一次 gate review 文件路径

后续可增强：

- 给 gate review record 增加更细的 reviewer / decision reason 字段

## 用户体验

目标交互：

```text
用户：帮我 review 当前 design gate
Codex：读取状态 -> 读取 artifact -> 一问一答确认 -> 汇总结论 -> 调 approve/reject
```

示例节奏：

```text
我看到 DESIGN 文档推荐方案是 A，并拒绝了 B。
第一个需要你确认的是：A 是否就是我们要推进到 STRUCTURE 的主方案？
```

不要一次性把完整 checklist 扔给用户。

## 非目标

- 不通过 MCP 包一层 human text CLI；如果保留 MCP，必须包 `--json` contract。
- 不在 plugin 中复制 QRSPI 状态机。
- 不让 skill 直接改 `.qrspi/state.json` 或 `.qrspi/engine_state.json`。
- 不用 GUI 替代 Codex 对话式 gate review；GUI 只能辅助发现、阅读和命令 handoff。
- 不在当前切片实现 Feishu 双向同步、共享团队存储、自动 model routing、完整 traceability 平台。

## 下一步

1. Contract slice：修正 plugin manifest / packaged plugin 路径，确保声明的 skills、hooks、assets、apps、MCP 配置真实存在。
2. Contract slice：保留 MCP，但只作为 CLI JSON wrapper；调用 `qrspi ... --json`，不解析 human text，不自定义状态模型。
3. Contract slice：扩展 CLI JSON，使 dashboard 能从 `list` + per-feature `status` 得到 reviewer queue 所需事实：stage、status、next_action、artifact path、structured path、gate_reviews、validation、updatedAt、latest run_dir / log path、WorkTree slice summary。
4. Dashboard slice：将 dashboard 数据层收口成 CLI JSON / MCP JSON adapter。raw `.qrspi` parsing 只能作为诊断视图，不能作为 reviewer queue 的权威数据源。
5. Dashboard slice：approve/reject handoff 默认生成 note/feedback draft，并生成带 `--note-file` / `--feedback-file` 的命令；裸 `approve` / `reject` 只能作为低优先级 fallback。
6. Test slice：增加 reviewer queue 垂直切片测试：pending gate 列表、artifact/structured facts、approve/reject handoff、gate review 持久化。
7. Test slice：修复测试 locale 隔离问题，避免 `LANG=zh_CN.UTF-8` 时 prompt 测试误红。

## 2026-04-28 工程评审补充

用户授权后，本轮工程评审后续问题按 reviewer 推荐自动决策，不再逐项打断确认。只有破坏性操作、安全敏感变更或无法从代码判断的事项再停下来问。

### Scope Challenge

结论：范围不缩，但实施拆成两个可 review 的落点。

```text
PR 1: Contract slice
  -> plugin manifest/package path checks
  -> MCP remains CLI JSON wrapper
  -> CLI JSON adds dashboard-required fields
  -> schema + CLI/MCP tests

PR 2: Dashboard slice
  -> reviewer queue first viewport
  -> CLI/MCP JSON adapter only
  -> raw .qrspi diagnostic view only
  -> note/feedback handoff drafts
  -> responsive/a11y screenshots + keyboard pass
```

### Architecture Review

1. `[P1] (confidence: 9/10) apps/qrspi-dashboard/src/main.js:865` — dashboard currently falls back to parsing `.qrspi/<feature>/state.json` and `engine_state.json`, which duplicates the CLI state contract.
   - Decision: CLI JSON / MCP JSON is the only product data source. Raw `.qrspi` parsing may remain only as a labeled diagnostic path for broken imports.
   - Tradeoff: users may need an explicit JSON export/import path, but reviewer state cannot silently drift from `qrspi status --json`.

2. `[P1] (confidence: 9/10) apps/qrspi-dashboard/src/main.js:430` — approve/reject commands are currently bare commands and do not preserve review reason by default.
   - Decision: dashboard must generate note/feedback markdown drafts and primary commands with `--note-file` / `--feedback-file`.
   - Tradeoff: more UI and file-handoff work, but gate history becomes durable instead of only advancing state.

3. `[P1] (confidence: 8/10) packages/qrspi/src/cli/json-output.ts:129` — `status --json` does not yet expose enough queue facts for dashboard 1A: timestamps, latest run metadata, WorkTree slice summary, and source/owner placeholders.
   - Decision: use additive CLI JSON fields, not a second dashboard state model. `list --json` remains summary; dashboard fetches/imports per-feature `status --json`.
   - Tradeoff: slightly more CLI contract work, but keeps the integration boring and testable.

4. `[P2] (confidence: 8/10) packages/qrspi-mcp/src/index.ts:69` — MCP accepts arbitrary `root` and can run `qrspi run`, approve, and reject. This is expected for a local stdio tool, but the plan must treat it as privileged command execution.
   - Decision: keep MCP local-only and document it as privileged. Validate that `root` resolves to an existing directory and rely on `execFile`, not shell execution.
   - Tradeoff: avoids building an auth layer for 1A, while making the blast radius explicit.

### Code Quality Review

1. `[P1] (confidence: 9/10) apps/qrspi-dashboard/src/main.js:751` — dashboard mixes demo data, CLI JSON import, raw state parsing, normalization, rendering, and command generation in one file.
   - Decision: split only along real responsibilities: `data-adapter`, `command-handoff`, and `render` modules. Do not introduce a framework for 1A.
   - Tradeoff: modest file count increase, but removes brittle coupling without over-engineering.

2. `[P2] (confidence: 8/10) docs/codex-plugin-roadmap.zh.md:301` — plan listed manifest, MCP, dashboard, tests, and locale as one linear next-step list.
   - Decision: group implementation by Contract slice and Dashboard slice so tests and review match the actual risk boundaries.
   - Tradeoff: two landable chunks instead of one large mixed PR.

3. `[P2] (confidence: 8/10) apps/qrspi-dashboard/src/index.html:12` — existing UI still has hero-first and "cockpit" copy, which conflicts with `docs/design-system.md`.
   - Decision: dashboard slice must remove hero-first structure and use reviewer queue as first viewport.
   - Tradeoff: visual rewrite is required, but the design system already makes the direction unambiguous.

### Test Review

Test framework: Vitest for `packages/qrspi`; dashboard currently has no automated browser test harness. Keep CLI/MCP tests in Vitest. For dashboard, add lightweight DOM/unit tests if a runner is introduced; otherwise require browser verification screenshots and keyboard pass before treating UI as ready.

```text
CODE PATHS                                                USER FLOWS
[+] packages/qrspi/src/cli/json-output.ts                 [+] Reviewer opens queue
  ├── [★★ TESTED] status gate facts                         ├── [GAP] [->E2E] pending D/S/PR sorted before completed
  ├── [GAP] updatedAt/latest run metadata                   ├── [GAP] missing artifact shows clear next command
  ├── [GAP] WorkTree slice summary                          └── [GAP] malformed structured facts do not fake summary
  └── [GAP] source/owner placeholders

[+] packages/qrspi-mcp/src/index.ts                       [+] Gate decision handoff
  ├── [GAP] status/list wrapper fixture                     ├── [GAP] [->E2E] approve with note-file persists record
  ├── [GAP] approve/reject wrapper fixture                  ├── [GAP] [->E2E] reject with feedback-file persists record
  └── [GAP] invalid root / CLI failure envelope             └── [GAP] bare approve/reject visually secondary

[+] apps/qrspi-dashboard/src/main.js                      [+] Import and display
  ├── [GAP] CLI JSON adapter only as authority              ├── [GAP] canceled/empty import has useful recovery actions
  ├── [GAP] raw .qrspi diagnostic path labeled              ├── [GAP] desktop/tablet/mobile queue-first screenshots
  ├── [GAP] note/feedback draft generation                  └── [GAP] keyboard path reaches queue, artifact, commands
  └── [GAP] command copy success/failure state

COVERAGE: 2/21 paths tested (10%)
QUALITY: ★★★:0 ★★:2 ★:0 | GAPS: 19 (5 E2E)
```

Mandatory test additions:

- `packages/qrspi/tests/cli/main.test.ts`: assert additive status JSON fields for `updatedAt`, latest run metadata, validation, gate reviews, and WorkTree summary.
- `packages/qrspi/tests/cli/gate-review-e2e.test.ts`: extend approve/reject coverage to verify `status --json` after both decisions returns the persisted latest gate review.
- `packages/qrspi/tests/mcp/mcp-wrapper.test.ts` or equivalent: fixture-test list/status/run/approve/reject wrappers and CLI failure envelopes without parsing human text.
- Dashboard verification: fixture import for multiple CLI status JSON files, missing artifact, missing structured artifact, malformed structured JSON, note/feedback command generation, copy success/failure, and raw `.qrspi` diagnostic labeling.
- Locale regression: run prompt/CLI tests with `LANG=zh_CN.UTF-8`, `LANG=en_US.UTF-8`, and `LANG` unset. Tests that assert English must pass `--lang en` or set env locally.

### Performance Review

1. `[P2] (confidence: 7/10) apps/qrspi-dashboard/src/main.js:937` — folder import reads many selected files into an in-memory map and may scan large `.qrspi` directories.
   - Decision: for 1A, prefer importing generated CLI JSON snapshots or MCP status output. If folder import remains, filter to `.json`, current-stage artifacts, latest run logs, and WorkTree files before reading text.
   - Tradeoff: avoids a heavier backend, but prevents a large run history from making the browser sluggish.

### Failure Modes

| Codepath | Production failure | Test | Handling required | User-visible result |
|----------|--------------------|------|-------------------|---------------------|
| CLI JSON status | artifact path points to missing file | GAP | yes | show artifact unavailable + `qrspi run/status` command |
| CLI JSON status | structured JSON missing or malformed | GAP | yes | show "Structured facts unavailable"; do not invent summary |
| MCP wrapper | invalid root or missing `qrspi` binary | GAP | yes | JSON error envelope with command and stderr |
| MCP wrapper | `qrspi run` stops at human gate | GAP | partial | show `stoppedAtGate` and next action |
| Dashboard adapter | imported file is raw `.qrspi` without CLI JSON | GAP | yes | diagnostic-only state, not reviewer authority |
| Command handoff | clipboard copy fails | GAP | yes | command text remains visible and selectable |
| Gate handoff | note/feedback draft not saved before command | GAP | yes | UI shows save/copy requirement before command |
| Locale tests | ambient `LANG=zh_CN.UTF-8` changes prompt output | GAP | yes | tests pin language explicitly |

Critical gaps: none after adopting the decisions above. Before those decisions, raw `.qrspi` authority and bare approve/reject were critical trust gaps.

### NOT in scope for 1A

- Full Feishu two-way sync: manual link / pasted markdown remains enough for dogfood.
- Shared team storage: wait until 3 real requirements prove reviewer queue value.
- Dashboard-owned automatic model routing controls: display `model_tier` and CLI-resolved runner/model metadata; policy consumption now lives in the CLI.
- Full traceability platform: defer requirement-code-test lineage.
- GUI-owned state mutation: rejected; all state changes go through `qrspi`.
- Browser-executed CLI: do not make the static dashboard execute local commands directly in 1A.

### What already exists

- CLI JSON envelopes and schemas exist under `packages/qrspi/src/cli/json-output.ts` and `docs/schemas/`.
- Gate review persistence already exists through `approve --note-file` and `reject --feedback-file`.
- MCP already shells out through `execFile` and wraps CLI JSON output.
- Dashboard already has demo data, project import, artifact/log display, stage track, WorkTree slice display, and command copy.
- `docs/design-system.md` already defines queue-first, evidence-desk UI rules.

### Worktree Parallelization Strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Contract slice | `packages/qrspi/`, `docs/schemas/`, `packages/qrspi-mcp/`, plugin manifests | — |
| Dashboard data adapter | `apps/qrspi-dashboard/` | Contract slice |
| Dashboard UI redesign | `apps/qrspi-dashboard/`, `docs/design-system.md` if needed | Dashboard data adapter |
| Verification assets | `assets/`, browser screenshots/test artifacts | Dashboard UI redesign |

Execution order:

```text
Lane A: Contract slice
  -> merge
Lane B: Dashboard data adapter -> Dashboard UI redesign -> Verification assets
```

Sequential implementation, no safe parallelization before the Contract slice lands. Dashboard work depends on the final CLI JSON shape.

### Lake Score

Complete option chosen for 5/5 review decisions:

- split implementation without shrinking 1A
- CLI JSON-only authority
- durable note/feedback handoff
- additive CLI JSON contract fields
- complete test matrix including locale and dashboard edge states

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | clean | 8 issues resolved by plan decisions, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 5/10 -> 9/10, 7 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | - |

- **UNRESOLVED:** 0 for this engineering review pass.
- **VERDICT:** ENG + Design Review cleared for implementation. Build Contract slice first, then Dashboard slice.
