import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SessionConfig, Runner, RunnerExecInput } from "../../src/workflow/types.js";
import {
  initWorkflow,
  runSingleStage,
  runWorkflow,
  approveCurrentStage,
  rejectCurrentStage,
  rewindWorkflowStage,
  advanceWorkflowStage,
} from "../../src/engine/engine.js";
import { writeWorkflowState, writeEngineState } from "../../src/storage/file-repository.js";

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
  private output: string;

  constructor(output: string) {
    this.output = output;
  }

  async run(_input: RunnerExecInput) {
    return {
      stdout: this.output,
      stderr: "",
      exitCode: 0,
      durationMs: 100,
      meta: {},
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

  it("runSingleStage fails validation", async () => {
    await initWorkflow(config);
    const runner = new TestRunner("short");
    const { workflowState, engineState } = await initWorkflow(config);

    const result = await runSingleStage(config, workflowState, engineState, runner);
    expect(result.validation.valid).toBe(false);
    expect(result.engineState.status).toBe("failed");
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
});
