# Design Discussion — QRSPI Node.js/TypeScript Port

## 1. Current State

The Node.js/TypeScript port of qrspi is in active development. Stage R research has produced a complete codebase technical map covering the entrypoint layer, workflow stage schema, state machine types, disk protocol, runner system, context management, and validation pipeline.

### Implemented Components

**Workflow Engine** (`src/engine/engine.ts`): The `runSingleStage()` function orchestrates a linear sequence: build context → render prompt → invoke runner → validate output → persist artifact → update state. Gate stages (D/S/PR) transition to `waiting_approval` instead of advancing. The engine tracks `stage_attempts`, `history`, `approvals`, and `lastError` in `engine_state.json`.

**Stage Schema** (`src/workflow/stage-schema.ts`): Eight stages are defined with full metadata — `STAGE_ORDER`, `GATE_STAGES`, `STAGE_DEFINITIONS`, `STAGE_DESCRIPTIONS`, and dependency graph. Dependencies use `summaryOnly: true` throughout, meaning ContextBuilder only loads truncated summaries of prior artifacts.

**Disk Protocol** (`src/storage/path-resolver.ts`): The `.qrspi/<featureId>/` directory layout is partially implemented with `artifacts/`, `runs/`, `structured/`, and `slices/` subdirectories. State files are `state.json` (WorkflowState) and `engine_state.json` (EngineState). Run directories follow the pattern `<STAGE>_<timestamp>_attempt<N>/` with six file types per run.

**Runner System** (`src/runner/index.ts`): Three runners exist — `ClaudeCodeRunner`, `CodexCliRunner`, `MockRunner`. Model resolution follows a priority chain: CLI flag → `QRSPI_<RUNNER>_MODEL` → `QRSPI_MODEL` → runner default.

### Gaps Identified by Stage Q

| Question | Status |
|----------|--------|
| Q1: Disk protocol structure | Partially answered — layout defined but not fully validated against Python |
| Q2: Stage order and gate strategy | Fully answered — 8 stages, gates at D/S/PR |
| Q3: Runner protocol | Partially answered — interface defined but subprocess invocation not validated |
| Q4: ContextBuilder summarization | Partially answered — only first 40 lines truncation, no intelligent summarization |
| Q5: Prompt template structure | Not yet implemented — TypeScript template system not yet built |

### Known Limitations (from AGENTS.md)

- Slice-level auto-execution for W and I stages is not implemented
- ContextBuilder summarization is linear truncation, not semantic
- No CI/CD configuration
- `model_tier` is captured in WorkTree but not consumed by the runner

---

## 2. Target State

The TypeScript port should be a self-contained, dependency-minimal CLI tool that provides the same workflow guidance as the Python original while leveraging TypeScript's type safety and Node.js ecosystem.

### Functional Goals

1. **Full 8-stage workflow** with gate approval at D, S, and PR stages
2. **Compatible disk protocol** so .qrspi directories created by either implementation can be read by both
3. **Multi-runner support** with Claude Code, Codex CLI, and MockRunner
4. **Bilingual prompts** via `--lang zh` flag and `LANG` environment variable detection
5. **Vertical slice tracking** via the `qrspi slice` subcommand
6. **Instruction budget visibility** via `qrspi budget` command

### Non-Goals (YAGNI)

- Intelligent LLM-based summarization of artifact content (linear truncation is acceptable for v1)
- Per-slice subagent dispatch for W/I stages (single-session execution is acceptable for v1)
- CI/CD pipeline integration
- Plugin or extension system

---

## 3. Design Decisions

### Decision 1: Disk Protocol Compatibility Level

- **Recommended**: Strict compatibility with Python .qrspi directory structure, including filenames, JSON field names, and file contents. The Python version is the canonical reference; TypeScript port must be able to read and write every file the Python version produces.

- **Alternative A — TypeScript-native protocol**: Define a clean TypeScript-compatible schema (e.g., camelCase field names, additional metadata fields) and accept that cross-implementation compatibility is broken. This simplifies the implementation but loses interoperability.

- **Alternative B — Compatibility mode with extension**: Maintain strict compatibility for core files (`state.json`, `engine_state.json`, `artifacts/*.md`) but extend with TypeScript-specific metadata (e.g., `runs/*/types.json`). Breaks clean parsing but adds TypeScript-native benefits.

- **Needs Confirmation**: Should the TypeScript port aim for bidirectional compatibility with the Python implementation, or is the Python version considered legacy/deprecated? This affects every file I/O operation in the storage layer.

**Why it matters**: The disk protocol is the integration boundary. If incompatible, teams using the TypeScript version cannot collaborate with teams using Python, and existing .qrspi histories become unreadable.

---

### Decision 2: State Machine Architecture

- **Recommended**: Keep the current imperative state machine in `engine.ts`. The existing `runSingleStage()`, `approveCurrentStage()`, `rejectCurrentStage()`, and `rewindWorkflowStage()` functions provide a complete and understandable control flow. Add an event-emitter layer for observability (CLI progress output, hook callbacks).

