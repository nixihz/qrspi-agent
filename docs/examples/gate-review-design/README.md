# DESIGN Gate Review Example

This fixture shows the expected CLI-backed flow for `qrspi-gate-review`.

## Starting Point

The workflow is at `D` and waiting for human approval:

```bash
qrspi status --root . --feature json-cli-output --json
```

Expected facts:

- `stage.code` is `D`
- `stage.is_gate` is `true`
- `stage.status` is `waiting_approval`
- `next_action.kind` is `human_gate_review`
- `artifacts.latest` points to the DESIGN artifact
- `artifacts.structured` points to the parsed DESIGN artifact

## One-Question-at-a-Time Review

Artifact summary:

- Recommended approach: add stable CLI JSON output and keep CLI as the source of truth.
- Rejected alternative: do not add MCP for this MVP.
- Risk: JSON schema stability must be documented.

Suggested conversation:

```text
I see the DESIGN artifact recommends CLI JSON output as the structured interface and rejects MCP for this MVP.
First confirmation: should CLI JSON output be the primary path we carry into STRUCTURE?
```

After the user confirms:

```text
Second confirmation: should MCP remain out of scope for this MVP?
```

After the user confirms:

```text
Final confirmation before STRUCTURE: is documenting the JSON schema enough to cover the compatibility risk?
```

## Decision File

Create a markdown review file like [design-gate-review.md](design-gate-review.md), then approve:

```bash
qrspi approve D --root . --feature json-cli-output --note-file /tmp/design-gate-review.md --json
```

The CLI persists the review in:

- `engine_state.json` under `gate_reviews[]`
- `.qrspi/json-cli-output/gate_reviews/D_<timestamp>_approved.md`
