# AGENTS.md — QRSPI Agent Project Guide

> This document is for AI Coding Agents. If you know nothing about this project, start here.

---

## Project Overview

**QRSPI Agent** is a structured programming agent workflow framework that implements a practical path from RPI (Research-Plan-Implement) to QRSPI/CRISPY.

**Core Goal**: Solve the failure mode where AI coding agents produce plans that sound reasonable but generate code that cannot integrate into complex codebases. Through an 8-stage workflow, instruction budget control, vertical slicing, and context management, the agent produces reliable, verifiable, and integrable code.

The project is currently in Beta (v1.0.0).

---

## Tech Stack

- **Language**: TypeScript / Node.js 20+
- **Build Tool**: TypeScript compiler (`tsc`)
- **Core Dependency**: `commander` (CLI framework) — the framework itself does not bind to any specific LLM
- **Dev Dependencies**: `vitest` (testing), `typescript` (type checking)
- **CLI Entry**: `qrspi` (`packages/qrspi/dist/cli/main.js`)
- **Language Support**: Bilingual prompts (English default, Chinese via `--lang zh` or system `LANG` e.g. `zh_CN.UTF-8`)
- **Runner Dependencies** (optional, install on demand):
  - `claude` CLI (Claude Code)
  - `codex` CLI (OpenAI Codex CLI)

---

## Build & Install

```bash
# Install dependencies
npm install

# Build TypeScript
cd packages/qrspi && npm run build

# Verify installation
node packages/qrspi/dist/cli/main.js --help
```

---

## Test Commands

```bash
# Run vitest
cd packages/qrspi && npm test

# Type checking
npm run lint

# Watch mode for continuous compilation
npm run dev
```

---

## Code Organization

```
qrspi-agent/
├── packages/
│   └── qrspi/                  # Core source package
│       ├── src/
│       │   ├── cli/              # CLI entry and command handling
│       │   ├── context/          # Context assembler (minimum context per stage)
│       │   ├── engine/           # Automation workflow engine
│       │   ├── parsers/          # Stage artifact structured parsers
│       │   ├── prompts/          # Prompt template system (instruction budget control)
│       │   ├── runner/           # CLI runners (claude / codex / mock)
│       │   ├── storage/          # File persistence and path resolution
│       │   ├── validators/       # Stage artifact heuristic validators
│       │   ├── workflow/         # Type definitions and stage schemas
│       │   └── index.ts          # Public API exports
│       ├── tests/                # Vitest test suites
│       ├── dist/                 # Compiled output
│       ├── package.json          # npm package config
│       ├── tsconfig.json         # TypeScript config
│       └── vitest.config.ts      # Test config
├── skills/qrspi-cli-workflow/  # Local skill that guides agents to use qrspi CLI first
├── docs/
│   └── README.zh.md            # Chinese guide
├── package.json                # Root workspace config
├── README.md                   # Human-facing user guide (Chinese)
└── AGENTS.md                   # This document
```

---

## Core Architecture Concepts

### 8-Stage Workflow

| Stage | Code | Name | Type | Human Approval Required |
|-------|------|------|------|------------------------|
| Q | `QUESTIONS` | Questions | Alignment | No |
| R | `RESEARCH` | Research | Alignment | No |
| D | `DESIGN` | Design Discussion | Alignment | **Yes** |
| S | `STRUCTURE` | Structure Outline | Alignment | **Yes** |
| P | `PLAN` | Plan | Alignment | No |
| W | `WORK_TREE` | Work Tree | Execution | No |
| I | `IMPLEMENT` | Implement | Execution | No |
| PR | `PULL_REQUEST` | Pull Request | Execution | **Yes** |

Stage definitions are in `packages/qrspi/src/workflow/stage-schema.ts`. Gate policies are hardcoded in the `isGateStage()` function in `packages/qrspi/src/engine/engine.ts`.

### Key Data Types

