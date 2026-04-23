---
name: qrspi-cli-workflow
description: 当用户希望用当前项目的 `qrspi` CLI 来初始化、查看、推进或自动执行 QRSPI 工作流时使用。适用于调用 `qrspi init`、`qrspi list`、`qrspi status`、`qrspi stage`、`qrspi prompt --render`、`qrspi advance`、`qrspi run`、`qrspi approve`、`qrspi slice`、`qrspi context`、`qrspi budget` 等命令，而不是手工模拟阶段管理的场景。
---

# QRSPI CLI Workflow

## 何时使用

当任务符合以下任一特征时使用本 skill：

- 用户要在某个项目里启动或继续一个 QRSPI feature 工作流
- 用户要查看当前阶段、完整状态、context 策略或预算信息
- 用户要渲染某一阶段 prompt 给外部 agent 或 runner 使用
- 用户要推进阶段、审批 gate、添加切片，或直接自动执行多阶段流程
- 用户明确提到 `qrspi`、`.qrspi/`、feature 工作流、阶段推进、gate、runner

如果只是讨论 QRSPI 方法论，不涉及当前 CLI 的真实操作，这个 skill 不是首选。

## 核心原则

- 优先调用 `qrspi` CLI，不要手工模拟状态机
- 优先读取当前 `.qrspi/` 状态，再决定下一步命令
- 优先沿着 CLI 已定义的阶段和 gate 走，不要跳过 `approve`
- 如果 CLI 已经能完成某件事，不要改用临时文件约定或自造流程

## 安装方式

这个 skill 目录可以通过 `skills` CLI 安装到支持的 agent 中。

推荐写法是把“仓库源”和“skill 名称”分开传：

```bash
# 从当前仓库本地路径安装
npx skills add . --skill qrspi-cli-workflow

# 从 Git 仓库安装
npx skills add ssh://git@git.xiezhi.xin:2222/iamx/qrspi-agent.git --skill qrspi-cli-workflow
```

如果要明确安装到特定 agent，可追加 `--agent codex`、`--agent claude-code`；
如果希望安装到用户级目录而不是当前项目，可追加 `--global`。

## 默认工作顺序

### 1. 先判断是否已初始化

优先检查：

- 当前项目根目录
- 是否存在 `.qrspi/`
- 是否已有 feature 状态

常用命令：

```bash
qrspi list --root .
qrspi status --root .
qrspi stage --root .
```

如果 CLI 提示尚未初始化（`list` 为空或 `status` 报错），再使用：

```bash
qrspi init <feature_id> --root .
```

### 2. 需要看当前阶段时

使用：

```bash
qrspi stage --root .
qrspi status --root .
```

约定：

- `stage` 看当前阶段摘要
- `status` 看全阶段状态和 runner 状态

### 3. 需要当前阶段指令时

优先让 CLI 渲染，而不是在 skill 里重写阶段提示。

使用：

```bash
qrspi prompt Q --render --root . --input "需求描述"
qrspi prompt D --render --root .
```

规则：

- 有用户原始需求时，传 `--input`
- 只需要看模板结构时，不带 `--render`
- 阶段码必须来自 `Q/R/D/S/P/W/I/PR`

### 4. 需要推进阶段时

先确认当前阶段产物已经存在，再调用：

```bash
qrspi advance --root .
```

只有在用户明确接受风险时，才考虑：

```bash
qrspi advance --root . --force
```

不要默认使用 `--force`。

### 5. 遇到 gate 时

`D`、`S`、`PR` 这类 gate 阶段，优先停下来让用户 review。

确认后使用：

```bash
qrspi approve --root .
```

如需显式指定阶段，可用：

```bash
qrspi approve D --root .
```

不要绕过 `approve` 直接修改状态。

### 6. 需要自动执行时

使用：

```bash
qrspi run --root . --input "需求描述"
```

如果用户希望明确 runner，可用：

```bash
qrspi run --root . --runner codex --model gpt-5.4
qrspi run --root . --runner mock
```

补充规则：

- `--no-stop-at-gate` 默认不要开
- 除非用户要求，否则不要跨很多阶段盲跑
- 需要受控执行时，优先配合 `--max-stages`

### 7. 需要管理垂直切片时

使用：

```bash
qrspi slice list --root .
qrspi slice add mock-api --desc "创建 mock API" --order 1 --checkpoint "curl 通过" --root .
```

要求：

- 切片名简洁稳定
- `order` 明确
- `checkpoint` 可验证

### 8. 需要查看约束信息时

使用：

```bash
qrspi context --root .
qrspi budget
```

适合在进入新阶段前确认 context 装载范围和提示预算。

### 9. 需要切换语言时

使用：

```bash
# 显式指定中文
qrspi run --root . --input "需求" --lang zh

# 或依赖系统 LANG 环境变量自动识别
export LANG=zh_CN.UTF-8
qrspi run --root . --input "需求"
```

默认语言为英文，可通过 `--lang` 或系统 `LANG` 覆盖。

## 输出与状态约定

默认认为 CLI 会使用：

- `.qrspi/<feature>/state.json`
- `.qrspi/<feature>/artifacts/`
- `.qrspi/<feature>/structured/`
- `.qrspi/<feature>/slices/`
- `.qrspi/<feature>/runs/`

处理任务时应基于这些真实目录判断状态，而不是靠口头假设。

## 何时停下来

以下情况应暂停并告知用户：

- `qrspi` 尚未初始化，且 feature_id 不明确
- 当前阶段缺少产物，无法安全 `advance`
- 已到 gate 阶段，需要人工确认
- runner 不存在或命令执行失败
- CLI 输出与用户预期冲突，需要先对齐工作目录或 feature

## 不该做的事

- 不要在 CLI 已能处理阶段时手工改 `.qrspi` 状态
- 不要跳过 `status/stage` 就假设当前 feature
- 不要默认 `--force`
- 不要把方法论说明当成 CLI 执行结果
- 不要在 gate 阶段装作已经审批完成
