# QRSPI Team Workbench 完整需求

本文记录完整产品需求，不代表当前实现一次性全做。当前实现范围以 [Codex Plugin 路线图](./codex-plugin-roadmap.zh.md) 为准。

## 目标

把 QRSPI 从个人 CLI 工作流扩展成团队可见的开发流程 harness：

```text
Feishu requirement
  -> 创建 QRSPI session
  -> AI 自动推进 Q/R/D
  -> DESIGN 进入 reviewer queue
  -> 人工 approve/reject 并记录原因
  -> AI 继续推进 S/P/W/I/PR
  -> PR 进入 reviewer queue
  -> gate 历史、artifact、run log、决策原因都留在 feature 上
```

核心原则：

- QRSPI CLI 仍是唯一状态机。
- Workbench 只做可见性、队列、artifact 阅读、gate decision handoff、run 可见性和 intake。
- 不直接修改 `.qrspi/state.json` 或 `.qrspi/engine_state.json`。
- DESIGN、STRUCTURE、PR gate 不能被自动绕过。

## 当前收窄范围：1A

先做 **CLI-backed reviewer queue 垂直切片**：

- 读取 CLI JSON 或 MCP JSON，列出 pending DESIGN / STRUCTURE / PR gates。
- 展示 feature、current gate、owner/source、age、validation、latest artifact summary。
- 展示 artifact markdown、structured facts、gate history、run logs、WorkTree slices、next commands。
- approve/reject 只能生成或调用 `qrspi approve` / `qrspi reject`，并通过 `--note-file` / `--feedback-file` 持久化 review。
- Feishu 只做手动 link / pasted markdown intake，不做自动写回。

验收标准：

- 一个真实需求能从 session 创建推进到 DESIGN gate。
- DESIGN gate 能出现在 reviewer queue。
- reviewer 能读到 artifact 和 structured facts。
- approve/reject 后，`.qrspi/<feature>/gate_reviews/` 和 `engine_state.json` 都能看到 review record。
- workflow 能继续推进到 PR gate 并再次停下。

## 完整 Workbench 需求

### Reviewer Queue

第一屏优先服务 reviewer：

- pending DESIGN gates
- pending STRUCTURE gates
- pending PR gates
- blocked / needs-context sessions
- feature owner
- source requirement
- age at gate
- validation result
- latest artifact summary
- required reviewer action

动作：

- open artifact
- open structured facts
- approve with note
- reject with feedback
- copy CLI command
- continue run after approval

### Feature Detail

每个 feature 详情页包含：

- Q/R/D/S/P/W/I/PR stage track
- current artifact markdown
- structured artifact JSON summary
- gate history
- run logs
- WorkTree slices
- next commands
- Feishu requirement source

### Feishu Intake

短期：

- paste Feishu requirement link
- paste or import markdown
- generate feature id
- initialize QRSPI session
- run to DESIGN gate

后续：

- 自动下载 Feishu 文档
- 记录 source doc version
- 需要时写回 gate decision 或 review summary

### Model Routing

不要作为第一阶段核心功能。后续按 runner policy 引入：

- W stage 输出 `model_tier`: `low` / `standard` / `powerful`
- runner policy 映射到实际模型
- dashboard 展示 tier 和模型
- high-cost / high-risk run 前允许人工 override

### Team History

长期需要解决团队共享历史，但不进当前切片：

- local `.qrspi`
- shared git branch
- internal service
- Feishu-linked artifact storage

选择前必须先完成 3 个真实需求 dogfood。

## 非目标

- 不做完整 requirement-code-test traceability 平台。
- 不做全自动执行平台。
- 不在 dashboard/MCP 中复制 QRSPI engine。
- 不把 GUI 做成绕过 human gate 的入口。

## 后续阶段建议

1. **1A reviewer queue**：CLI-backed queue + gate decision handoff。
2. **1B intake**：Feishu link / markdown import -> session init -> run to DESIGN。
3. **1C packaging**：插件 manifest、app、MCP、dashboard 构建和安装检查闭环。
4. **2A shared review**：team history、reviewer identity、decision reason 字段增强。
5. **2B execution routing**：WorkTree `model_tier` -> runner model selection。
6. **3 traceability**：requirement、artifact、code、tests、PR 的完整链路。

## Dogfood 记录要求

在推广给团队前，至少跑 3 个真实 Feishu 需求，并记录：

- 到 DESIGN gate 花了多久。
- agent 提出了哪些原本需要人工发现的问题。
- DESIGN gate 是 approve 还是 reject。
- 节省或浪费了多少时间。
- reviewer queue 缺了哪些信息。

只有当这 3 次证明 reviewer queue 真能帮助决策，再邀请第二个人一起 review 一个 DESIGN gate。
