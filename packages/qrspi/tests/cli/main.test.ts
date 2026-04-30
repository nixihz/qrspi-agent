import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { initWorkflow } from "../../src/engine/engine.js";
import { main } from "../../src/cli/main.js";
import {
  readWorkTree,
  readSliceExecutionState,
  readEngineState,
  readWorkflowState,
  writeSliceExecutionState,
  writeWorkTree,
  writeEngineState,
  writeWorkflowState,
  writeArtifact,
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

  it("embeds slice execution summary in text status output", async () => {
    const config = await createWorkflow(projectRoot, "slice-summary", "I", "running");
    await writeSliceExecutionState(config, {
      featureId: "slice-summary",
      current_slice_order: 2,
      updatedAt: "2026-04-29T10:00:00.000Z",
      slices: [
        {
          slice_name: "core-state",
          slice_order: 1,
          status: "completed",
          attempts: 1,
          model_tier: "low",
          started_at: "2026-04-29T09:00:00.000Z",
        },
        {
          slice_name: "status-surface",
          slice_order: 2,
          status: "running",
          attempts: 2,
          model_tier: "standard",
          started_at: "2026-04-29T09:05:00.000Z",
        },
        {
          slice_name: "retry-path",
          slice_order: 3,
          status: "failed",
          attempts: 1,
          model_tier: "powerful",
          started_at: "2026-04-29T09:08:00.000Z",
        },
      ],
    });

    const result = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "slice-summary",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("QRSPI Workflow Status");
    expect(result.stdout).toContain("Slice Summary (current: 2)");
    expect(result.stdout).toContain("✓ [1] core-state | status=completed | start=2026-04-29T09:00:00.000Z");
    expect(result.stdout).toContain(">>> [2] status-surface | status=running | start=2026-04-29T09:05:00.000Z");
    expect(result.stdout).toContain("! [3] retry-path | status=failed | start=2026-04-29T09:08:00.000Z");
  });

  it("prints status as a JSON envelope", async () => {
    const config = await createWorkflow(projectRoot, "design-gate", "D", "waiting_approval");
    const runDir = join(projectRoot, ".qrspi", "design-gate", "runs", "D_20260428_100000_attempt1");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "runner_stdout.txt"), "D completed and waiting approval", "utf-8");
    writeFileSync(join(runDir, "runner_stderr.txt"), "", "utf-8");
    writeFileSync(join(runDir, "validation.json"), "{}", "utf-8");
    writeFileSync(join(runDir, "parsed_artifact.json"), "{}", "utf-8");
    await writeWorkTree(config, {
      slices: [
        {
          name: "dashboard-queue",
          description: "Render reviewer queue from CLI status JSON.",
          order: 1,
          tasks: [],
          checkpoint: "Queue shows pending gates first.",
          status: "ready",
          dependencies: [],
          testable: true,
        },
      ],
    });
    const engine = await readEngineState(config);
    await writeEngineState(config, {
      ...engine!,
      history: [
        {
          stage: "D",
          attempt: 1,
          startedAt: "2026-04-28T10:00:00.000Z",
          finishedAt: "2026-04-28T10:01:00.000Z",
          runDir,
          success: true,
        },
      ],
      updatedAt: "2026-04-28T10:01:00.000Z",
    });

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
      feature_id: string;
      data: {
        workflow: { feature_id: string; current_stage: string; waiting_for_gate: boolean; updated_at: string };
        stages: Array<{ code: string; is_gate: boolean; attempts: number; status: string }>;
        artifacts: Array<{ kind: string; path: string; exists: boolean }>;
        next_action: { kind: string };
        current_gate_context?: { review_items: Array<{ id: string; status: string }> };
      };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("status");
    expect(payload.feature_id).toBe("design-gate");
    expect(payload.data.workflow).toMatchObject({
      feature_id: "design-gate",
      current_stage: "D",
      waiting_for_gate: true,
      updated_at: "2026-04-28T10:01:00.000Z",
    });
    expect(payload.data.next_action.kind).toBe("human_gate_review");
    expect(payload.data.stages).toHaveLength(8);
    expect(payload.data.stages.find((stage) => stage.code === "D")).toMatchObject({
      code: "D",
      is_gate: true,
      attempts: 1,
      status: "waiting_approval",
    });
    expect(payload.data.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "run_parsed",
          path: ".qrspi/design-gate/runs/D_20260428_100000_attempt1/parsed_artifact.json",
          exists: true,
        }),
      ]),
    );
    expect(payload.data.current_gate_context).toBeDefined();
  });

  it("prints context as a JSON envelope", async () => {
    await createWorkflow(projectRoot, "context-json", "R");

    const result = await runCli([
      "node",
      "qrspi",
      "context",
      "--root",
      projectRoot,
      "--feature",
      "context-json",
      "--json",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      data: {
        current_stage: string;
        dependencies: Array<{ stage: string; layer: string }>;
        context_budget: {
          target_max_percent: number;
          switch_threshold_percent: number;
          mode: string;
          status: string;
          prompt_estimate: { characters: number };
          truncation_decisions: unknown[];
          warnings: unknown[];
        };
      };
    };

    expect(result.code).toBe(0);
    expect(payload.command).toBe("context");
    expect(payload.data.current_stage).toBe("R");
    expect(payload.data.context_budget).toMatchObject({
      target_max_percent: 40,
      switch_threshold_percent: 60,
      mode: "layered",
      status: "within_target",
    });
    expect(payload.data.context_budget.prompt_estimate.characters).toBeGreaterThanOrEqual(0);
    expect(payload.data.context_budget.truncation_decisions).toEqual([]);
  });

  it("renders P prompts with budget notes and truncation pointers for large prior artifacts", async () => {
    const config = await createWorkflow(projectRoot, "prompt-budget", "P");
    const big = Array.from({ length: 1000 }, (_, i) => `old detail ${i}`).join("\n");
    await writeArtifact(config, {
      stage: "Q",
      title: "Q",
      content: big,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "R",
      title: "R",
      content: big,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "D",
      title: "D",
      content: "## Design Decisions\n- Use budgeted context",
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "S",
      title: "S",
      content: "export interface ContextBudgetConfig {}\nexport function buildBudgetedContextPack() {}",
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });

    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "render",
      "P",
      "--root",
      projectRoot,
      "--feature",
      "prompt-budget",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Context Budget Note");
    expect(result.stdout).toContain("Stage Q Context Content");
    expect(result.stdout).not.toContain("old detail 999");
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
      feature_id: string;
      data: {
        workflow: { feature_id: string; current_stage: string; engine_status: string };
        next_action: { kind: string };
      };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload).toMatchObject({
      ok: true,
      command: "init",
      feature_id: "json-init",
      data: {
        workflow: { feature_id: "json-init", current_stage: "Q", engine_status: "ready" },
        next_action: { kind: "run_stage" },
      },
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
      error: { code: string; details?: { features?: string[] } };
    };

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("MULTIPLE_WORKFLOWS");
    expect(payload.error.details?.features).toEqual(["alpha", "beta"]);
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
      data: {
        features: Array<{ feature_id: string; current_stage: string; status: string }>;
      };
    };

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("list");
    expect(payload.data.features).toEqual([
      { feature_id: "alpha", current_stage: "Q", status: "ready" },
      { feature_id: "beta", current_stage: "R", status: "waiting_approval" },
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

  it("renders prompt input from a markdown file with source provenance", async () => {
    await createWorkflow(projectRoot, "file-prompt", "Q");
    writeFileSync(join(projectRoot, "requirements.md"), "# Requirement\n\nAdd login");

    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "render",
      "Q",
      "--root",
      projectRoot,
      "--feature",
      "file-prompt",
      "--input-file",
      "requirements.md",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## User Input\nInput source: requirements.md\n\n# Requirement\n\nAdd login");
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
      data: {
        executed_stages: Array<{ stage: string; artifact: { path: string }; runner_output?: unknown }>;
      };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("run");
    expect(payload.data.executed_stages[0]?.stage).toBe("Q");
    expect(payload.data.executed_stages[0]?.artifact.path).toContain(".qrspi/json-run/artifacts/Q_");
    expect(payload.data.executed_stages[0]?.runner_output).toBeUndefined();
    expect(result.stdout).not.toContain("Technical Questions");
  });

  it("prints run JSON with workflow input metadata from a text file", async () => {
    await createWorkflow(projectRoot, "json-run-file", "Q");
    writeFileSync(join(projectRoot, "requirements.txt"), "Add file-backed requirements");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "json-run-file",
      "--runner",
      "mock",
      "--max-stages",
      "1",
      "--json",
      "--input-file",
      "requirements.txt",
    ]);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      data: {
        workflow_input?: { input_source: string; source_file: string; file_kind: string };
      };
    };
    const runsDir = join(projectRoot, ".qrspi", "json-run-file", "runs");
    const [runDirName] = readdirSync(runsDir).sort();
    const runContext = JSON.parse(
      readFileSync(join(runsDir, runDirName!, "context.json"), "utf-8"),
    ) as { workflow_input?: { input_source: string; source_file: string; file_kind: string } };
    const prompt = readFileSync(join(runsDir, runDirName!, "prompt.md"), "utf-8");

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.data.workflow_input).toEqual({
      input_source: "file",
      source_file: "requirements.txt",
      file_kind: "text",
    });
    expect(runContext.workflow_input).toEqual({
      input_source: "file",
      source_file: "requirements.txt",
      file_kind: "text",
    });
    expect(prompt).toContain("Input source: requirements.txt");
    expect(prompt).toContain("Add file-backed requirements");
  });

  it("returns JSON error when input options conflict", async () => {
    await createWorkflow(projectRoot, "input-conflict", "Q");
    writeFileSync(join(projectRoot, "requirements.md"), "Add login");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "input-conflict",
      "--runner",
      "mock",
      "--json",
      "--input",
      "inline",
      "--input-file",
      "requirements.md",
    ]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INPUT_CONFLICT");
  });

  it("returns JSON error for unsupported input file extensions", async () => {
    await createWorkflow(projectRoot, "bad-extension", "Q");
    writeFileSync(join(projectRoot, "requirements.pdf"), "%PDF");

    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "render",
      "Q",
      "--root",
      projectRoot,
      "--feature",
      "bad-extension",
      "--json",
      "--input-file",
      "requirements.pdf",
    ]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INPUT_FILE_UNSUPPORTED_TYPE");
  });

  it("returns JSON error for missing input files", async () => {
    await createWorkflow(projectRoot, "missing-file", "Q");

    const result = await runCli([
      "node",
      "qrspi",
      "run",
      "--root",
      projectRoot,
      "--feature",
      "missing-file",
      "--runner",
      "mock",
      "--json",
      "--input-file",
      "missing.md",
    ]);
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INPUT_FILE_NOT_FOUND");
  });

  it("returns text error for directory input files", async () => {
    await createWorkflow(projectRoot, "directory-file", "Q");
    mkdirSync(join(projectRoot, "notes.md"));

    const result = await runCli([
      "node",
      "qrspi",
      "prompt",
      "render",
      "Q",
      "--root",
      projectRoot,
      "--feature",
      "directory-file",
      "--input-file",
      "notes.md",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Input file points to a directory: notes.md");
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
      data: {
        executed_stages: Array<{ runner_output?: { stdout: string } }>;
      };
    };

    expect(result.code).toBe(0);
    expect(payload.data.executed_stages[0]?.runner_output?.stdout).toContain("Technical Questions");
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
      data: { review_record: { stage: string; review_path?: string; input_source: string } };
    };
    const rejectPayload = JSON.parse(rejectResult.stdout) as {
      ok: boolean;
      data: { review_record: { stage: string; review_path?: string; input_source: string } };
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
      data: { latest_gate_review?: { review_path?: string } };
    };

    expect(approveResult.code).toBe(0);
    expect(approvePayload).toMatchObject({ ok: true, data: { review_record: { stage: "D", input_source: "file" } } });
    expect(approvedEngine?.approvals[0]?.comment).toContain("Decision: approved with notes");
    expect(approvedEngine?.gate_reviews?.[0]).toMatchObject({
      stage: "D",
      decision: "approved",
      source_file: notePath,
    });
    expect(approvedEngine?.gate_reviews?.[0]?.note).toContain("Decision: approved with notes");
    expect(approvedEngine?.gate_reviews?.[0]?.review_path).toContain(".qrspi/approve-note/gate_reviews/D_");
    expect(approvePayload.data.review_record.review_path).toContain(".qrspi/approve-note/gate_reviews/D_");
    expect(readFileSync(approvedEngine?.gate_reviews?.[0]?.review_path ?? "", "utf-8")).toContain("Decision: approved with notes");
    expect(statusPayload.data.latest_gate_review?.review_path).toBe(approvePayload.data.review_record.review_path);

    expect(rejectResult.code).toBe(0);
    expect(rejectPayload).toMatchObject({ ok: true, data: { review_record: { stage: "S", input_source: "file" } } });
    expect(rejectedEngine?.lastError).toContain("Add the JSON schema slice.");
    expect(rejectedEngine?.gate_reviews?.[0]).toMatchObject({
      stage: "S",
      decision: "rejected",
      source_file: feedbackPath,
    });
    expect(rejectedEngine?.gate_reviews?.[0]?.feedback).toContain("Add the JSON schema slice.");
    expect(rejectedEngine?.gate_reviews?.[0]?.review_path).toContain(".qrspi/reject-feedback/gate_reviews/S_");
    expect(rejectPayload.data.review_record.review_path).toContain(".qrspi/reject-feedback/gate_reviews/S_");
    expect(readFileSync(rejectedEngine?.gate_reviews?.[0]?.review_path ?? "", "utf-8")).toContain("Add the JSON schema slice.");
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

  it("prints slice status with execution metadata and JSON envelope", async () => {
    const config = await createWorkflow(projectRoot, "slice-status", "I", "running");
    await writeSliceExecutionState(config, {
      featureId: "slice-status",
      current_slice_order: 2,
      updatedAt: "2026-04-29T10:00:00.000Z",
      slices: [
        {
          slice_name: "core-state",
          slice_order: 1,
          status: "completed",
          attempts: 1,
          model_tier: "low",
          started_at: "2026-04-29T09:00:00.000Z",
          finished_at: "2026-04-29T09:05:00.000Z",
        },
        {
          slice_name: "status-surface",
          slice_order: 2,
          status: "running",
          attempts: 2,
          model_tier: "standard",
          started_at: "2026-04-29T09:06:00.000Z",
        },
      ],
    });

    const textResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "slice-status",
    ]);
    const jsonResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "slice-status",
      "--json",
    ]);
    const payload = JSON.parse(jsonResult.stdout) as {
      ok: boolean;
      command: string;
      feature_id: string;
      data: {
        current_slice_order?: number;
        slices: Array<{
          slice_order: number;
          slice_name: string;
          status: string;
          started_at?: string;
        }>;
      };
    };

    expect(textResult.code).toBe(0);
    expect(textResult.stdout).toContain("Slice Status (Feature: slice-status)");
    expect(textResult.stdout).toContain("Current Slice Order: 2");
    expect(textResult.stdout).toContain("[1] core-state");
    expect(textResult.stdout).toContain("status: completed");
    expect(textResult.stdout).toContain("start_time: 2026-04-29T09:00:00.000Z");
    expect(textResult.stdout).toContain("[2] status-surface");

    expect(jsonResult.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("slice status");
    expect(payload.feature_id).toBe("slice-status");
    expect(payload.data.current_slice_order).toBe(2);
    expect(payload.data.slices).toHaveLength(2);
    expect(payload.data.slices[0]).toMatchObject({
      slice_order: 1,
      slice_name: "core-state",
      status: "completed",
      started_at: "2026-04-29T09:00:00.000Z",
    });
  });

  it("returns empty slices when slice execution state is missing", async () => {
    await createWorkflow(projectRoot, "slice-empty", "I", "ready");

    const textResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "slice-empty",
    ]);
    const jsonResult = await runCli([
      "node",
      "qrspi",
      "slice",
      "status",
      "--root",
      projectRoot,
      "--feature",
      "slice-empty",
      "--json",
    ]);
    const payload = JSON.parse(jsonResult.stdout) as {
      data: { slices: unknown[] };
    };

    expect(textResult.code).toBe(0);
    expect(textResult.stdout).toContain("No slice execution state recorded");
    expect(payload.data.slices).toEqual([]);
  });

  it("resets a retryable slice to pending without triggering the engine", async () => {
    const config = await createWorkflow(projectRoot, "slice-retry", "I", "failed");
    await writeSliceExecutionState(config, {
      featureId: "slice-retry",
      current_slice_order: 2,
      updatedAt: "2026-04-29T10:00:00.000Z",
      slices: [
        {
          slice_name: "completed-slice",
          slice_order: 1,
          status: "completed",
          attempts: 1,
          model_tier: "low",
        },
        {
          slice_name: "failed-slice",
          slice_order: 2,
          status: "failed",
          attempts: 2,
          model_tier: "standard",
          run_dir: "/tmp/old-run",
          started_at: "2026-04-29T09:00:00.000Z",
          finished_at: "2026-04-29T09:05:00.000Z",
          reported_status: "DONE_WITH_CONCERNS",
          last_error: "previous failure",
        },
      ],
    });

    const result = await runCli([
      "node",
      "qrspi",
      "slice",
      "retry",
      "--root",
      projectRoot,
      "--feature",
      "slice-retry",
      "--slice",
      "2",
      "--no-trigger",
      "--json",
    ]);
    const sliceState = await readSliceExecutionState(config);
    const payload = JSON.parse(result.stdout) as {
      data: {
        triggered: boolean;
        retried_slice: {
          slice_order: number;
          status: string;
          attempts: number;
          run_dir?: string;
          last_error?: string;
        };
      };
    };

    expect(result.code).toBe(0);
    expect(payload.data.triggered).toBe(false);
    expect(payload.data.retried_slice).toMatchObject({
      slice_order: 2,
      status: "pending",
      attempts: 2,
    });
    expect(payload.data.retried_slice.run_dir).toBeUndefined();
    expect(payload.data.retried_slice.last_error).toBeUndefined();
    expect(sliceState?.current_slice_order).toBe(2);
    expect(sliceState?.slices[0]?.status).toBe("completed");
    expect(sliceState?.slices[1]?.status).toBe("pending");
  });

  it("triggers the engine when retrying with --no-trigger=false", async () => {
    const config = await createWorkflow(projectRoot, "slice-retry-trigger", "I", "failed");
    await writeWorkTree(config, {
      slices: [
        {
          name: "retry-me",
          description: "Retry this slice",
          order: 1,
          checkpoint: "slice completes",
          tasks: [
            { id: "t1", description: "work", estimated_minutes: 5, context_budget: "low", dependencies: [] },
          ],
        },
      ],
    });
    await writeSliceExecutionState(config, {
      featureId: "slice-retry-trigger",
      current_slice_order: 1,
      updatedAt: "2026-04-29T10:00:00.000Z",
      slices: [
        {
          slice_name: "retry-me",
          slice_order: 1,
          status: "failed",
          attempts: 1,
          model_tier: "standard",
          last_error: "previous failure",
        },
      ],
    });

    const result = await runCli([
      "node",
      "qrspi",
      "slice",
      "retry",
      "--root",
      projectRoot,
      "--feature",
      "slice-retry-trigger",
      "--slice",
      "1",
      "--no-trigger=false",
      "--runner",
      "mock",
      "--json",
    ]);
    const sliceState = await readSliceExecutionState(config);
    const payload = JSON.parse(result.stdout) as {
      data: {
        triggered: boolean;
        retried_slice: { status: string; attempts: number };
        workflow?: { current_stage: string; engine_status: string };
      };
    };

    expect(result.code).toBe(0);
    expect(payload.data.triggered).toBe(true);
    expect(payload.data.retried_slice.status).toBe("completed");
    expect(payload.data.retried_slice.attempts).toBe(2);
    expect(payload.data.workflow?.current_stage).toBe("PR");
    expect(sliceState?.slices[0]?.status).toBe("completed");
  });

  it("rejects invalid slice retry orders", async () => {
    const config = await createWorkflow(projectRoot, "slice-retry-invalid", "I", "failed");
    await writeSliceExecutionState(config, {
      featureId: "slice-retry-invalid",
      current_slice_order: 1,
      updatedAt: "2026-04-29T10:00:00.000Z",
      slices: [
        {
          slice_name: "failed-slice",
          slice_order: 1,
          status: "failed",
          attempts: 1,
          model_tier: "standard",
        },
      ],
    });

    const result = await runCli([
      "node",
      "qrspi",
      "slice",
      "retry",
      "--root",
      projectRoot,
      "--feature",
      config.featureId,
      "--slice",
      "9",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Slice order not found: 9");
  });
});
