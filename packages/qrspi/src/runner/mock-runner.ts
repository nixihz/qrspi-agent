import type { Runner, RunnerExecInput, RunnerExecResult } from "../workflow/types.js";
import { resolveRunnerModel } from "./model-resolver.js";

const MOCK_TEMPLATES: Record<string, string> = {
  Q: `# Technical Questions

## Feature Overview
Implement the Node.js/TypeScript version of the qrspi CLI tool.

## Question List

### Q1: Current disk protocol structure
- **Goal**: Clarify the complete file layout of the .qrspi directory
- **Search direction**: qrspi/workflow.py, qrspi/engine.py
- **Blocking**: blocking

### Q2: Stage order and gate strategy
- **Goal**: Confirm the 8-stage order and human approval stages
- **Search direction**: qrspi/workflow.py Stage enum
- **Blocking**: blocking

### Q3: Runner protocol
- **Goal**: Understand how claude/codex/mock runners are invoked
- **Search direction**: qrspi/runner.py
- **Blocking**: blocking

### Q4: ContextBuilder summary strategy
- **Goal**: Understand context truncation rules
- **Search direction**: qrspi/context.py
- **Blocking**: nice-to-have

### Q5: Prompt template structure
- **Goal**: Understand the prompt template format for each stage
- **Search direction**: qrspi/prompts/
- **Blocking**: nice-to-have

## Assumptions
- .qrspi directory protocol remains compatible
- Stage order Q->R->D->S->P->W->I->PR unchanged
- Gate stages are D/S/PR

## Risks
- Disk protocol incompatibility is the highest risk`,

  R: `# Research Report

## Feature Overview
Technical survey of the qrspi CLI Node.js version.

## Codebase Technical Map

### Entrypoints
- \`qrspi.cli:main\` - argparse-driven CLI entry
- Commands: init, stage, prompt, advance, status, slice, budget, context, run, approve, version

### State Machine
- \`qrspi/workflow.py::Stage\` - 8-stage enum
- Stage order: Q->R->D->S->P->W->I->PR
- Gate stages: D, S, PR

### Disk Protocol
- \`.qrspi/<feature_id>/state.json\` - current stage
- \`.qrspi/<feature_id>/engine_state.json\` - engine state
- \`.qrspi/<feature_id>/artifacts/<STAGE>_<YYYY-MM-DD>.md\` - artifacts
- \`.qrspi/<feature_id>/runs/<STAGE>_<TS>_attempt<N>/\` - run records

### Runner Layer
- BaseRunner abstraction
- ClaudeCodeRunner: \`claude -p --permission-mode bypassPermissions\`
- CodexCliRunner: \`codex exec --full-auto --output-last-message\`
- MockRunner: deterministic output

## Dependencies
CLI -> Engine -> Workflow -> Repository -> Filesystem
CLI -> Engine -> Runner`,

  D: `# Design Discussion

## 1. Current State
The Python version of qrspi CLI already implements the full 8-stage workflow.

## 2. Target State
TypeScript Node.js version, maintaining equivalent disk protocol and CLI behavior.

## 3. Design Decisions

### Decision 1: Compatibility Target
- **Recommended**: Core behavior equivalence + fully compatible disk protocol
- **Needs confirmation**: Team accepts command compatibility, text details may be fine-tuned

### Decision 2: Stage Metadata
- **Recommended**: Unified into stage-schema.ts
- **Needs confirmation**: Allow internal single source of truth

### Decision 3: Disk Protocol
- **Recommended**: Fully compatible with existing .qrspi directory structure
- **Needs confirmation**: Python-generated states can be continued by TS

## 4. Architecture Constraints
- 8-stage order unchanged
- Gate stages D/S/PR unchanged
- .qrspi directory is a cross-language stable protocol

## 5. Risks and Mitigations
- CLI compatibility tests cover key commands`,

  S: `# Structure Outline

## Type Definitions
\`\`\`typescript
type StageCode = "Q" | "R" | "D" | "S" | "P" | "W" | "I" | "PR";
interface StageDefinition { code: StageCode; name: string; gateRequired: boolean; }
interface WorkflowState { featureId: string; currentStage: StageCode; status: SessionStatus; }
interface EngineState { approvals: ApprovalRecord[]; stage_attempts: Record<string, number>; history: EngineRunRecord[]; }
\`\`\`

## Function Signatures
\`\`\`typescript
function createStageDefinitions(): Record<StageCode, StageDefinition>;
function buildRunner(name: RunnerName, options?: RunnerOptions): Runner;
function runSingleStage(...): Promise<{ workflowState; engineState; validation }>;
function main(argv?: string[]): Promise<number>;
\`\`\`

## Vertical Slices
1. Runner protocol adaptation (Mock API)
2. CLI command surface and presentation layer
3. File state repository
4. State machine and engine orchestration`,

  P: `# Implementation Plan

## Slice 1: Runner Protocol Adaptation
| File | Action |
|------|------|
| src/runner/types.ts | create |
| src/runner/mock-runner.ts | create |
| src/runner/model-resolver.ts | create |

## Slice 2: CLI Command Surface
| File | Action |
|------|------|
| src/cli/main.ts | create |
| src/cli/commands/*.ts | create |

## Slice 3: File Repository
| File | Action |
|------|------|
| src/storage/file-repository.ts | create |
| src/storage/path-resolver.ts | create |

## Slice 4: State Machine and Engine
| File | Action |
|------|------|
| src/engine/engine.ts | create |
| src/workflow/stage-schema.ts | create |

## Timeline
- Slice 1: 0.5 day
- Slice 2-4: 4 days`,

  W: `{
  "slices": [
    {
      "name": "Runner Protocol Adaptation (Mock API)",
      "description": "Establish TypeScript minimal runner abstraction and mock execution results",
      "order": 1,
      "tasks": [
        {"id": "s1-t1", "description": "Define runner domain types", "estimated_minutes": 15, "context_budget": "low", "dependencies": []},
        {"id": "s1-t2", "description": "Implement model resolution logic", "estimated_minutes": 15, "context_budget": "low", "dependencies": ["s1-t1"]},
        {"id": "s1-t3", "description": "Implement MockRunner", "estimated_minutes": 20, "context_budget": "medium", "dependencies": ["s1-t1", "s1-t2"]}
      ],
      "checkpoint": "Mock runner output is stable, model resolution priority is correct"
    },
    {
      "name": "CLI Command Surface",
      "description": "Replicate Python version external command surface",
      "order": 2,
      "tasks": [
        {"id": "s2-t1", "description": "Implement main.ts CLI entry", "estimated_minutes": 30, "context_budget": "medium", "dependencies": []},
        {"id": "s2-t2", "description": "Implement all command handlers", "estimated_minutes": 60, "context_budget": "medium", "dependencies": ["s2-t1"]}
      ],
      "checkpoint": "CLI can stably parse all target commands"
    },
    {
      "name": "File State Repository",
      "description": "Python-compatible .qrspi disk protocol",
      "order": 3,
      "tasks": [
        {"id": "s3-t1", "description": "Implement path resolution", "estimated_minutes": 15, "context_budget": "low", "dependencies": []},
        {"id": "s3-t2", "description": "Implement state read/write", "estimated_minutes": 30, "context_budget": "medium", "dependencies": ["s3-t1"]}
      ],
      "checkpoint": "Disk protocol is compatible with Python version directory structure"
    },
    {
      "name": "State Machine and Engine",
      "description": "8-stage state machine and complete workflow engine",
      "order": 4,
      "tasks": [
        {"id": "s4-t1", "description": "Implement WorkflowEngine", "estimated_minutes": 60, "context_budget": "high", "dependencies": ["s3-t2"]},
        {"id": "s4-t2", "description": "Implement approve and advance", "estimated_minutes": 30, "context_budget": "medium", "dependencies": ["s4-t1"]}
      ],
      "checkpoint": "Can complete single-stage to multi-stage workflow execution"
    }
  ]
}`,

  I: `# Implementation Report

## Completion Status
All 4 vertical slices have been implemented.

## Slice 1: Runner Protocol Adaptation
- MockRunner implemented, fixed input produces stable output
- Model resolution priority: CLI > QRSPI_<RUNNER>_MODEL > QRSPI_MODEL > default
- BaseRunner interface defined

## Slice 2: CLI Command Surface
- Commander.js scaffolded, 11 command handlers
- Parameters compatible with Python version
- English output

## Slice 3: File State Repository
- Disk protocol compatible with Python version
- state.json, engine_state.json read/write
- artifacts, runs, slices directory management

## Slice 4: State Machine and Engine
- 8-stage StageDefinition
- Gate strategy (D/S/PR)
- Complete WorkflowEngine closed loop`,

  PR: `# Pull Request Review

## Change Summary
Added TypeScript version of qrspi CLI under packages/qrspi/.

## Code Review Checklist
- [ ] Disk protocol compatibility tests pass
- [ ] All 11 commands callable normally
- [ ] Mock runner stable output
- [ ] Gate stages correctly pause

## Test Coverage
- Unit tests: runner, validator, storage
- e2e: mock-run complete closed loop

## Release Criteria
1. TypeScript compilation has no errors
2. All tests pass
3. Parallel validation with Python version`,
};

export class MockRunner implements Runner {
  readonly name = "mock" as const;

  async run(input: RunnerExecInput): Promise<RunnerExecResult> {
    const model = resolveRunnerModel("mock", input.options.model);
    const template = MOCK_TEMPLATES[input.stage] ?? `# Mock output for stage ${input.stage}\n\nPlaceholder content.`;
    const start = Date.now();

    return {
      stdout: template,
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - start,
      meta: {
        runner: "mock",
        model,
        stage: input.stage,
      },
    };
  }
}
