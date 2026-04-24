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
qrspi prompt Q --render --input "Add user authentication with email+password and OAuth"
qrspi run --input "Add user authentication with email+password and OAuth"
qrspi status
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
- Claude Code, Codex CLI, and mock runners
- English and Chinese prompt rendering
- Multiple workflow selection via `--feature <id>`
- Gate rejection via `qrspi reject` and workflow rollback via `qrspi rewind <stage>`

## Common Commands

```bash
qrspi init <feature_id> --root .
qrspi list --root .
qrspi status --root . --feature <feature_id>
qrspi stage --root . --feature <feature_id>
qrspi prompt Q --render --root . --feature <feature_id> --input "requirement"
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