- `SessionConfig`: Workflow session configuration, defines `featureId`, `projectRoot`, `outputDir` (default `.qrspi`)
- `WorkflowState`: State machine that manages current stage, artifact storage/retrieval, and state persistence (`state.json`)
- `EngineState`: Engine runtime state, including approval records, attempt counts, and historical runs (`engine_state.json`)
- `StageArtifact`: Stage artifact, automatically saved as `artifacts/<STAGE>_<YYYY-MM-DD>.md`
- `SliceDefinition` / `WorkTree`: Vertical slice definitions and execution tracking
- `ContextPack` / `ContextBuilder`: Assemble minimum context based on stage dependencies
- `ParsedArtifact`: Structured parsing result of stage artifacts, saved to `structured/<STAGE>_<YYYY-MM-DD>.json`

### Context Management Principles

- Context window utilization target: **< 40%**
- Mandatory session switch threshold: **60%**
- Each stage only loads summaries of prerequisite artifacts, not full history
- Stage dependency relationships are defined in `STAGE_DEPENDENCIES` in `packages/qrspi/src/context/context-builder.ts`

### Prompt Template System

- Each stage has an independent prompt string (`packages/qrspi/src/prompts/template-registry.ts`)
- **Instruction budget**: 8-13 instructions per stage, far below the 150-instruction danger line
- **No magic words**: Default behavior is correct behavior
- Global registry: `createPromptRegistry()`
- **I (Implement) stage prompt** includes:
  - Mandatory self-review protocol (completeness, quality, discipline, testing)
  - Escalation protocol (`BLOCKED` / `NEEDS_CONTEXT`) for when the agent is stuck
  - Status report format: `DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`
  - Code organization principles (single responsibility per file, follow existing patterns)
- **W (WorkTree) stage prompt** includes `model_tier` per task (`low` / `standard` / `powerful`) to guide model selection based on complexity

### Runner System

- `ClaudeCodeRunner`: Invokes local `claude` CLI (`-p` mode)
- `CodexCliRunner`: Invokes local `codex exec --full-auto` CLI
- `MockRunner`: Generates placeholder output for local state machine validation
- Model resolution priority: CLI `--model` > `QRSPI_<RUNNER>_MODEL` env var > `QRSPI_MODEL` > runner default
- Default models: claude → `kimi-for-coding`, codex → `gpt-5.4`

---

## CLI Command Reference

```bash
qrspi init <feature_id> --root <dir>          # Initialize workflow
qrspi list --root <dir>                       # List all workflow features
qrspi stage --root <dir>                      # View current stage
qrspi prompt <Q/R/D/S/P/W/I/PR> --render     # Get/render stage prompt
qrspi advance --root <dir>                    # Manually advance to next stage
qrspi approve --root <dir>                    # Approve gate stage and continue
qrspi run --root <dir> --input "requirement"  # Auto-run until gate or finish
qrspi status --root <dir>                     # View full status
qrspi slice --add/--list --root <dir>         # Manage vertical slices
qrspi budget                                  # View instruction budget report
qrspi context --root <dir>                    # View current stage context strategy
qrspi run --lang zh --input "..."             # Use Chinese prompts (default: en)
```

---

## Development Conventions

### Language & Comments

- All project documentation, comments, CLI output, and JSDoc use **English**
- Code identifiers (class names, function names, variable names) use English
- Maintain English comment style when modifying code

### Code Style

- Use TypeScript strict mode (`strict: true`)
- Import order: standard library → third-party → local modules
- Use `.js` extension for local module imports (ESM requirement)
- Type definitions are centralized in `src/workflow/types.ts`

### Artifacts & State Files

The workflow creates a `.qrspi/<feature_id>/` directory in the target project at runtime:

```
.qrspi/<feature_id>/
├── state.json                  # Workflow state (current stage)
├── engine_state.json           # Engine state (approvals, history, errors)
├── artifacts/                  # Stage artifacts (*.md)
│   ├── Q_2026-04-22.md
│   ├── R_2026-04-22.md
│   └── ...
├── structured/                 # Structured parsing artifacts (*.json)
│   ├── Q_2026-04-22.json
│   └── ...
├── runs/                       # Full record of each run
│   └── <STAGE>_<timestamp>_attempt<N>/
│       ├── prompt.md
│       ├── context.json
│       ├── runner_stdout.txt
│       ├── runner_stderr.txt
│       ├── runner_meta.json
│       ├── validation.json
│       └── parsed_artifact.json
├── slices/                     # Vertical slice definitions
│   └── work_tree.json
└── sessions/                   # Session history (reserved)
```

