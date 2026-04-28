import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { initWorkflow } from "../../src/engine/engine.js";
import { main } from "../../src/cli/main.js";
import {
  readEngineState,
  readWorkflowState,
  writeEngineState,
  writeWorkflowState,
} from "../../src/storage/file-repository.js";
import { resolveFileStoreLayout } from "../../src/storage/path-resolver.js";
import type { EngineState, SessionConfig, WorkflowState } from "../../src/workflow/types.js";

function createConfig(projectRoot: string, featureId: string): SessionConfig {
  return {
    featureId,
    projectRoot,
    outputDir: ".qrspi",
  };
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

describe("gate review e2e", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "qrspi-gate-review-e2e-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reads a DESIGN gate through status JSON and persists an approval review", async () => {
    const featureId = "json-cli-output";
    const config = createConfig(projectRoot, featureId);
    await initWorkflow(config);

    const now = new Date().toISOString();
    const workflowState: WorkflowState = {
      featureId,
      currentStage: "D",
      status: "waiting_approval",
      createdAt: now,
      updatedAt: now,
    };
    const engineState: EngineState = {
      featureId,
      currentStage: "D",
      status: "waiting_approval",
      approvals: [],
      gate_reviews: [],
      stage_attempts: { Q: 1, R: 1, D: 1 },
      history: [
        {
          stage: "D",
          attempt: 1,
          startedAt: now,
          finishedAt: now,
          runDir: join(projectRoot, ".qrspi", featureId, "runs", "D_20260428_100000_attempt1"),
          success: true,
        },
      ],
      lastError: "",
      updatedAt: now,
    };
    await writeWorkflowState(config, workflowState);
    await writeEngineState(config, engineState);

    const layout = resolveFileStoreLayout(config);
    mkdirSync(layout.artifactsDir, { recursive: true });
    mkdirSync(layout.structuredDir, { recursive: true });
    writeFileSync(
      join(layout.artifactsDir, "D_2026-04-28.md"),
      [
        "# D - Design Discussion",
        "",
        "## Goals",
        "- Add stable JSON output for QRSPI CLI commands.",
        "",
        "## Recommended Approach",
        "- Add `--output text|json` and `--json` alias to the CLI.",
        "- Keep the CLI as the source of truth for state and artifacts.",
        "",
        "## Rejected Alternatives",
        "- Do not add MCP for this MVP.",
        "",
        "## Risks",
        "- JSON schema stability must be documented.",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(layout.structuredDir, "D_2026-04-28.json"),
      JSON.stringify({
        stage: "D",
        decisions: ["Use CLI JSON output", "Do not add MCP for MVP"],
      }, null, 2),
      "utf-8",
    );

    const statusResult = await runCli([
      "node",
      "qrspi",
      "status",
      "--root",
      projectRoot,
      "--feature",
      featureId,
      "--json",
    ]);
    const statusPayload = JSON.parse(statusResult.stdout) as {
      stage: { code: string; is_gate: boolean; status: string };
      next_action: { kind: string };
      artifacts: { latest: string; structured: string };
    };

    expect(statusResult.code).toBe(0);
    expect(statusResult.stderr).toBe("");
    expect(statusPayload.stage).toMatchObject({
      code: "D",
      is_gate: true,
      status: "waiting_approval",
    });
    expect(statusPayload.next_action.kind).toBe("human_gate_review");
    expect(readFileSync(join(projectRoot, statusPayload.artifacts.latest), "utf-8")).toContain("Recommended Approach");
    expect(readFileSync(join(projectRoot, statusPayload.artifacts.structured), "utf-8")).toContain("Use CLI JSON output");

    const reviewNote = join(projectRoot, "design-gate-review.md");
    writeFileSync(
      reviewNote,
      [
        "# DESIGN Gate Review",
        "",
        "Decision: approved with notes",
        "",
        "Confirmed:",
        "- Use CLI JSON output as the primary structured interface.",
        "- Do not add MCP for this MVP.",
        "",
        "Requested follow-up:",
        "- Keep JSON schemas documented and stable.",
      ].join("\n"),
      "utf-8",
    );

    const approveResult = await runCli([
      "node",
      "qrspi",
      "approve",
      "D",
      "--root",
      projectRoot,
      "--feature",
      featureId,
      "--note-file",
      reviewNote,
      "--json",
    ]);
    const approvePayload = JSON.parse(approveResult.stdout) as {
      ok: boolean;
      approved_stage: string;
      stage: { code: string; status: string };
      gate_review?: { decision: string; reviewPath?: string; note?: string };
    };
    const approvedWorkflowState = await readWorkflowState(config);
    const approvedEngineState = await readEngineState(config);

    expect(approveResult.code).toBe(0);
    expect(approvePayload.ok).toBe(true);
    expect(approvePayload.approved_stage).toBe("D");
    expect(approvePayload.stage.code).toBe("S");
    expect(approvePayload.gate_review).toMatchObject({
      decision: "approved",
      reviewPath: expect.stringContaining(`.qrspi/${featureId}/gate_reviews/D_`),
    });
    expect(approvePayload.gate_review?.note).toContain("Decision: approved with notes");
    expect(approvedWorkflowState?.currentStage).toBe("S");
    expect(approvedEngineState?.gate_reviews?.[0]?.reviewPath).toBeDefined();
    expect(readFileSync(approvedEngineState?.gate_reviews?.[0]?.reviewPath ?? "", "utf-8")).toContain("Keep JSON schemas documented");
  });
});