- **Alternative A — State machine pattern**: Refactor to a formal state machine (XState or hand-rolled) where transitions are explicit events. Cleaner for complex branching but adds a dependency or significant complexity.

- **Alternative B — Workflow engine abstraction**: Extract a `WorkflowEngine` class that encapsulates state transitions, with injected strategies for validation, runner execution, and artifact storage. More testable but requires significant refactoring.

- **Needs Confirmation**: Is the current imperative style acceptable, or does the team require a formal state machine pattern for the engine? No strong evidence from Python original that formal state machine is necessary.

---

### Decision 3: ContextBuilder Truncation Strategy

- **Recommended**: Keep the current linear truncation (first N lines) for v1. The ContextBuilder reads dependency artifact files and truncates to a configurable line limit (default 40 lines). Implement the truncation at the file level, not at the character level, to preserve markdown structure integrity.

- **Alternative A — Semantic chunking**: Split artifacts by logical sections (headers, code blocks, lists) and select chunks based on relevance scoring. Requires LLM or heuristics; too complex for v1.

- **Alternative B — Stage-specific truncation budgets**: Each stage has a different context budget. D stage needs 200 lines of Q+R summary; I stage needs only W artifact. This adds configuration complexity but better matches actual usage.

- **Needs Confirmation**: Should the 40-line truncation limit be a hardcoded constant or a stage-specific configuration? Also: should truncation preserve markdown heading structure (always keep H1/H2)?

---

### Decision 4: Runner Subprocess Invocation

- **Recommended**: Use Node.js `child_process.spawn()` for all runners. For Claude Code: spawn `claude` with `-p` flag and pipe prompt via stdin or `--prompt` argument. For Codex: spawn `codex exec --full-auto`. Capture stdout, stderr, exit code, and duration. Use timeout support (default 10 minutes).

- **Alternative A — npm wrapper packages**: Use existing npm packages that wrap `claude` or `codex` CLIs. Adds a dependency and reduces control over CLI arguments.

- **Alternative B — Direct stdio passthrough**: Pass runner output directly to stdout without buffering, enabling real-time streaming. More complex to validate and parse, but better UX for long runs.

- **Needs Confirmation**: Should runner output be streamed in real-time to stdout, or buffered until completion? Real-time streaming provides better UX but complicates artifact capture and validation.

---

### Decision 5: Prompt Template Storage and Rendering

- **Recommended**: Store prompt templates as TypeScript template literal strings in `src/prompts/template-registry.ts`. Use a `TemplateRegistry` class with stage-keyed templates, language variants (`en`/`zh`), and variable interpolation via `mustache`-style `{{variable}}` syntax. This keeps prompts versioned with code and type-checked.

- **Alternative A — External template files**: Store templates as `.md` files in `src/prompts/templates/` directory, loaded at runtime. More flexible for non-developer editing but adds file I/O and loses type safety.

- **Alternative B — Database or CMS**: Store prompts in a database or remote CMS. Enables hot updates but adds infrastructure dependency and latency.

- **Needs Confirmation**: Should prompt templates be inlined in TypeScript code or loaded from external files? The Python version uses a combination of file-based templates and inline strings.

---

### Decision 6: Validation Strategy for Stage Artifacts

- **Recommended**: Implement a two-tier validation strategy. Tier 1 (fast heuristic): regex-based checks for markdown structure, required sections, and keyword presence (e.g., `DONE` in I stage output). Tier 2 (structured parsing): parse the artifact as JSON for stages that output structured data (W, S, PR), and validate against JSON Schema. Return `ValidationResult` with `valid`, `issues[]`, and `summary` fields.

- **Alternative A — LLM-based validation**: Use a secondary LLM call to validate stage output. Too expensive and slow for v1.

- **Alternative B — Strict JSON schema only**: Reject non-JSON output for all stages. Too restrictive — markdown artifacts are the primary output format.

- **Needs Confirmation**: Should the validator be strict (fail on any issue) or lenient (warn but allow)? The current implementation fails on any validation issue. Should there be a `--force` flag to bypass validation?

---

### Decision 7: Slice-Level Execution for W and I Stages

- **Recommended**: Defer per-slice subagent dispatch to v2. In v1, the W and I stages execute as a single session, consuming the full WorkTree artifact without splitting into independent slice sessions. The `qrspi slice` subcommand manages slice definitions, but the engine does not auto-dispatch per slice.

- **Alternative A — Implement per-slice dispatch in v1**: When engine reaches W or I stage, iterate over `WorkTree.slices[]` and dispatch one runner invocation per slice. Requires `slice_id` parameter in runner context and per-slice state tracking.

- **Alternative B — Hybrid approach**: Allow explicit slice execution via `qrspi run --slice <id>` flag, but default to full session execution. Reduces blast radius of changes while adding the feature incrementally.

