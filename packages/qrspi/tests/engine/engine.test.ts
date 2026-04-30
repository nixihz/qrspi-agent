import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SessionConfig, Runner, RunnerExecInput } from "../../src/workflow/types.js";
import {
  initWorkflow,
  runSingleStage,
  runWorkflow,
  resumeSliceExecution,
  approveCurrentStage,
  rejectCurrentStage,
  rewindWorkflowStage,
  advanceWorkflowStage,
} from "../../src/engine/engine.js";
import {
  readSliceExecutionState,
  writeSliceExecutionState,
  writeWorkflowState,
  writeEngineState,
  writeArtifact,
  writeWorkTree,
  createRunDir,
  writeRunFile,
} from "../../src/storage/file-repository.js";

function createTempConfig(featureId = "test-feature"): SessionConfig {
  const tmpDir = mkdtempSync(join(tmpdir(), "qrspi-engine-test-"));
  return {
    featureId,
    projectRoot: tmpDir,
    outputDir: ".qrspi",
  };
}

class TestRunner implements Runner {
  name = "mock" as const;
  private output: string | ((input: RunnerExecInput, call: number) => string);
  calls = 0;
  inputs: RunnerExecInput[] = [];

  constructor(output: string | ((input: RunnerExecInput, call: number) => string)) {
    this.output = output;
  }

  async run(input: RunnerExecInput) {
    this.calls++;
    this.inputs.push(input);
    const stdout = typeof this.output === "function"
      ? this.output(input, this.calls)
      : this.output;
    return {
      stdout,
      stderr: "",
      exitCode: 0,
      durationMs: 100,
      meta: { runner: "mock", model: input.options.model },
    };
  }
}

