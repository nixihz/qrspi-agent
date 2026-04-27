# qrspi-agent

Structured programming agent workflow CLI for Node.js and TypeScript.

QRSPI implements an 8-stage workflow:

`Questions -> Research -> Design -> Structure -> Plan -> Work Tree -> Implement -> Pull Request`

It is designed to keep agent sessions aligned with a real codebase through gated stages, minimal stage context, artifact validation, and bilingual prompts.

## Install

```bash
npm install -g qrspi-agent
qrspi --help
```

Or run it without a global install:

```bash
npx qrspi-agent --help
```

## Quick Start

```bash
qrspi init user-authentication --root .
qrspi prompt render Q --feature user-authentication --input "Add user authentication with email+password and OAuth"
qrspi prompt export --out qrspi-prompts.md
qrspi run --input "Add user authentication with email+password and OAuth"
qrspi status
```

When `qrspi run` stops at a gate stage (`D`, `S`, `PR`), review the artifact in `.qrspi/<feature_id>/artifacts/<STAGE>_<YYYY-MM-DD>.md`.
You may edit that markdown as the approved human-reviewed version, but do not edit `.qrspi/<feature_id>/state.json` or `engine_state.json` manually.

Typical next steps after `run`:

```bash
# Accept the current gate output
qrspi approve --root . --feature <feature_id>

# Regenerate the same gate stage
qrspi reject --root . --feature <feature_id> --comment "needs changes"
qrspi run --root . --feature <feature_id>

# Rewind to an earlier stage, then regenerate
qrspi rewind D --root . --feature <feature_id> --reason "design needs revision"
qrspi run --root . --feature <feature_id>
```

When a project contains multiple workflows under `.qrspi/`, select one explicitly:

```bash
qrspi status --feature user-authentication
qrspi run --feature user-authentication --runner mock --max-stages 1
```

## Features

- 8-stage workflow with human approval gates for `D`, `S`, and `PR`
- Artifact persistence under `.qrspi/<feature_id>/`
- Stage validation and structured parsing
- Execution-state aware `I` stage: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`
- `PR` precondition enforcement: only runs after a successful `I` stage
- Claude Code, Codex CLI, and mock runners
- English and Chinese prompt rendering
- Prompt template export for review (`qrspi prompt export`)
- Multiple workflow selection via `--feature <id>`
- Gate rejection via `qrspi reject` and workflow rollback via `qrspi rewind <stage>`

## Execution Semantics

`I` stage artifacts are now interpreted semantically:

- `DONE` / `DONE_WITH_CONCERNS`: successful implementation
- `BLOCKED` / `NEEDS_CONTEXT`: stop on `I`, keep the workflow on the same stage, and require human follow-up

`PR` is not allowed to run unless there is already a successful `I` run in workflow history.

## Common Commands

```bash
qrspi init <feature_id> --root .
qrspi list --root .
qrspi status --root . --feature <feature_id>
qrspi stage --root . --feature <feature_id>
qrspi prompt render Q --root . --feature <feature_id> --input "requirement"
qrspi prompt export --root . --lang zh --out qrspi-prompts.md
qrspi prompt export --root . --lang zh --split --out qrspi-prompts/
qrspi run --root . --feature <feature_id> --runner mock --max-stages 1
qrspi approve --root . --feature <feature_id>
qrspi reject --root . --feature <feature_id> --comment "needs changes"
qrspi rewind R --root . --feature <feature_id> --reason "redo research"
qrspi slice add mock-api --root . --feature <feature_id> --desc "Create mock API" --order 1 --checkpoint "curl passes"
qrspi slice list --root . --feature <feature_id>
qrspi context --root . --feature <feature_id>
qrspi budget
```

## Runners

Optional external CLIs are used only when you choose a real runner:

- `claude`
- `codex`

For local state-machine validation, use:

```bash
qrspi run --runner mock --input "Add user authentication"
```

## Documentation

- English repo guide: <https://github.com/nixihz/qrspi-agent>
- Chinese guide: <https://github.com/nixihz/qrspi-agent/blob/main/docs/README.zh.md>
