# Changelog

## Unreleased

- Add CLI JSON output for `status`, `stage`, `list`, `context`, `run`, `approve`, and `reject` via `--json` / `--output json`.
- Add structured JSON error envelopes and keep `run --json` runner output opt-in through `--include-runner-output`.
- Add gate review persistence with `approve --note-file`, `reject --feedback-file`, `engine_state.json` `gate_reviews[]`, and `.qrspi/<feature>/gate_reviews/`.
- Add `qrspi-gate-review` skill and align the Codex plugin around skills + CLI without MCP or dashboard requirements.
- Add CLI JSON schema docs and a DESIGN gate review end-to-end fixture/test.

## 1.1.1 (2026-04-24)

- Fix CLI entry point not executing when run through symlinks (e.g., Volta, npm global bins).

## 1.1.0 (2026-04-24)

- Bump version to v1.1.0.

## 1.0.0 (2026-04-24)

- Initial release of `qrspi-agent`.
- 8-stage workflow: Questions → Research → Design → Structure → Plan → Work Tree → Implement → Pull Request.
- Human approval gates for Design, Structure, and Pull Request stages.
- Artifact persistence and structured parsing.
- Support for Claude Code, Codex CLI, and mock runners.
- Bilingual prompt rendering (English / Chinese).
- Vertical slice management for incremental implementation.