describe("engine", () => {
  let config: SessionConfig;

  beforeEach(() => {
    config = createTempConfig();
  });

  afterEach(() => {
    rmSync(config.projectRoot, { recursive: true, force: true });
  });

  it("initWorkflow initializes a new session", async () => {
    const { workflowState, engineState } = await initWorkflow(config);
    expect(workflowState.currentStage).toBe("Q");
    expect(workflowState.status).toBe("idle");
    expect(engineState.currentStage).toBe("Q");
    expect(engineState.status).toBe("ready");
  });

  it("initWorkflow returns existing state on re-init", async () => {
    await initWorkflow(config);
    const { workflowState } = await initWorkflow(config);
    expect(workflowState.currentStage).toBe("Q");
  });

  it("runSingleStage executes and passes validation", async () => {
    await initWorkflow(config);
    const runner = new TestRunner("### Q1: What?\n### Q2: How?\n### Q3: Why?\n### Q4: When?\n### Q5: Where?\n\n".repeat(3));
    const { workflowState, engineState } = await initWorkflow(config);

    const result = await runSingleStage(config, workflowState, engineState, runner);
    expect(result.validation.valid).toBe(true);
    expect(result.engineState.history).toHaveLength(1);
    expect(result.engineState.history[0].success).toBe(true);
    expect(result.artifact).toBeDefined();
  });

  it("runSingleStage writes workflow input provenance to prompt and context", async () => {
    await initWorkflow(config);
    const runner = new TestRunner("### Q1: What?\n### Q2: How?\n### Q3: Why?\n### Q4: When?\n### Q5: Where?\n\n".repeat(3));
    const { workflowState, engineState } = await initWorkflow(config);

    const result = await runSingleStage(
      config,
      workflowState,
      engineState,
      runner,
      "Add login from a file",
      "en",
      {},
      {
        input_source: "file",
        source_file: "requirements.md",
        file_kind: "markdown",
      },
    );
    const runsDir = join(config.projectRoot, ".qrspi", config.featureId, "runs");
    const [runDirName] = readdirSync(runsDir).sort();
    const prompt = readFileSync(join(runsDir, runDirName!, "prompt.md"), "utf-8");
    const context = JSON.parse(
      readFileSync(join(runsDir, runDirName!, "context.json"), "utf-8"),
    ) as { workflow_input?: { input_source: string; source_file: string; file_kind: string } };

    expect(result.validation.valid).toBe(true);
    expect(prompt).toContain("Input source: requirements.md");
    expect(prompt).toContain("Add login from a file");
    expect(context.workflow_input).toEqual({
      input_source: "file",
      source_file: "requirements.md",
      file_kind: "markdown",
    });
  });

  it("runSingleStage fails validation", async () => {
    await initWorkflow(config);
    const runner = new TestRunner("short");
    const { workflowState, engineState } = await initWorkflow(config);

    const result = await runSingleStage(config, workflowState, engineState, runner);
    expect(result.validation.valid).toBe(false);
    expect(result.engineState.status).toBe("failed");
  });

  it("runSingleStage keeps I stage in needs_context when implementation reports missing context", async () => {
    await initWorkflow(config);

    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "ready" as const,
      approvals: [],
      stage_attempts: { W: 1 },
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const runner = new TestRunner(`
# 实现报告

**状态：** NEEDS_CONTEXT

## 切片 1: 跨服务媒体契约
### 实现内容
未修改代码，先确认阻塞点。

### 验证结果
- 搜索现有媒体枚举，确认 1-9 已占用

### 遗留问题
- 需要确认新的 MediaId 数值

## 自检
- 完整性：缺上下文，未继续改动
- 质量：避免了猜测性实现
`);

    const result = await runSingleStage(config, wf, eng, runner);
    expect(result.validation.valid).toBe(true);
    expect(result.workflowState.currentStage).toBe("I");
    expect(result.workflowState.status).toBe("needs_context");
    expect(result.engineState.status).toBe("needs_context");
    expect(result.engineState.history[0].success).toBe(false);
    expect(result.artifact).toBeDefined();
  });

  it("runSingleStage executes I stage work tree slices as separate runner sessions", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const workTree = {
      slices: [
        {
          name: "core-state",
          description: "Persist slice execution state",
          order: 1,
          checkpoint: "state file is written",
          tasks: [
            { id: "s1-t1", description: "state", estimated_minutes: 10, context_budget: "low", dependencies: [], model_tier: "low" as const },
          ],
        },
        {
          name: "model-routing",
          description: "Resolve model tiers",
          order: 2,
          checkpoint: "tier model is recorded",
          tasks: [
            { id: "s2-t1", description: "routing", estimated_minutes: 20, context_budget: "medium", dependencies: ["s1-t1"], model_tier: "powerful" as const },
          ],
        },
      ],
    };
    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "ready" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: {},
      history: [],
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, {
      stage: "W",
      title: "W",
      content: JSON.stringify(workTree),
      generatedAt: now,
      artifactPath: "",
    });
    await writeWorkTree(config, workTree);

    const runner = new TestRunner((_input, call) => `
# Implementation Report

**Status:** DONE

## Slice ${call}: completed
### Implementation Content
- Implemented slice ${call}

### Verification Result
- Verified slice ${call}

## Files Changed
- packages/qrspi/src/engine/engine.ts

## Self-Review
- Completeness: slice ${call} completed
`);

    const result = await runSingleStage(config, wf, eng, runner, undefined, "en");
    const sliceState = await readSliceExecutionState(config);
    const runDirs = readdirSync(join(config.projectRoot, ".qrspi", config.featureId, "runs")).sort();

    expect(result.validation.valid).toBe(true);
    expect(result.artifact?.stage).toBe("I");
    expect(result.engineState.history.at(-1)?.stage).toBe("I");
    expect(result.engineState.history.at(-1)?.success).toBe(true);
    expect(runner.calls).toBe(2);
    expect(runner.inputs.map((input) => input.options.model)).toHaveLength(2);
    expect(sliceState?.slices.map((slice) => slice.status)).toEqual(["completed", "completed"]);
    expect(sliceState?.slices.map((slice) => slice.model_tier)).toEqual(["low", "powerful"]);
    expect(runDirs.some((dir) => dir.startsWith("I_slice1_core-state_"))).toBe(true);
    expect(runDirs.some((dir) => dir.startsWith("I_slice2_model-routing_"))).toBe(true);
  });

  it("preserves completed slice outputs when resuming I stage slice execution", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const workTree = {
      slices: [
        {
          name: "already-done",
          description: "Completed in a previous run",
          order: 1,
          checkpoint: "previous output is preserved",
          tasks: [
            { id: "s1-t1", description: "state", estimated_minutes: 10, context_budget: "low", dependencies: [], model_tier: "low" as const },
          ],
        },
        {
          name: "remaining",
          description: "Runs after resume",
          order: 2,
          checkpoint: "new output is added",
          tasks: [
            { id: "s2-t1", description: "resume", estimated_minutes: 10, context_budget: "low", dependencies: ["s1-t1"], model_tier: "standard" as const },
          ],
        },
      ],
    };
    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "ready" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: {},
      history: [],
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, {
      stage: "W",
      title: "W",
      content: JSON.stringify(workTree),
      generatedAt: now,
      artifactPath: "",
    });
    await writeWorkTree(config, workTree);
    const previousRunDir = await createRunDir(config, "I_slice1_already-done_20260429_120000_attempt1");
    await writeRunFile(previousRunDir, "runner_stdout.txt", `
# Implementation Report

**Status:** DONE

## Implementation Content
- Previous completed output

## Verification Result
- Previous verification

## Files Changed
- previous.ts

## Self-Review
- Completeness: previous slice completed
`);
    await writeSliceExecutionState(config, {
      featureId: config.featureId,
      current_slice_order: 1,
      slices: [
        {
          slice_name: "already-done",
          slice_order: 1,
          status: "completed",
          attempts: 1,
          model_tier: "low",
          runner: "mock",
          model: "gpt-5.4",
          run_dir: previousRunDir,
          started_at: now,
          finished_at: now,
          reported_status: "DONE",
          validation: {
            stage: "I",
            valid: true,
            issues: [],
            summary: "Implementation report is complete",
          },
        },
        {
          slice_name: "remaining",
          slice_order: 2,
          status: "pending",
          attempts: 0,
          model_tier: "standard",
        },
      ],
      updatedAt: now,
    });

    const runner = new TestRunner(`
# Implementation Report

**Status:** DONE

## Implementation Content
- New completed output

## Verification Result
- New verification

## Files Changed
- new.ts

## Self-Review
- Completeness: remaining slice completed
`);

    const result = await runSingleStage(config, wf, eng, runner, undefined, "en");
    const aggregateContent = readFileSync(result.artifact!.artifactPath, "utf-8");

    expect(result.validation.valid).toBe(true);
    expect(runner.calls).toBe(1);
    expect(aggregateContent).toContain("Previous completed output");
    expect(aggregateContent).toContain("New completed output");
  });

  it("resumeSliceExecution reruns from a reset pending slice and skips completed slices", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const workTree = {
      slices: [
        {
          name: "already-done",
          description: "Completed in a previous run",
          order: 1,
          checkpoint: "already done",
          tasks: [
            { id: "s1-t1", description: "done", estimated_minutes: 10, context_budget: "low", dependencies: [], model_tier: "low" as const },
          ],
        },
        {
          name: "retry-target",
          description: "Reset slice",
          order: 2,
          checkpoint: "retry completes",
          tasks: [
            { id: "s2-t1", description: "retry", estimated_minutes: 10, context_budget: "low", dependencies: [], model_tier: "standard" as const },
          ],
        },
      ],
    };
    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "failed" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: { I: 1 },
      history: [],
      lastError: "previous slice failed",
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, {
      stage: "W",
      title: "W",
      content: JSON.stringify(workTree),
      generatedAt: now,
      artifactPath: "",
    });
    await writeWorkTree(config, workTree);
    const previousRunDir = await createRunDir(config, "I_slice1_already-done_20260429_120000_attempt1");
    await writeRunFile(previousRunDir, "runner_stdout.txt", `
# Implementation Report

**Status:** DONE

## Implementation Content
- Previous completed output

## Verification Result
- Previous verification

## Files Changed
- previous.ts

## Self-Review
- Completeness: previous slice completed
`);
    await writeSliceExecutionState(config, {
      featureId: config.featureId,
      current_slice_order: 2,
      slices: [
        {
          slice_name: "already-done",
          slice_order: 1,
          status: "completed",
          attempts: 1,
          model_tier: "low",
          runner: "mock",
          model: "gpt-5.4",
          run_dir: previousRunDir,
          started_at: now,
          finished_at: now,
          reported_status: "DONE",
        },
        {
          slice_name: "retry-target",
          slice_order: 2,
          status: "pending",
          attempts: 1,
          model_tier: "standard",
        },
      ],
      updatedAt: now,
    });

    const runner = new TestRunner(`
# Implementation Report

**Status:** DONE

## Implementation Content
- Retried slice output

## Verification Result
- Retry verification

## Files Changed
- retry.ts

## Self-Review
- Completeness: retry target completed
`);

    const result = await resumeSliceExecution(config, runner, 2, {});
    const sliceState = await readSliceExecutionState(config);

    expect(result.results.at(-1)?.validation.valid).toBe(true);
    expect(runner.calls).toBe(1);
    expect(sliceState?.slices.map((slice) => slice.status)).toEqual(["completed", "completed"]);
    expect(sliceState?.slices[1]?.attempts).toBe(2);
  });

  it("uses tier model resolution for slice runner calls unless CLI model overrides it", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const workTree = {
      slices: [
        {
          name: "powerful-slice",
          description: "Needs the powerful tier",
          order: 1,
          checkpoint: "model is routed",
          tasks: [
            { id: "t1", description: "broad change", estimated_minutes: 30, context_budget: "high", dependencies: [], model_tier: "powerful" as const },
          ],
        },
      ],
    };
    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "ready" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: {},
      history: [],
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, {
      stage: "W",
      title: "W",
      content: JSON.stringify(workTree),
      generatedAt: now,
      artifactPath: "",
    });
    await writeWorkTree(config, workTree);

    const previous = process.env.QRSPI_MOCK_MODEL_POWERFUL;
    process.env.QRSPI_MOCK_MODEL_POWERFUL = "mock-powerful";
    const reportOutput = `
# Implementation Report

**Status:** DONE

## Implementation Content
- Implemented routed slice

## Verification Result
- Verified routed slice

## Files Changed
- packages/qrspi/src/runner/model-resolver.ts

## Self-Review
- Completeness: routed model checked
`;
    const runner = new TestRunner(reportOutput);

    try {
      const envResult = await runSingleStage(config, wf, eng, runner, undefined, "en");
      const envState = await readSliceExecutionState(config);
      expect(envResult.validation.valid).toBe(true);
      expect(runner.inputs[0]?.options.model).toBe("mock-powerful");
      expect(envState?.slices[0]?.model_resolution?.source).toBe("runner_tier_env");

      const rerunWf = { ...wf, updatedAt: new Date().toISOString() };
      const rerunEng = { ...eng, stage_attempts: {}, history: [] };
      await writeWorkflowState(config, rerunWf);
      await writeEngineState(config, rerunEng);
      await writeWorkTree(config, { ...workTree, slices: [{ ...workTree.slices[0]!, name: "powerful-slice-cli", order: 2 }] });
      const cliRunner = new TestRunner(reportOutput);
      await runSingleStage(config, rerunWf, rerunEng, cliRunner, undefined, "en", { model: "cli-model" });
      expect(cliRunner.inputs[0]?.options.model).toBe("cli-model");
    } finally {
      if (previous === undefined) delete process.env.QRSPI_MOCK_MODEL_POWERFUL;
      else process.env.QRSPI_MOCK_MODEL_POWERFUL = previous;
    }
  });

  it("runSingleStage rejects PR when I stage has not completed successfully", async () => {
    await initWorkflow(config);

    const wf = {
      featureId: config.featureId,
      currentStage: "PR" as const,
      status: "idle" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "PR" as const,
      status: "ready" as const,
      approvals: [],
      stage_attempts: { I: 1 },
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const runner = new TestRunner(`
# Pull Request Review

## Change Summary
- No-op

## Test Coverage
- None

## Release Criteria
- Waiting for implementation

## Review Checklist
- [ ] Confirm implementation exists
`);

    const result = await runSingleStage(config, wf, eng, runner);
    expect(result.validation.valid).toBe(false);
    expect(result.engineState.status).toBe("failed");
    expect(result.validation.summary).toContain("successful I stage");
  });

  it("runSingleStage records over-target context budget and still calls the runner", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const wf = {
      featureId: config.featureId,
      currentStage: "P" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "P" as const,
      status: "ready" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: {},
      history: [],
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, { stage: "S", title: "S", content: "S".repeat(25000), generatedAt: now, artifactPath: "" });

    const runner = new TestRunner(Array.from({ length: 15 }, (_, i) => `plan line ${i}`).join("\n"));
    const result = await runSingleStage(config, wf, eng, runner);
    const runsDir = join(config.projectRoot, ".qrspi", config.featureId, "runs");
    const [runDirName] = readdirSync(runsDir).sort();
    const runnerMeta = JSON.parse(
      readFileSync(join(runsDir, runDirName!, "runner_meta.json"), "utf-8"),
    ) as { context_budget: { status: string; warningCount: number } };

    expect(runner.calls).toBe(1);
    expect(result.validation.valid).toBe(true);
    expect(result.engineState.history[0].contextBudgetStatus).toBe("over_target");
    expect(runnerMeta.context_budget.status).toBe("over_target");
    expect(runnerMeta.context_budget.warningCount).toBeGreaterThan(0);
  });

  it("runSingleStage stops before runner when required context exceeds the threshold", async () => {
    await initWorkflow(config);
    const now = new Date().toISOString();
    const wf = {
      featureId: config.featureId,
      currentStage: "P" as const,
      status: "idle" as const,
      createdAt: now,
      updatedAt: now,
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "P" as const,
      status: "ready" as const,
      approvals: [],
      gate_reviews: [],
      stage_attempts: {},
      history: [],
      updatedAt: now,
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);
    await writeArtifact(config, { stage: "S", title: "S", content: "S".repeat(35000), generatedAt: now, artifactPath: "" });

    const runner = new TestRunner(Array.from({ length: 15 }, (_, i) => `plan line ${i}`).join("\n"));
    const result = await runSingleStage(config, wf, eng, runner);
    const runsDir = join(config.projectRoot, ".qrspi", config.featureId, "runs");
    const [runDirName] = readdirSync(runsDir).sort();
    const context = JSON.parse(
      readFileSync(join(runsDir, runDirName!, "context.json"), "utf-8"),
    ) as { budget: { status: string } };

    expect(runner.calls).toBe(0);
    expect(result.validation.valid).toBe(false);
    expect(result.engineState.status).toBe("needs_context");
    expect(result.engineState.lastContextError?.code).toBe("context_over_budget");
    expect(context.budget.status).toBe("over_threshold");
  });

  it("approveCurrentStage approves gate and advances", async () => {
    await initWorkflow(config);

    // Manually write D stage waiting for approval
    const wf = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      approvals: [],
      stage_attempts: { Q: 1, R: 1, D: 1 },
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const result = await approveCurrentStage(config, "D");
    expect(result.engineState.approvals).toHaveLength(1);
    expect(result.engineState.approvals[0].stage).toBe("D");
    expect(result.workflowState.currentStage).toBe("S");
  });

  it("approveCurrentStage throws for non-gate stage", async () => {
    await initWorkflow(config);
    await expect(approveCurrentStage(config, "Q")).rejects.toThrow("not a gate");
  });

  it("rejectCurrentStage makes a gate stage ready to rerun", async () => {
    await initWorkflow(config);

    const wf = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      approvals: [],
      stage_attempts: { Q: 1, R: 1, D: 1 },
      history: [
        {
          stage: "Q" as const,
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runDir: "q-run",
          success: true,
        },
        {
          stage: "D" as const,
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runDir: "d-run",
          success: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const result = await rejectCurrentStage(config, "D", "Needs a clearer design");
    expect(result.workflowState.currentStage).toBe("D");
    expect(result.workflowState.status).toBe("idle");
    expect(result.engineState.status).toBe("ready");
    expect(result.engineState.history.some((entry) => entry.stage === "D" && entry.success)).toBe(false);
    expect(result.engineState.history.some((entry) => entry.stage === "Q" && entry.success)).toBe(true);
  });

  it("rejectCurrentStage throws for non-gate stage", async () => {
    await initWorkflow(config);
    await expect(rejectCurrentStage(config, "Q")).rejects.toThrow("not a gate");
  });

  it("rewindWorkflowStage moves back and clears target and later history", async () => {
    await initWorkflow(config);

    const wf = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "waiting_approval" as const,
      approvals: [],
      stage_attempts: { Q: 1, R: 1, D: 1 },
      history: [
        {
          stage: "Q" as const,
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runDir: "q-run",
          success: true,
        },
        {
          stage: "R" as const,
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runDir: "r-run",
          success: true,
        },
        {
          stage: "D" as const,
          attempt: 1,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runDir: "d-run",
          success: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const result = await rewindWorkflowStage(config, "R", "Revisit research");
    expect(result.workflowState.currentStage).toBe("R");
    expect(result.workflowState.status).toBe("idle");
    expect(result.engineState.currentStage).toBe("R");
    expect(result.engineState.status).toBe("ready");
    expect(result.engineState.history.map((entry) => entry.stage)).toEqual(["Q"]);
  });

  it("rewindWorkflowStage rejects moving to a future stage", async () => {
    await initWorkflow(config);
    await expect(rewindWorkflowStage(config, "D")).rejects.toThrow("future stage");
  });

  it("advanceWorkflowStage advances non-gate stage", async () => {
    await initWorkflow(config);
    const next = await advanceWorkflowStage(config);
    expect(next.currentStage).toBe("R");
  });

  it("advanceWorkflowStage gate stage requires force", async () => {
    await initWorkflow(config);
    // Manually write D stage state to disk
    const wf = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "idle" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: "test-feature",
      currentStage: "D" as const,
      status: "ready" as const,
      approvals: [],
      stage_attempts: {},
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    await expect(advanceWorkflowStage(config)).rejects.toThrow("gate");
    const forced = await advanceWorkflowStage(config, true);
    expect(forced.currentStage).toBe("S");
  });

  it("runWorkflow auto-executes multiple stages", async () => {
    await initWorkflow(config);
    const runner = new TestRunner("### Q1: What?\n### Q2: How?\n### Q3: Why?\n### Q4: When?\n### Q5: Where?\n\n".repeat(3));
    const result = await runWorkflow(config, runner, {});
    expect(result.results.length).toBeGreaterThan(0);
    // runWorkflow executes current stage, stops at gate or failure
    expect(["Q", "D", "S", "PR"]).toContain(result.workflowState.currentStage);
  });

  it("runWorkflow stops after I reports needs_context", async () => {
    await initWorkflow(config);

    const wf = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "idle" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const eng = {
      featureId: config.featureId,
      currentStage: "I" as const,
      status: "ready" as const,
      approvals: [],
      stage_attempts: {},
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, wf);
    await writeEngineState(config, eng);

    const runner = new TestRunner(`
# Implementation Report

**Status:** NEEDS_CONTEXT

## Slice 1: Media contract
### Implementation Content
No code changes made.

### Verification Result
- Checked existing MediaId allocation

### Remaining Issues
- Need confirmed MediaId and enum name

## Self-Review
- Completeness: blocked on missing input
`);

    const result = await runWorkflow(config, runner, {});
    expect(result.results).toHaveLength(1);
    expect(result.workflowState.currentStage).toBe("I");
    expect(result.engineState.status).toBe("needs_context");
  });
});
