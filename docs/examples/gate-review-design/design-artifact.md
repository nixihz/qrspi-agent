# D - Design Discussion

## Goals

- Add stable JSON output for QRSPI CLI commands.
- Keep human text output unchanged.
- Make gate review decisions traceable for skills and scripts.

## Recommended Approach

- Add `--output text|json` and `--json` alias to the CLI.
- Keep `qrspi` CLI as the source of truth for workflow state and artifacts.
- Let skills handle SOP, conversation, and next-step judgment.

## Rejected Alternatives

- Do not add MCP for this MVP.
- Do not add a dashboard as the primary gate review surface.

## Risks

- JSON schema stability must be documented.
- Gate review notes must be persisted outside transient chat history.
