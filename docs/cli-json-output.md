# QRSPI CLI JSON Output

The `qrspi` CLI supports machine-readable output for agent skills and scripts.

Use either form:

```bash
qrspi status --root . --feature <id> --json
qrspi status --root . --feature <id> --output json
```

Human text output remains the default.

## Contract

- `stdout` contains only JSON in JSON mode.
- Diagnostic logs and human-readable errors go to `stderr` only in text mode.
- Exit code still indicates success or failure.
- `run --json` does not include full runner stdout/stderr unless `--include-runner-output` is passed.
- Fields documented here are stable for skills and scripts. Additive fields are allowed; incompatible changes require a version bump and migration note.

Machine-readable schemas:

- [schemas/status.schema.json](schemas/status.schema.json)
- [schemas/run.schema.json](schemas/run.schema.json)
- [schemas/gate-decision.schema.json](schemas/gate-decision.schema.json)
- [schemas/common.schema.json](schemas/common.schema.json)

## Common Envelope

Successful feature-scoped commands use this shape:

```json
{
  "ok": true,
  "command": "status",
  "feature": "auth-refresh",
  "stage": {
    "code": "D",
    "name": "Design Discussion",
    "type": "alignment",
    "is_gate": true,
    "status": "waiting_approval"
  },
  "next_action": {
    "kind": "human_gate_review",
    "message": "Review and approve or reject the D artifact."
  }
}
```

Errors use this shape:

```json
{
  "ok": false,
  "command": "status",
  "error": {
    "code": "MULTIPLE_WORKFLOWS",
    "message": "[QRSPI] Multiple workflows found: alpha, beta. Re-run with --feature <id>.",
    "features": ["alpha", "beta"]
  }
}
```

## Commands

### `status`

```bash
qrspi status --root . --feature <id> --json
```

Important fields:

- `stage`: current stage facts.
- `next_action`: suggested next operation for agents.
- `artifacts.latest`: latest current-stage markdown artifact path.
- `artifacts.structured`: latest current-stage parsed JSON artifact path.
- `gate_reviews.latest`: latest gate review record when one exists.
- `gate_reviews.history`: gate review record history.
- `validation.passed`: false when the engine status is failed.

### `stage`

```bash
qrspi stage --root . --feature <id> --json
```

Returns the current stage, description, next stage, next action, and artifact paths.

### `list`

```bash
qrspi list --root . --json
```

Returns:

```json
{
  "ok": true,
  "command": "list",
  "features": [
    { "feature": "auth-refresh", "stage": "D", "status": "waiting_approval" }
  ]
}
```

### `context`

```bash
qrspi context --root . --feature <id> --json
```

Returns the current context strategy, dependency artifact summaries, and
budget audit data. The old `target_max_percent` and
`switch_threshold_percent` fields remain present; newer consumers can also use
the additive fields below.

```json
{
  "current_stage": "P",
  "dependencies": [
    {
      "stage": "Q",
      "required": false,
      "layer": "summary",
      "artifact_path": ".qrspi/auth/artifacts/Q_2026-04-29.md",
      "original_estimate": { "characters": 12000, "lines": 320 },
      "included_estimate": { "characters": 800, "lines": 24 },
      "truncated": true
    }
  ],
  "context_budget": {
    "target_max_percent": 40,
    "switch_threshold_percent": 60,
    "mode": "layered",
    "unit": "character",
    "max_context_size": 20000,
    "target_size": 8000,
    "switch_threshold_size": 12000,
    "status": "over_target",
    "prompt_estimate": { "characters": 9000, "lines": 180 },
    "context_estimate": { "characters": 9000, "lines": 180 },
    "warnings": [
      { "code": "context_over_target", "severity": "warning", "message": "..." }
    ],
    "truncation_decisions": [
      {
        "stage": "Q",
        "fromLayer": "summary",
        "toLayer": "pointer",
        "reason": "optional_summary",
        "artifactPath": ".qrspi/auth/artifacts/Q_2026-04-29.md"
      }
    ]
  }
}
```

Use `--context-mode full` on `context`, `prompt render`, or `run` to keep the
legacy complete-artifact behavior for debugging.

### `run`

```bash
qrspi run --root . --feature <id> --runner mock --max-stages 1 --json
```

Returns final workflow state plus one item per executed stage under
`data.executed_stages[]`.

- `data.workflow`
- `data.executed_stages[].stage`
- `data.executed_stages[].validation`
- `data.executed_stages[].artifact`
- `data.executed_stages[].structured_artifact`
- `data.stopped_at_gate`
- `data.next_action`

When workflow input comes from a file, `run --json` also includes
`data.workflow_input`:

```json
{
  "input_source": "file",
  "source_file": "requirements.md",
  "file_kind": "markdown"
}
```

`source_file` is project-relative when the file is inside `--root`.

Use this only when runner output is explicitly needed:

```bash
qrspi run --root . --feature <id> --json --include-runner-output
```

`qrspi run` and `qrspi prompt render` support `--input-file <path>` for UTF-8
`.md` and `.txt` files. File-input validation failures return the normal
`ok: false` JSON envelope in JSON mode with codes such as `INPUT_CONFLICT`,
`INPUT_FILE_NOT_FOUND`, `INPUT_FILE_IS_DIRECTORY`,
`INPUT_FILE_UNSUPPORTED_TYPE`, and `INPUT_FILE_UNREADABLE`.

When budgeted context crosses the session-switch threshold, `run --json`
returns `ok: false`, leaves the workflow on the current stage with
`engine_status: "needs_context"`, and records `lastContextError.code` as
`context_over_budget` in `engine_state.json`. The runner is not called in that
case; inspect the run directory's `context.json` for the full audit.

### `approve` / `reject`

```bash
qrspi approve --root . --feature <id> --note-file /tmp/design-review.md --json
qrspi reject --root . --feature <id> --feedback-file /tmp/design-feedback.md --json
```

Both return the stage after the transition and the latest `gate_review` record.

Gate review records are persisted in two places:

- `engine_state.json` under `gate_reviews[]`
- `.qrspi/<feature_id>/gate_reviews/<STAGE>_<timestamp>_<decision>.md`
