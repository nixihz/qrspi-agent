---
name: qrspi-cli-workflow
description: Use when the user wants to initialize, inspect, advance, or auto-run a QRSPI workflow via the `qrspi` CLI. Covers `qrspi init`, `qrspi list`, `qrspi status`, `qrspi stage`, `qrspi prompt --render`, `qrspi advance`, `qrspi run`, `qrspi approve`, `qrspi slice`, `qrspi context`, `qrspi budget`. Do NOT manually simulate stage management when the CLI can handle it.
---

# QRSPI CLI Workflow

## When to use

Trigger this skill when any of the following is true:

- The user wants to start or resume a QRSPI feature workflow in a project
- The user wants to check current stage, full status, context strategy, or budget
- The user wants to render a stage prompt for an external agent or runner
- The user wants to advance stages, approve gates, add slices, or auto-run multi-stage flows
- The user explicitly mentions `qrspi`, `.qrspi/`, feature workflow, stage advancement, gate, or runner

If the discussion is about QRSPI methodology without real CLI operations, this skill is NOT the right choice.

## Core principles

- Prefer calling the `qrspi` CLI; do NOT manually simulate the state machine
- Read the current `.qrspi/` state first before deciding the next command
- Follow the CLI-defined stages and gates; do NOT skip `approve`
- If the CLI can already do something, do NOT invent temporary file conventions or custom flows

## Installation

This skill directory can be installed into supported agents via the `skills` CLI.

Important:

- Installing this skill only installs the skill instructions
- It does NOT guarantee that the `qrspi` CLI is already available on the machine
- If `qrspi` is missing, install the npm package `qrspi-agent`

Recommended syntax separates the repository source from the skill name:

```bash
# Install from local repository path
npx skills add . --skill qrspi-cli-workflow

# Install from Git repository
npx skills add https://github.com/nixihz/qrspi-agent.git --skill qrspi-cli-workflow
```

To target a specific agent, append `--agent codex` or `--agent claude-code`.
To install globally instead of the current project, append `--global`.

If the `qrspi` command is not available after the skill is installed, install the CLI package separately:

```bash
npm install -g qrspi-agent
qrspi --help
```

Or use it without a global install:

```bash
npx qrspi-agent --help
```

## Default workflow

### 1. Check if already initialized

Prefer checking:

- The current project root
- Whether `.qrspi/` exists
- Whether there is already a feature state

Common commands:

```bash
qrspi list --root .
qrspi status --root .
qrspi stage --root .
```

If the CLI reports not initialized (list is empty or status errors), then use:

```bash
qrspi init <feature_id> --root .
```

### 2. View current stage

Use:

```bash
qrspi stage --root .
qrspi status --root .
```

Convention:

- `stage` shows the current stage summary
- `status` shows the full stage state and runner state

### 3. Get the current stage prompt

Let the CLI render the prompt rather than rewriting stage instructions inside the skill.

Use:

```bash
qrspi prompt Q --render --root . --input "requirement description"
qrspi prompt D --render --root .
```

Rules:

- Pass `--input` when there is a raw user requirement
- Omit `--render` when you only want to see the template structure
- Stage codes must be one of `Q/R/D/S/P/W/I/PR`

### 4. Advance a stage

Confirm the current stage artifact exists before calling:

```bash
qrspi advance --root .
```

Only consider:

```bash
qrspi advance --root . --force
```

when the user explicitly accepts the risk.

Do NOT default to `--force`.

### 5. Hit a gate

For gate stages (`D`, `S`, `PR`), pause and let the user review.

After confirmation, use:

```bash
qrspi approve --root .
```

To explicitly specify a stage:

```bash
qrspi approve D --root .
```

Do NOT bypass `approve` by directly modifying state.

### 6. Auto-run

Use:

```bash
qrspi run --root . --input "requirement description"
```

If the user wants to specify a runner:

```bash
qrspi run --root . --runner codex --model gpt-5.4
qrspi run --root . --runner mock
```

Additional rules:

- Do NOT enable `--no-stop-at-gate` by default
- Unless the user requests it, do NOT blindly run across many stages
- For controlled execution, prefer using `--max-stages`

### 7. Manage vertical slices

Use:

```bash
qrspi slice list --root .
qrspi slice add mock-api --desc "Create mock API" --order 1 --checkpoint "curl passes" --root .
```

Requirements:

- Slice names should be concise and stable
- `order` must be explicit
- `checkpoint` must be verifiable

### 8. View constraint information

Use:

```bash
qrspi context --root .
qrspi budget
```

Good for confirming context loading scope and instruction budget before entering a new stage.

### 9. Switch language

Use:

```bash
# Explicit Chinese
qrspi run --root . --input "requirement" --lang zh

# Or rely on system LANG auto-detection
export LANG=zh_CN.UTF-8
qrspi run --root . --input "requirement"
```

Default language is English. Override via `--lang` or system `LANG`.

## Output and state conventions

The CLI uses:

- `.qrspi/<feature>/state.json`
- `.qrspi/<feature>/artifacts/`
- `.qrspi/<feature>/structured/`
- `.qrspi/<feature>/slices/`
- `.qrspi/<feature>/runs/`

Base decisions on these real directories, not assumptions.

## When to stop

Pause and inform the user when:

- `qrspi` is not yet initialized and feature_id is unclear
- The current stage lacks an artifact, making `advance` unsafe
- A gate stage is reached and requires human confirmation
- The runner does not exist or the command fails
- CLI output conflicts with user expectations; align on working directory or feature first

## What NOT to do

- Do NOT manually modify `.qrspi/` state when the CLI can handle stages
- Do NOT assume the current feature without running `status`/`stage`
- Do NOT default to `--force`
- Do NOT treat methodology explanations as CLI execution results
- Do NOT pretend a gate stage has already been approved
