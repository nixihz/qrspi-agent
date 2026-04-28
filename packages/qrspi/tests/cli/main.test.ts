import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { initWorkflow } from "../../src/engine/engine.js";
import { main } from "../../src/cli/main.js";
import {
  readWorkTree,
  readEngineState,
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
  let originalLang: string | undefined;

  beforeEach(() => {
    originalLang = process.env.LANG;
    process.env.LANG = "en_US.UTF-8";
    projectRoot = mkdtempSync(join(tmpdir(), "qrspi-cli-main-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    if (originalLang === undefined) {
      delete process.env.LANG;
    } else {
      process.env.LANG = originalLang;
    }
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

  it("prints status as a JSON envelope", async () => {
    await createWorkflow(projectRoot, "design-gate", "D", "waiting_approval");

    const result = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "design-gate",
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      feature: string;
      stage: { code: string; is_gate: boolean; status: string };
      next_action: { kind: string };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("status");
    expect(payload.feature).toBe("design-gate");
    expect(payload.stage).toMatchObject({
      code: "D",
      is_gate: true,
      status: "waiting_approval",
    });
    expect(payload.next_action.kind).toBe("human_gate_review");
  });

  it("prints init as a JSON envelope", async () => {
    const result = await runCli([
      "node",
      "qrspi",
      "init",
      "json-init",
      "--root",
      projectRoot,
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      feature: string;
      stage: { code: string; status: string };
      next_action: { kind: string };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload).toMatchObject({
      ok: true,
      command: "init",
      feature: "json-init",
      stage: { code: "Q", status: "ready" },
      next_action: { kind: "run_stage" },
    });
  });

  it("prints feature resolution errors as JSON when requested", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "R");

    const result = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; features: string[] };
    };

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("MULTIPLE_WORKFLOWS");
    expect(payload.error.features).toEqual(["alpha", "beta"]);
  });

  it("prints list with --output json", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "R", "waiting_approval");

    const result = await runCli([
      "node",
      "qrspi",
      "list",
      "--root",
      projectRoot,
      "--output",
      "json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      features: Array<{ feature: string; stage: string; status: string }>;
    };

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("list");
    expect(payload.features).toEqual([
      { feature: "alpha", stage: "Q", status: "ready" },
      { feature: "beta", stage: "R", status: "waiting_approval" },
    ]);
  });

  it("accepts feature id for prompt and context commands", async () => {
    await createWorkflow(projectRoot, "alpha", "Q");
    await createWorkflow(projectRoot, "beta", "R");

    const promptResult = await runCli([
      "node",
      "qrspi",
      "prompt",
      "render",
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
    expect(promptResult.stdout).toContain("# Stage: R");
    expect(contextResult.code).toBe(0);
    expect(contextResult.stdout).toContain("Current Stage: R");
  });

  it("exports all base prompt templates without a workflow", async () => {
    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "export",
      "--root",
      projectRoot,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("QRSPI Prompt Templates");
    expect(result.stdout).toContain("# Stage: Q");
    expect(result.stdout).toContain("# Stage: PR");
    expect(result.stdout).toContain("without workflow-specific context artifacts or user input");
  });

  it("exports split Chinese prompt templates to a directory", async () => {
    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "export",
      "--root",
      projectRoot,
      "--lang",
      "zh",
      "--out",
      "prompt-templates",
      "--split",
    ]);

    const outputDir = join(projectRoot, "prompt-templates");
    const filenames = readdirSync(outputDir).sort();
    const qPrompt = readFileSync(join(outputDir, "Q_prompt.zh.md"), "utf-8");

    expect(result.code).toBe(0);
    expect(filenames).toHaveLength(8);
    expect(filenames).toContain("PR_prompt.zh.md");
    expect(qPrompt).toContain("# 阶段: Q");
    expect(qPrompt).toContain("技术问题清单");
  });

  it("keeps legacy prompt render syntax working", async () => {
    await createWorkflow(projectRoot, "legacy-render", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "Q",
      "--render",
      "--root",
      projectRoot,
      "--feature",
      "legacy-render",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# Stage: Q");
    expect(result.stdout).toContain("Technical Questions");
  });

  it("keeps legacy prompts export syntax working", async () => {
    const result = await runCli([
      "node",
      "qrspi",
      "prompts",
      "export",
      "Q",
      "--root",
      projectRoot,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Stages: Q");
    expect(result.stdout).toContain("# Stage: Q");
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

  it("prints run JSON without runner output by default", async () => {
    await createWorkflow(projectRoot, "json-run", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "json-run",
      "--runner",
      "mock",
      "--max-stages",
      "1",
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      results: Array<{ stage: string; artifact: string; runner_output?: unknown }>;
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("run");
    expect(payload.results[0]?.stage).toBe("Q");
    expect(payload.results[0]?.artifact).toContain(".qrspi/json-run/artifacts/Q_");
    expect(payload.results[0]?.runner_output).toBeUndefined();
    expect(result.stdout).not.toContain("Technical Questions");
  });

  it("prints runner output in run JSON only when requested", async () => {
    await createWorkflow(projectRoot, "json-run-output", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "json-run-output",
      "--runner",
      "mock",
      "--max-stages",
      "1",
      "--json",
      "--include-runner-output",
    ]);
    const payload = JSON.parse(result.stdout) as {
      results: Array<{ runner_output?: { stdout: string } }>;
    };

    expect(result.code).toBe(0);
    expect(payload.results[0]?.runner_output?.stdout).toContain("Technical Questions");
  });

  it("passes --model through run command to runner metadata", async () => {
    await createWorkflow(projectRoot, "model-me", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "model-me",
      "--runner",
      "mock",
      "--model",
      "custom-model",
      "--max-stages",
      "1",
    ]);

    const runsDir = join(projectRoot, ".qrspi", "model-me", "runs");
    const [runDirName] = readdirSync(runsDir).sort();
    expect(runDirName).toBeDefined();
    const meta = JSON.parse(
      readFileSync(join(runsDir, runDirName!, "runner_meta.json"), "utf-8"),
    ) as { model?: string };
    const liveStdout = readFileSync(join(runsDir, runDirName!, "live_stdout.txt"), "utf-8");
    const liveStderr = readFileSync(join(runsDir, runDirName!, "live_stderr.txt"), "utf-8");

    expect(result.code).toBe(0);
    expect(meta.model).toBe("custom-model");
    expect(liveStdout).toContain("Technical Questions");
    expect(liveStderr).toBe("");
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

  it("stores gate review notes from approve and reject files", async () => {
    const approveConfig = await createWorkflow(projectRoot, "approve-note", "D", "waiting_approval");
    const rejectConfig = await createWorkflow(projectRoot, "reject-feedback", "S", "waiting_approval");
    const notePath = join(projectRoot, "design-review.md");
    const feedbackPath = join(projectRoot, "structure-feedback.md");
    writeFileSync(notePath, "# DESIGN Gate Review\n\nDecision: approved with notes\n", "utf-8");
    writeFileSync(feedbackPath, "# STRUCTURE Gate Feedback\n\nAdd the JSON schema slice.\n", "utf-8");

    const approveResult = await runCli([
      "node",
      "qrspi",
      "approve",
      "--root",
      projectRoot,
      "--feature",
      "approve-note",
      "--note-file",
      notePath,
      "--json",
    ]);
    const rejectResult = await runCli([
      "node",
      "qrspi",
      "reject",
      "--root",
      projectRoot,
      "--feature",
      "reject-feedback",
      "--feedback-file",
      feedbackPath,
      "--json",
    ]);

    const approvePayload = JSON.parse(approveResult.stdout) as {
      ok: boolean;
      approved_stage: string;
      gate_review?: { reviewPath?: string };
    };
    const rejectPayload = JSON.parse(rejectResult.stdout) as {
      ok: boolean;
      rejected_stage: string;
      gate_review?: { reviewPath?: string };
    };
    const approvedEngine = await readEngineState(approveConfig);
    const rejectedEngine = await readEngineState(rejectConfig);
    const statusResult = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "approve-note",
      "--json",
    ]);
    const statusPayload = JSON.parse(statusResult.stdout) as {
      gate_reviews?: { latest?: { reviewPath?: string }; history: Array<{ reviewPath?: string }> };
    };

    expect(approveResult.code).toBe(0);
    expect(approvePayload).toMatchObject({ ok: true, approved_stage: "D" });
    expect(approvedEngine?.approvals[0]?.comment).toContain("Decision: approved with notes");
    expect(approvedEngine?.gate_reviews?.[0]).toMatchObject({
      stage: "D",
      decision: "approved",
      sourceFile: notePath,
    });
    expect(approvedEngine?.gate_reviews?.[0]?.note).toContain("Decision: approved with notes");
    expect(approvedEngine?.gate_reviews?.[0]?.reviewPath).toContain(".qrspi/approve-note/gate_reviews/D_");
    expect(approvePayload.gate_review?.reviewPath).toContain(".qrspi/approve-note/gate_reviews/D_");
    expect(readFileSync(approvedEngine?.gate_reviews?.[0]?.reviewPath ?? "", "utf-8")).toContain("Decision: approved with notes");
    expect(statusPayload.gate_reviews?.latest?.reviewPath).toBe(approvePayload.gate_review?.reviewPath);
    expect(statusPayload.gate_reviews?.history).toHaveLength(1);

    expect(rejectResult.code).toBe(0);
    expect(rejectPayload).toMatchObject({ ok: true, rejected_stage: "S" });
    expect(rejectedEngine?.lastError).toContain("Add the JSON schema slice.");
    expect(rejectedEngine?.gate_reviews?.[0]).toMatchObject({
      stage: "S",
      decision: "rejected",
      sourceFile: feedbackPath,
    });
    expect(rejectedEngine?.gate_reviews?.[0]?.feedback).toContain("Add the JSON schema slice.");
    expect(rejectedEngine?.gate_reviews?.[0]?.reviewPath).toContain(".qrspi/reject-feedback/gate_reviews/S_");
    expect(rejectPayload.gate_review?.reviewPath).toContain(".qrspi/reject-feedback/gate_reviews/S_");
    expect(readFileSync(rejectedEngine?.gate_reviews?.[0]?.reviewPath ?? "", "utf-8")).toContain("Add the JSON schema slice.");
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
