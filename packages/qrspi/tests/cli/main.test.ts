import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { initWorkflow } from "../../src/engine/engine.js";
import { main } from "../../src/cli/main.js";
import {
  readWorkTree,
  readWorkflowState,
  writeEngineState,
  writeWorkflowState,
} from "../../src/storage/file-repository.js";
import type { EngineState, SessionConfig, StageCode, WorkflowState } from "../../src/workflow/types.js";

function createConfig(projectRoot: string, featureId: string): SessionConfig {
  return {
    featureId,
    projectRoot,
    outputDir: ".qrspi",
  };
}

async function createWorkflow(
  projectRoot: string,
  featureId: string,
  currentStage: StageCode = "Q",
  engineStatus: EngineState["status"] = "ready",
): Promise<SessionConfig> {
  const config = createConfig(projectRoot, featureId);
  await initWorkflow(config);

  const now = new Date().toISOString();
  const workflowState: WorkflowState = {
    featureId,
    currentStage,
    status: engineStatus === "waiting_approval" ? "waiting_approval" : "idle",
    createdAt: now,
    updatedAt: now,
  };
  const engineState: EngineState = {
    featureId,
    currentStage,
    status: engineStatus,
    approvals: [],
    stage_attempts: {},
    history: [],
    lastError: "",
    updatedAt: now,
  };

  await writeWorkflowState(config, workflowState);
  await writeEngineState(config, engineState);
  return config;
}

async function runCli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    const code = await main(argv);
    return {
      code,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = previousExitCode;
  }
}

describe("cli main feature scoping", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "qrspi-cli-main-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("fails fast when multiple workflows exist and feature id is omitted", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "R");

    const result = await runCli(["node", "qrspi", "status", "--root", projectRoot]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Multiple workflows found: alpha, beta");
    expect(result.stderr).toContain("--feature <id>");
  });

  it("rejects unknown feature ids with available feature hints", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "missing",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Workflow not found for feature: missing");
    expect(result.stderr).toContain("Available features: alpha");
  });

  it("routes status and stage to the selected feature", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "W");

    const statusResult = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "beta",
    ]);
    const stageResult = await runCli([
      "node",
      "qrspi",
      "stage",
      "--root",
      projectRoot,
      "--feature",
      "beta",
    ]);

    expect(statusResult.code).toBe(0);
    expect(statusResult.stdout).toContain("Feature: beta");
    expect(stageResult.code).toBe(0);
    expect(stageResult.stdout).toContain("Output Directory: .qrspi/beta");
  });

  it("accepts feature id for prompt and context commands", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "R");

    const promptResult = await runCli([
      "node",
      "qrspi",
      "prompt",
      "R",
      "--root",
      projectRoot,
      "--feature",
      "beta",
    ]);
    const contextResult = await runCli([
      "node",
      "qrspi",
      "context",
      "--root",
      projectRoot,
      "--feature",
      "beta",
    ]);

    expect(promptResult.code).toBe(0);
    expect(promptResult.stdout).toContain("Use --render to render the actual prompt");
    expect(contextResult.code).toBe(0);
    expect(contextResult.stdout).toContain("Current Stage: R");
  });

  it("accepts feature id for run and advances only the selected workflow", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    const betaConfig = await createWorkflow(projectRoot, "beta", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "beta",
      "--runner",
      "mock",
      "--max-stages",
      "1",
    ]);

    const workflowState = await readWorkflowState(betaConfig);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Feature: beta");
    expect(workflowState?.currentStage).toBe("R");
  });

  it("accepts feature id for approve and reject", async () => {
    const approveConfig = await createWorkflow(projectRoot, "approve-me", "D", "waiting_approval");
    const rejectConfig = await createWorkflow(projectRoot, "reject-me", "S", "waiting_approval");

    const approveResult = await runCli([
      "node",
      "qrspi",
      "approve",
      "--root",
      projectRoot,
      "--feature",
      "approve-me",
    ]);
    const rejectResult = await runCli([
      "node",
      "qrspi",
      "reject",
      "--root",
      projectRoot,
      "--feature",
      "reject-me",
      "--comment",
      "needs changes",
    ]);

    const approvedState = await readWorkflowState(approveConfig);
    const rejectedState = await readWorkflowState(rejectConfig);

    expect(approveResult.code).toBe(0);
    expect(approveResult.stdout).toContain("approved, advanced to S");
    expect(approvedState?.currentStage).toBe("S");

    expect(rejectResult.code).toBe(0);
    expect(rejectResult.stdout).toContain("Rejected stage: S");
    expect(rejectedState?.currentStage).toBe("S");
  });

  it("accepts feature id for rewind and advance", async () => {
    const rewindConfig = await createWorkflow(projectRoot, "rewind-me", "W", "ready");
    const advanceConfig = await createWorkflow(projectRoot, "advance-me", "Q", "ready");

    const rewindResult = await runCli([
      "node",
      "qrspi",
      "rewind",
      "R",
      "--root",
      projectRoot,
      "--feature",
      "rewind-me",
      "--reason",
      "redo research",
    ]);
    const advanceResult = await runCli([
      "node",
      "qrspi",
      "advance",
      "--root",
      projectRoot,
      "--feature",
      "advance-me",
    ]);

    const rewoundState = await readWorkflowState(rewindConfig);
    const advancedState = await readWorkflowState(advanceConfig);

    expect(rewindResult.code).toBe(0);
    expect(rewindResult.stdout).toContain("Rewound workflow to stage: Research");
    expect(rewoundState?.currentStage).toBe("R");

    expect(advanceResult.code).toBe(0);
    expect(advanceResult.stdout).toContain("Advanced to stage: Research");
    expect(advancedState?.currentStage).toBe("R");
  });

  it("accepts feature id for slice add and slice list", async () => {
    const config = await createWorkflow(projectRoot, "slice-me", "W", "ready");

    const addResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "add",
      "core-flow",
      "--root",
      projectRoot,
      "--feature",
      "slice-me",
      "--desc",
      "core path",
      "--order",
      "2",
      "--checkpoint",
      "works end to end",
    ]);
    const listResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "list",
      "--root",
      projectRoot,
      "--feature",
      "slice-me",
    ]);

    const workTree = await readWorkTree(config);

    expect(addResult.code).toBe(0);
    expect(addResult.stdout).toContain("Added slice: core-flow");
    expect(workTree?.slices).toHaveLength(1);
    expect(workTree?.slices[0]?.name).toBe("core-flow");

    expect(listResult.code).toBe(0);
    expect(listResult.stdout).toContain("[2] core-flow: core path");
  });
});
