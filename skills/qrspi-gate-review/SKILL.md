---
name: qrspi-gate-review
description: Use when the user asks to review, approve, reject, or decide a QRSPI gate stage such as DESIGN, STRUCTURE, or PULL_REQUEST. Runs an interactive one-question-at-a-time gate review by reading `qrspi status --json`, the latest gate artifact, and the structured artifact, then records the final decision with `qrspi approve --note-file` or `qrspi reject --feedback-file`. Do not use for non-gate workflow operations; use qrspi-cli-workflow instead.
---

# QRSPI Gate Review

## Goal

Turn a gate artifact into an explicit human decision without bypassing the QRSPI state machine.

Use the `qrspi` CLI as the source of truth. Do not edit `.qrspi/state.json` or `.qrspi/engine_state.json`.

## Workflow

1. Inspect state with JSON output:

```bash
qrspi status --root . --json
```

If multiple workflows exist, ask for the feature id or use the one the user provided:

```bash
qrspi status --root . --feature <feature_id> --json
```

2. Confirm the current stage is a gate waiting for approval:

- `stage.is_gate` must be `true`
- `stage.status` should be `waiting_approval`
- If not, explain the current `next_action` and stop the gate review

3. Read the files from `artifacts.latest` and `artifacts.structured` when present.

4. Extract the smallest useful set of human confirmations. Ask exactly one question at a time.

5. Record each answer in working notes. Continue until the remaining decision is clear.

6. Produce a gate decision markdown file:

```markdown
# <STAGE> Gate Review

Decision: approved | approved with notes | rejected

Confirmed:
- ...

Requested follow-up:
- ...

Reject feedback:
- ...
```

7. Apply the decision through the CLI:

```bash
qrspi approve --root . --feature <feature_id> --note-file <review_file> --json
qrspi reject --root . --feature <feature_id> --feedback-file <review_file> --json
```

Use `approve` only when the artifact is acceptable for the next stage. Use `reject` when the current gate artifact must be regenerated.

The CLI records the review in `engine_state.json` under `gate_reviews[]`; do not write that state file yourself.

## Question Strategy

Never ask a long checklist in one message. Summarize the specific artifact point you are confirming, then ask one concrete question.

Good:

```text
I see the DESIGN artifact recommends approach A and rejects approach B.
First confirmation: should A be the primary path we carry into STRUCTURE?
```

Bad:

```text
Please confirm goals, non-goals, alternatives, API boundaries, risks, rollback, and unresolved issues.
```

## Stage Checkpoints

For `D` / DESIGN, confirm in this order:

1. Goals and non-goals are correct
2. Recommended approach is accepted
3. Rejected alternatives are truly out of scope
4. Data model, API, integration boundaries, or CLI behavior have no blocking gaps
5. Risks and rollback strategy are acceptable
6. Nothing else must be resolved before STRUCTURE

For a compact demonstration of the expected DESIGN review rhythm, see
`references/design-review-example.md`. Do not load it during normal reviews
unless you need a calibration example.

For `S` / STRUCTURE, confirm:

1. Proposed file/module boundaries match the codebase
2. Public types, function signatures, and data flow are complete enough
3. Vertical slices are independently testable
4. Migration or compatibility concerns are covered
5. Nothing else must be resolved before PLAN

For `PR` / PULL_REQUEST, confirm:

1. User-facing behavior matches the accepted plan
2. Tests and validation evidence are sufficient
3. Known concerns are acceptable or documented
4. Rollback/recovery path is clear
5. The work is ready to merge or must be rejected for changes

## Decision Rules

- If the user accepts the artifact with only follow-up notes, approve with notes.
- If the user asks for changes to the current gate artifact, reject with feedback.
- If an upstream assumption changed, suggest `qrspi rewind <stage>` instead of approve/reject.
- If the user is ambiguous, ask the next smallest clarifying question.
- Do not call `approve` or `reject` until the user has explicitly confirmed the final decision.
