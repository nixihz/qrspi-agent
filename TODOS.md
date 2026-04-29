# TODO

## 让阶段上下文组装具备预算意识

- **状态：** 已完成（2026-04-29，commit `1d3b874`）。
- **内容：** 已用分层上下文策略替代后续阶段完整累积式上下文加载，并让现有上下文预算字段真正控制哪些内容会进入 prompt。
- **原因：** 目前 `P` 等后续阶段会收到完整的 `Q/R/D/S` artifact。这能降低遗漏风险，但也容易产生重复内容、膨胀 prompt，并让模型关注旧信息或重复细节，而不是当前阶段的具体执行工作。
- **完成范围：**
  - 已新增 `layered` / `full` context mode，默认使用 layered，保留 `--context-mode full` 兼容旧完整 artifact 行为。
  - 已为 `P/W/I/PR` 定义阶段 context profile，支持 `full` / `focused` / `summary` / `pointer` 分层。
  - 已新增 artifact source、focused extraction、分层渲染和确定性裁剪逻辑；markdown artifact 仍为权威来源，structured artifact 作为优化输入。
  - 已让 `qrspi context`、`qrspi prompt render`、`qrspi run` 共用 budgeted context pack。
  - 已在 runner 前估算 prompt/context 大小；超过 target 继续运行并记录 warning，超过 session-switch threshold 时在 runner 调用前以 `context_over_budget` 停止。
  - 已在 `context.json`、`runner_meta.json` 和 `qrspi context --json` 中输出预算状态、估算值、warning、裁剪决策和 artifact pointer。
  - 已修复 D/PR validator 对中文标题的支持，避免中文 `设计讨论文档`、`变更摘要` 等标题被 `\b` 单词边界误拦截。
  - 已更新 README、中文 README、CLI JSON 文档和 `qrspi-cli-workflow` skill，解释 instruction budget 与 context budget 的区别。
- **验收结果：**
  - `qrspi context --json` 已输出估算 prompt 大小、目标预算、裁剪决策和超预算 warning。
  - 当前序 artifact 很大时，`qrspi prompt render P` 已不再盲目嵌入完整 `Q/R/D/S` artifact，并会保留裁剪后的 artifact pointer。
  - 测试已覆盖阶段级依赖优先级、structured 优先与 markdown fallback、确定性裁剪、over-target warning、over-threshold pre-run stop、CLI JSON contract 和 prompt render budget note。
  - 文档已区分 instruction budget 和 context budget，并说明 layered/full 模式、target warning、threshold stop、审计字段。
- **验证：**
  - `npm run lint --workspace=packages/qrspi`
  - `npm test --workspace=packages/qrspi`
  - `npm run build --workspace=packages/qrspi`

## 为 QRSPI workflow 增加文档输入入口

- **状态：** 已完成（2026-04-29，commit `4bc3616`）。
- **内容：** 已支持用户从文档文件启动或渲染 QRSPI workflow，而不是只能传内联 `--input` 字符串。
- **原因：** 真实需求经常来自 Markdown、PDF、DOCX、飞书导出或粘贴的产品文档。当前 CLI 只暴露 `--input <text>`，长文档通过 shell quoting 传入既别扭又脆弱。
- **完成范围：**
  - 已给 `qrspi run` 和 `qrspi prompt render` 增加 `--input-file <path>`。
  - 已直接支持 `.md` 和 `.txt`，按 UTF-8 文本读取。
  - 已在文档中说明推荐桥接路径：PDF/DOCX/PPTX/XLSX/URL 先通过现有 `tomd` skill 转换，再把生成的 Markdown 文件传给 QRSPI。
  - 已在 prompt、run `context.json` 和 `run --json` 的 `workflow_input` metadata 中保留源文件路径，让 reviewer 知道 workflow 是由哪个文档启动的。
- **验收结果：**
  - `qrspi run --root . --feature <id> --input-file docs/requirement.md --json` 可工作，无需 shell command substitution。
  - `qrspi prompt render Q --root . --feature <id> --input-file docs/requirement.md` 包含文档内容和源路径。
  - 文件不存在、传入目录、文件不可读、不支持扩展名时，`--json` 模式输出清晰 JSON 错误。
  - README、中文 README、CLI JSON 文档和 skill 已说明非 Markdown 文档的 `tomd -> qrspi --input-file` 路径。
- **验证：**
  - `npm run lint --workspace=packages/qrspi`
  - `npm test --workspace=packages/qrspi`
  - `npm run build --workspace=packages/qrspi`

## 实现 slice 级自动执行

- **状态：** 候选 backlog。
- **内容：** 将 `WorkTree` slices 作为独立实现单元执行，而不是在一个 runner session 中执行整个 `I` 阶段。
- **原因：** QRSPI 的 vertical slicing 目前只实现了一部分。`W` 阶段可以定义 slices，但 `I` 阶段仍然作为一个大任务整体运行，这削弱了隔离性、可 review 性和重试行为。
- **建议范围：**
  - 在 `.qrspi/<feature_id>/slices/` 下持久化每个 slice 的执行状态。
  - 每次运行一个 slice，并为它生成独立 prompt、context pack、run directory、validation 和 status。
  - 将 slice 结果聚合成最终 `I` 阶段 artifact。
  - gate 推进继续由现有 engine 控制；不要创建第二套状态机。
- **依赖 / 阻塞：** 需要先做一轮小型 engine 设计，因为这会改变执行语义、run history 和重试行为。

## 在 runner 选择中消费 WorkTree `model_tier`

- **状态：** 候选 backlog。
- **内容：** 使用每个 slice 的 `model_tier`（`low` / `standard` / `powerful`）自动选择合适的 runner model。
- **原因：** WorkTree 已经记录了任务复杂度，但 runner 系统目前没有使用它。只有当 slices 能独立执行时，model routing 的价值才会真正体现出来。
- **建议范围：**
  - 增加 model-tier resolver，提供明确默认值并支持环境变量覆盖。
  - 在 run metadata 中记录解析后的 runner/model。
  - 保持 CLI `--model` 为最高优先级 override。
- **依赖 / 阻塞：** 最好在 slice 级自动执行之后实现，或与它一起实现。

## 增加 CI/CD 覆盖

- **状态：** 候选 backlog。
- **内容：** 给仓库增加 CI，运行 TypeScript workspace 的 lint、build 和 test 检查。
- **原因：** 项目现在已经有 CLI contract、parser 行为、plugin manifest 检查和 dashboard 逻辑，这些都值得用 CI 防止回归。
- **建议范围：**
  - 运行 `npm run lint`。
  - 运行 `cd packages/qrspi && npm test`。
  - 运行 `cd packages/qrspi && npm run build`。
  - 在合适的地方缓存 npm dependencies。
- **验收标准：** Pull request 在 TypeScript 错误、测试失败或 build 输出损坏时失败。