- **Needs Confirmation**: Is per-slice execution a v1 requirement or deferrable? If deferrable, the W and I stage prompts should be updated to reflect that the agent handles the entire WorkTree in one session.

---

### Decision 8: CLI Output and Progress Communication

- **Recommended**: Use a structured output system. All data output (workflow state, stage artifacts, validation results) uses JSON with a consistent envelope format. Human-readable output uses a `--json` flag to suppress. Progress/status output goes to stderr, data output goes to stdout, following Unix conventions.

- **Alternative A — Rich CLI output**: Use ANSI color codes, spinners, and progress bars for terminal UX. Adds `chalk` or `ora` dependency but provides better UX.

- **Alternative B — Structured logging**: Use a structured logger (JSON logs to stderr) for all output, with separate rendering layer for terminal vs. programmatic use. More complex but enables log aggregation.

- **Needs Confirmation**: Is rich terminal UX (colors, spinners) desired for v1, or is structured JSON output sufficient? Rich output adds a dependency and complexity.

---

## 4. Architecture Constraints

### Disk Protocol Compatibility

The TypeScript implementation must be able to read and write `.qrspi/` directories created by the Python implementation. This constrains:
- JSON field names (must match Python snake_case conventions)
- Filename patterns for artifacts and run directories
- State file schemas for `state.json` and `engine_state.json`

### Minimal Dependency Policy

The CLI tool has exactly one core runtime dependency (`commander`). Runner tools (`claude`, `codex`) are optional external dependencies. This constrains:
- No state machine libraries (XState, etc.)
- No ORM or database libraries
- No HTTP client libraries
- No prompt management systems

### TypeScript Strict Mode

All code must pass `tsc --strict`. This constrains:
- No `any` types in public APIs
- All function parameters must have explicit types
- Null/undefined must be handled explicitly

### Bilingual Prompt Support

Prompts must support both English and Chinese. This constrains:
- Template system must be language-aware
- All eight stage prompts need both `en` and `zh` variants
- Language selection via `--lang` flag and `LANG` environment variable

### Instruction Budget Per Stage

Each stage prompt must contain 8–13 instructions, far below the 150-instruction danger line. This constrains:
- Prompt templates must be concise
- No verbose explanations in prompt text
- Clear escalation and status report protocols per stage

---

## 5. Risks and Mitigations

### Risk 1: Disk Protocol Incompatibility (High)

The highest-priority risk. If the TypeScript port produces `.qrspi/` files that the Python implementation cannot read, teams using both implementations will experience data corruption or silent failures.

- **Mitigation**: Write integration tests that create a `.qrspi/` directory with the TypeScript implementation and verify the Python implementation can read it. Define the disk protocol as the primary compatibility boundary and test it exhaustively before any release.

### Risk 2: Runner CLI Version Drift (Medium)

Runner CLIs (`claude`, `codex`) change their command-line interfaces periodically. The TypeScript port may break when runner CLIs update.

- **Mitigation**: Pin runner CLI version expectations in documentation. Implement version detection in the runner abstraction and emit warnings when running untested versions. Add `--dry-run` flag to print the exact CLI command without executing it.

### Risk 3: Context Truncation Losing Critical Information (Medium)

Linear truncation of the first 40 lines may discard critical information that appears later in long artifacts (e.g., important caveats in the R artifact that affect the D stage).

- **Mitigation**: Implement truncation that preserves markdown heading structure (always include H1/H2) and code block fences. Consider a `--context-budget` flag to allow users to tune truncation per-stage.

### Risk 4: Validation False Positives Blocking Valid Artifacts (Medium)

The heuristic validator may reject valid artifacts that use different wording or structure than expected, causing unnecessary retry loops.

- **Mitigation**: Make validation warnings by default and errors only for critical issues (missing required sections, malformed markdown). Provide a `--force` flag to bypass validation for manual override.

### Risk 5: Missing Slice-Level Execution (Low for v1)

The AGENTS.md explicitly notes that slice-level auto-execution for W and I stages is not implemented. Agents using the TypeScript port for complex features with multiple slices will need to manually manage slice execution.

- **Mitigation**: Document this limitation clearly. Ensure the W stage prompt instructs the agent to output a complete WorkTree that the I stage agent can execute sequentially. Plan per-slice dispatch for v2.

### Risk 6: Instruction Budget Overflow (Low)

As prompts accumulate features over time, the instruction count may grow past the 8–13 target and approach the 150-instruction danger line.

- **Mitigation**: Add a `qrspi budget` command that counts instructions per stage prompt and warns if any stage exceeds 20 instructions. Enforce this in code review via a lint rule.

### Risk 7: Security — Runner Execution Authority (Low)

Claude Code and Codex runners execute arbitrary shell commands with the user's permissions. Malicious or accidental code could be executed during the I stage.

- **Mitigation**: Document the runner execution risks prominently. Consider adding a `--read-only` mode that dry-runs without executing commands. The default should require explicit `--allow-commands` flag in sensitive environments.