**Note**: Agents should not manually modify state files under `.qrspi/`; use the `qrspi` CLI instead.

### Stage Advancement Rules

1. `qrspi run` auto-executes current stage → invokes runner → saves artifact → runs validator → parses structured data
2. If validation fails, state is marked `failed` and advancement stops
3. If the stage is a Gate (D/S/PR), state becomes `waiting_approval` until `qrspi approve`
4. Non-Gate stages with passed validation automatically advance to the next stage
5. `qrspi advance` only checks if artifact files exist (does not validate content); prefer `qrspi run`

---

## Testing Strategy

Tests cover the following areas:

1. **State Machine Tests**: `getNextStage()`, `isGateStage()`, `isValidStageCode()`
2. **Validator Tests**: Validation logic per stage for various inputs
3. **ContextBuilder Tests**: Stage dependency resolution logic
4. **Runner Tests**: MockRunner deterministic output, real runner command assembly
5. **Engine Tests**: Gate pause, approval resume, failure retry, state persistence
6. **Parser Tests**: Accuracy of parsing stage artifacts into structured data

---

## Security Notes

1. **Runner Execution Safety**:
   - `ClaudeCodeRunner` defaults to `--permission-mode bypassPermissions`; Claude Code may execute arbitrary shell commands
   - `CodexCliRunner` uses `--full-auto` mode, which also has full auto-execution capability
   - Review runner parameters when using in production or sensitive codebases

2. **Context Isolation**:
   - Ensure sensitive information (e.g., `.env`, key files) is not leaked into prompts during real LLM calls

3. **State Files**:
   - The `.qrspi/` directory contains workflow history, artifacts, and runner output, which may include sensitive code analysis
   - Add `.qrspi/` to `.gitignore`

4. **Minimal Dependencies**:
   - The framework has only one core dependency (`commander`), reducing supply chain attack surface
   - Actual runtime depends on external CLI tools (`claude`, `codex`); ensure these tools are from trusted sources

---

## Extension & Modification Guide

### Adding a New Stage

1. Add the new stage to `STAGE_ORDER` and stage definitions in `packages/qrspi/src/workflow/stage-schema.ts`
2. Add the corresponding prompt template in `packages/qrspi/src/prompts/template-registry.ts`
3. Add validation logic for the stage in `packages/qrspi/src/validators/stage-validator.ts`
4. Define whether human approval is required in `isGateStage()` in `packages/qrspi/src/engine/engine.ts`
5. Define prerequisites in `STAGE_DEPENDENCIES` in `packages/qrspi/src/context/context-builder.ts`
6. Add parsing logic for the stage in `packages/qrspi/src/parsers/artifact-parser.ts`

### Adding a New Runner

1. Create a new runner file under `packages/qrspi/src/runner/`, following the `BaseRunner` pattern
2. Register it in `buildRunner()` and `resolveRunnerName()` in `packages/qrspi/src/runner/index.ts`
3. Add relevant parameters in `packages/qrspi/src/cli/main.ts` if needed

### Improving the Validator

The validator uses heuristic checks based on markdown structure and regular expressions, plus JSON schema checks for structured stages:
- **I stage**: Checks for self-review, status report (`DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`), and files changed list
- **W stage**: Validates JSON structure and checks `model_tier` values (`low` / `standard` / `powerful`)
- For stricter validation: extend to also validate accompanying JSON structured output, and add a `structured_data` field to `ValidationResult`

---

## Known Limitations

1. Slice-level auto-execution for the `WorkTree` and `Implement` stages is not fully implemented — the `I` stage currently runs as a whole, without splitting into independent sessions per vertical slice. The prompt now includes self-review and escalation protocols, but per-slice subagent dispatch is not yet implemented.
2. ContextBuilder's summarization logic currently truncates the first 40 lines only; it does not perform true intelligent summarization.
3. The project has no CI/CD configuration.
4. `model_tier` is captured in the WorkTree but not yet consumed by the runner system for automatic model selection.
