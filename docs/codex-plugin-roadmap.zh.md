# QRSPI Codex Plugin 路线图

本文记录当前的 Codex plugin 方向。旧方案里的 MCP 和 dashboard preview 已经降级，不作为 MVP 架构的一部分。

## 当前结论

QRSPI plugin 的核心边界是：

```text
Codex Plugin
  ├─ skills：负责 SOP、对话、判断下一步
  └─ qrspi CLI：负责状态机、产物、JSON 事实输出
```

不引入 MCP。原因是 CLI 已经能通过 `--json` / `--output json` 暴露结构化事实，继续加 MCP 只会复制一层状态操作和维护成本。

不做 dashboard 作为 MVP。gate review 更适合在 Codex 对话中逐项确认，并通过 CLI 把结果沉淀回 `.qrspi` 状态历史。

## 组件边界

- `packages/qrspi`：唯一状态机和 artifact owner，负责 stage、gate、runner、validation、parser、JSON 输出。
- `skills/qrspi-cli-workflow`：通用 QRSPI CLI 操作 SOP，避免 agent 手写或篡改 `.qrspi` 状态。
- `skills/qrspi-gate-review`：gate 阶段的一问一答 review SOP，负责把 DESIGN / STRUCTURE / PR gate 收敛为 approve 或 reject。
- `plugins/qrspi/.codex-plugin/plugin.json`：声明 plugin 元数据、skills、hooks 和入口提示。
- `plugins/qrspi/hooks/qrspi-hooks.json`：把 QRSPI 相关意图引导到正确 skill。

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

- 不通过 MCP 包一层 CLI。
- 不在 plugin 中复制 QRSPI 状态机。
- 不让 skill 直接改 `.qrspi/state.json` 或 `.qrspi/engine_state.json`。
- 不用 GUI 替代 Codex 对话式 gate review。

## 下一步

1. 增加端到端示例：从 DESIGN waiting approval 到 approve/reject。
2. 根据实际使用反馈收敛 `qrspi-gate-review` 的问题策略。
3. 视需要给 gate review record 增加 reviewer / decision reason 字段。
