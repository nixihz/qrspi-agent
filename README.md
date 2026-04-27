# QRSPI Agent — Structured Programming Agent Workflow

> **"We got AI programming all wrong."** — Dex Horthy

A practical implementation from RPI (Research-Plan-Implement) to QRSPI/CRISPY.

Original article: [From RPI to QRSPI: Rebuilding the First Structured Programming Agent Workflow](https://xiezhixin.com/2026-04-20-rpi-to-crispy/)

📖 [中文文档](./docs/README.zh.md)

---

## Why This Tool Is Needed

In 2025, engineers using programming agents all hit the same wall: prompt the agent, get code that looks reasonable, discover it can't integrate with the existing codebase, then spend more time fixing it than writing it by hand.

RPI solved part of the problem, but exposed three hidden failure modes at scale:

| Failure Mode | Symptom | QRSPI Solution |
|---------|------|----------------|
| **Instruction Budget** | Prompt bloats to 85+ instructions, model silently skips key steps | 8-13 instructions per stage, far below the 150-instruction danger line |
| **Magic Word Trap** | Specific phrases needed to trigger correct behavior | Default behavior is correct behavior, no secret handshakes required |
| **Plan-Reading Hallucination** | Plan reads reasonably, but technical assumptions are wrong | Validation goes deeper than "reads reasonably" |

---

## 8-Stage Workflow

```mermaid
flowchart LR
    subgraph Alignment [Alignment Phase]
        direction LR
        Q[Q    Questions]
        R[R    Research]
        D[D    Design]
        S[S    Structure]
        P[P    Plan]
    end

    subgraph Execution [Execution Phase]
        direction LR
        W[W    Work Tree]
        I[I    Implement]
        PR[PR  Pull Request]
    end

    Q --> R
    R --> D
    D -->|Human Approval| S
    S -->|Human Approval| P
    P --> W
    W --> I
    I --> PR
    PR -->|Human Approval| Done([Done])

```

### Alignment Phase — Get Full Alignment Before Writing a Single Line of Code

```
Q → R → D → S → P
```

| Stage | Name | Core Output | Human Involvement |
|------|------|---------|---------|
| **Q** | Questions | 5-15 specific technical questions | High — generated from feature ticket |
| **R** | Research | Technical map (code fact record) | Medium — review findings |
| **D** | Design Discussion | ~200-line markdown design doc | **Highest** — brain surgery stage |
| **S** | Structure Outline | Function signatures + type definitions + vertical slices | High — confirm interfaces |
| **P** | Plan | Tactical implementation document | Low — spot-check only |

### Execution Phase

```
Work Tree → I → PR
```

| Stage | Name | Core Output | Key Principle |
|------|------|---------|---------|
| **W** | Work Tree | Vertical slice task tree | Mock API → Frontend → Database |
| **I** | Implement | Working code | Each slice is an independent session |
| **PR** | Pull Request | Structured PR description | Human must read and own the code |

### Execution Status Semantics

`I` stage now distinguishes between formatting success and execution success:

- `DONE`: implementation completed and verified
- `DONE_WITH_CONCERNS`: implementation completed, but the agent still has correctness concerns
- `BLOCKED`: implementation cannot continue without resolving a concrete blocker
- `NEEDS_CONTEXT`: implementation cannot continue because required information was not provided

Only `DONE` and `DONE_WITH_CONCERNS` count as a successful `I` stage. If `I` reports `BLOCKED` or `NEEDS_CONTEXT`, the workflow stays on `I` and must not advance to `PR`.

`PR` also has a hard precondition: it can run only after a successful `I` stage.

---

## Quick Start

### Installation

```bash
# Install the CLI
npm install -g qrspi-agent
qrspi --help
```

Optional: install the local skill for agents that support `skills add`.

```bash
npx skills add https://github.com/nixihz/qrspi-agent.git --skill qrspi-cli-workflow
```

### Built-in Skill

This repository includes a local skill:

- `skills/qrspi-cli-workflow`

It guides agents to prefer the `qrspi` CLI over manually simulating the workflow (init, status, prompts, gates, slices, `run`, etc.).

Installing the skill does not install the `qrspi` CLI. If `qrspi` is not on your `PATH`, install the npm package first or use `npx qrspi-agent`.

### 1. Initialize Workflow

```bash
cd your-project
qrspi init user-authentication --root .
```

Example output:
```
[QRSPI] Initialized workflow: user-authentication
[QRSPI] Current stage: Questions
```

If a project has more than one workflow under `.qrspi/`, feature-scoped
commands require an explicit feature id:

```bash
qrspi status --feature user-authentication
qrspi stage --feature user-authentication
qrspi run --feature user-authentication --runner mock --max-stages 1
```

### 2. Get Stage Prompt

```bash
# View Q stage instructions and validation criteria
qrspi prompt render Q --feature user-authentication

# Render full prompt (ready to use with Claude Code / Codex CLI)
qrspi prompt render Q --feature user-authentication --input "Add user authentication with email+password and OAuth"

# Export base prompt templates for review, without workflow context or user input
qrspi prompt export --out qrspi-prompts.md
qrspi prompt export Q --out Q_prompt.md
qrspi prompt export --split --out qrspi-prompts/
```

### 3. Save Artifact and Advance

Save the agent's output to `.qrspi/<feature>/artifacts/Q_<date>.md`, then:

```bash
qrspi advance
```

Use this manual path only when you are writing or pasting the stage artifact yourself.
For gate stages (`D`, `S`, `PR`), do not use `advance` as the normal path. Review the artifact first, then use `qrspi approve` or `qrspi reject`.

### 3b. Auto-Execute Until Human Gate

If you have Claude Code or Codex CLI configured, you can let the workflow auto-advance:

```bash
# Use real Claude Code, starting from current stage
# Default model: kimi-for-coding
qrspi run --input "Add user authentication with email+password and OAuth"

# Use Codex CLI, starting from current stage
# Default model: gpt-5.4
qrspi run --runner codex --input "Add user authentication with email+password and OAuth"

# Long-running real runner tasks have no default timeout.
# Inspect live output in the current run directory:
# .qrspi/<feature_id>/runs/<STAGE>_<timestamp>_attempt<N>/live_stdout.txt
# .qrspi/<feature_id>/runs/<STAGE>_<timestamp>_attempt<N>/live_stderr.txt

# Or explicitly specify model
qrspi run --input "Add user authentication" --model kimi-for-coding

# Use mock runner for local state-machine validation
qrspi run --runner mock --input "Add user authentication"

# Continue after D / S / PR stage confirmation
qrspi approve

# Reject the current gate and regenerate it
qrspi reject --comment "Design misses the migration path"

# Rewind to an earlier stage when upstream assumptions changed
qrspi rewind R --reason "Need to re-check existing auth middleware"
```

### 3c. Human Gate Review Playbook

`qrspi run` stops automatically at the three human gates: `D`, `S`, and `PR`.
At that point the workflow status becomes `waiting_approval`, which means the stage artifact already passed validation and now needs a human decision.

What the human should review:

- Open `.qrspi/<feature_id>/artifacts/<STAGE>_<YYYY-MM-DD>.md`
- Treat that generated design / structure / PR artifact as the review document for the current stage
- If needed, inspect `.qrspi/<feature_id>/runs/<STAGE>_<timestamp>_attempt<N>/` for `prompt.md`, `validation.json`, `parsed_artifact.json`, `live_stdout.txt`, and `live_stderr.txt`

What can be edited manually:

- You may edit the stage artifact markdown under `artifacts/` if you want the approved version to include human corrections or final wording
- Do not manually edit `.qrspi/<feature_id>/state.json` or `engine_state.json`
- Do not move stages forward by modifying files under `.qrspi/`; use CLI commands for state transitions

How to choose the next command after `run`:

| Situation after `qrspi run` | Meaning | Next command |
|------|------|------|
| Gate artifact looks good | Accept the current stage output and move forward | `qrspi approve` |
| Gate artifact needs another try, but upstream assumptions are still fine | Regenerate the same gate stage | `qrspi reject --comment "what to fix"` then `qrspi run` |
| The problem started earlier than the current gate | Move back to an earlier stage and regenerate from there | `qrspi rewind <Q/R/D/S/P/W/I> --reason "why"` then `qrspi run` |
| `I` stage reports `BLOCKED` or `NEEDS_CONTEXT` | Implementation could not finish; inspect the artifact and provide missing context or rewind | `qrspi status`, inspect `.qrspi/.../artifacts/I_<date>.md`, then `qrspi run` or `qrspi rewind ...` |

Common gate examples:

```bash
# D stage looks correct, continue to S
qrspi approve D

# S stage structure is missing an API boundary, regenerate S
qrspi reject S --comment "Missing service interface for auth provider"
qrspi run

# PR is wrong because the design itself drifted; rewind to D
qrspi rewind D --reason "Need to redesign token refresh flow"
qrspi run
```

### 4. List Workflows

```bash
qrspi list
```

Output:
```
============================================================
QRSPI Workflows
============================================================
  ✓ auth: PR (completed)
  ⏸ login-ui: D (waiting_approval)
  ! huawei-co-package: I (needs_context)
  ○ payment: Q (ready)
============================================================
```

### 5. Check Status

```bash
qrspi status

# When multiple workflows exist
qrspi status --feature user-authentication
```

Example output:
```
[QRSPI] Workflow: Questions (Feature: user-authentication)

============================================================
QRSPI Workflow Status
============================================================
>>>   Q: Questions [Alignment]
      R: Research [Alignment]
      D: Design Discussion [Alignment]
      S: Structure Outline [Alignment]
      P: Plan [Alignment]
      W: Work Tree [Execution]
      I: Implement [Execution]
      PR: Pull Request [Execution]
============================================================
[QRSPI] Workflow: Questions (Feature: user-authentication)

Engine Status: ready
Runner: claude
Model: kimi-for-coding
```

---

## Core Principles in Practice

### 1. Context Window Management (40% Rule)

```bash
# View current context strategy
qrspi context

# View instruction budget report
qrspi budget
```

**Rules:**
- Keep context utilization **below 40%**
- Force session switch at **60%**
- Progress is persisted to disk; new sessions load the complete prerequisite artifacts for the current stage

### 2. Vertical Slices (Better Than Horizontal Layers)

```bash
# Add vertical slices
qrspi slice add "mock-api" --desc "Create Mock API endpoints" --order 1 --checkpoint "curl test passes"
qrspi slice add "frontend-ui" --desc "Implement login UI" --order 2 --checkpoint "Page is interactive"
qrspi slice add "database" --desc "Add user table and migration" --order 3 --checkpoint "Unit tests pass"

# List slices
qrspi slice list
```

**Why vertical slices are better:**
- Each slice has a testable checkpoint
- Avoid deferring all integration to the end
- Each slice can be a fresh session with clean context

### 3. Automated Closed Loop

The current version already supports a basic automation chain:

- `qrspi run`: auto-execute current stage
- Stage outputs are automatically persisted to `artifacts/`
- Stage results are automatically validated by the validator
- Artifacts are automatically parsed into structured data saved to `structured/`
- `D`, `S`, `PR` stages automatically pause for human confirmation
- Human reviewers should read `artifacts/<STAGE>_<date>.md`; they may edit that markdown, but should not edit `state.json` or `engine_state.json`
- `qrspi approve`: advance to next stage after human confirmation
- `qrspi reject`: mark the current gate stage ready to regenerate
- `qrspi rewind <stage>`: move a workflow back to an earlier stage
- `--feature <id>`: select the workflow explicitly when a project has multiple `.qrspi/<feature>/` sessions

### 4. Runner and Model Configuration

Three runners are currently supported:

- `claude`
- `codex`
- `mock`

Model selection supports three levels of priority:

1. Command-line argument `--model`
2. Environment variable `QRSPI_<RUNNER>_MODEL` or `QRSPI_MODEL`
3. Runner default

Default models:

- `claude` -> `kimi-for-coding`
- `codex` -> `gpt-5.4`

### Language Configuration

QRSPI supports bilingual prompt rendering (English and Chinese). Default is English.

```bash
# Use Chinese prompts
qrspi run --input "Add user authentication" --lang zh

# Or rely on system LANG for prompt rendering (e.g. zh_CN.UTF-8 -> Chinese, en_US.UTF-8 -> English)
export LANG=zh_CN.UTF-8
qrspi run --input "Add user authentication"
```

Example:

```bash
export QRSPI_RUNNER=codex
export QRSPI_CODEX_MODEL=gpt-5.4-mini
qrspi status
```

---

## Stage Prompt Templates

Each stage's prompt design follows the **instruction budget principle** (8-13 instructions):

### Q - Questions

**Instructions (7):**
1. Analyze the given feature ticket or requirement description
2. Identify all technical information needed to implement the feature
3. Produce 5-15 specific, researchable technical questions
4. Each question must point to a specific aspect of the codebase
5. Questions must be specific enough to answer via code search
6. Do not include any implementation suggestions or solutions
7. Sort by dependency: infrastructure questions first, dependent questions later

**Validation Criteria:**
- Question count is between 5-15
- Each question has a clear search direction
- No implementation suggestions mixed in
- No more than 3 blocking questions

### R - Research

**Key Design:** Hide original feature ticket, collect only facts

**Instructions:**
- Research the codebase based on the technical question list
- Produce an objective technical map (not a plan, not suggestions)
- Reference specific file paths, function names, and code snippets
- Do not form opinions on "how to modify"

### D - Design Discussion

**This is the highest-leverage stage in the entire flow.**

Output ~200 lines of markdown covering:
- Current state
- Desired end state
- Design decisions (at least 2 alternatives each)
- Architecture constraints
- Risks and mitigations

### S - Structure Outline

Analogous to C header files:
- Function signatures (no implementation)
- Type definitions
- Vertical slice divisions
- Dependency graph

### P - Plan

A plan constrained by Design and Structure:
- File-level change checklist
- Risk level for each change
- Executable test strategy
- Rollback checkpoints

---

## Project Structure

```
qrspi-agent/
├── packages/
│   └── qrspi/                  # Node.js/TypeScript core package
│       ├── src/
│       │   ├── cli/              # CLI entrypoint and command handling
│       │   ├── context/          # Context assembler (build minimal context per stage)
│       │   ├── engine/           # Automated workflow engine
│       │   ├── parsers/          # Stage artifact structured parser
│       │   ├── prompts/          # Prompt template system (instruction budget control)
│       │   ├── runner/           # CLI runner (claude / codex / mock)
│       │   ├── storage/          # File persistence and path resolution
│       │   ├── validators/       # Stage artifact heuristic validator
│       │   ├── workflow/         # Type definitions and stage schemes
│       │   └── index.ts          # Public API exports
│       ├── tests/                # Vitest test suite
│       ├── dist/                 # TypeScript compilation output
│       ├── package.json          # npm package config
│       ├── tsconfig.json         # TypeScript config
│       └── vitest.config.ts      # Test config
├── skills/
│   └── qrspi-cli-workflow/     # Local skill guiding agents to prefer qrspi CLI
├── docs/
│   └── README.zh.md            # Chinese guide
├── package.json                # Root workspace config
├── README.md                   # Human-facing user documentation
└── AGENTS.md                   # AI Coding Agent project guide
```

---

## Three Core Insights

### Insight One: Keep Context Window Utilization Below 40%

> At 60%, start a new session. This is independent of how large the context window is.

**Practice:** Save progress after each vertical slice, start a new session that loads the complete prerequisite artifacts needed for the current stage.

### Insight Two: Vertical Slices Beat Horizontal Layers

> Mock API → Frontend → Database, with a checkpoint after each slice.

**Practice:** Instead of "finish all database work first, then all API work", each slice has an end-to-end testable path.

### Insight Three: Sub-Agents as Context Firewalls

> Expensive models for orchestration and decision-making. Cheaper, faster models for scoped subtasks.

**Practice:** Orchestrator stays lean, sub-agents isolate context, coordinate through filesystem artifacts.

---

## Evolution Signals from RPI to QRSPI

> The differentiator in AI-assisted development is shifting from which model you use to how you configure and constrain the agent.

Variables that determine whether an agent produces reliable output or code that looks reasonable but silently breaks:

- Context management
- Instruction budget
- Sub-agent architecture
- Deterministic hooks
- Validation pipeline

**The model is the engine. The harness is what makes it work.**

---

## Acknowledgments

Inspired by:

- **[obra/superpowers](https://github.com/obra/superpowers)** — Subagent-driven development skill and the "Do Not Trust the Report" review philosophy
- **[humanlayer](https://github.com/humanlayer)** — Human-in-the-loop orchestration for AI agents

## License

MIT
