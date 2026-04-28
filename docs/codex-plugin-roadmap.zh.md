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

dashboard / workbench 不替代 CLI。当前只允许做 reviewer queue 垂直切片：展示 pending gate、artifact、structured facts、gate history、run log、next command / approve-reject handoff。真实状态变更必须走 `qrspi approve` / `qrspi reject`。

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

1. 修正 plugin manifest / packaged plugin 路径，确保声明的 skills、hooks、assets、apps、MCP 配置真实存在。
2. 如果保留 MCP，将 `packages/qrspi-mcp` 改成调用 CLI JSON，不再解析 human text。
3. 将 dashboard 数据层收口成 CLI JSON / MCP JSON adapter；保留 demo 与导入模式，但不要把 raw `.qrspi` parsing 当成权威路径。
4. 增加 reviewer queue 垂直切片测试：pending gate 列表、artifact/structured facts、approve/reject handoff、gate review 持久化。
5. 修复测试 locale 隔离问题，避免 `LANG=zh_CN.UTF-8` 时 prompt 测试误红。
