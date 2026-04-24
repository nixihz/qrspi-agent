import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SessionConfig, WorkflowState, EngineState } from "../../src/workflow/types.js";
import {
  initializeSessionDirectories,
  readWorkflowState,
  writeWorkflowState,
  readEngineState,
  writeEngineState,
  readArtifact,
  writeArtifact,
  createInitialWorkflowState,
  createInitialEngineState,
  createRunDir,
  writeRunFile,
  transitionWorkflowState,
  listFeatures,
} from "../../src/storage/file-repository.js";

function createTempConfig(): SessionConfig {
  const tmpDir = mkdtempSync(join(tmpdir(), "qrspi-test-"));
  return {
    featureId: "test-feature",
    projectRoot: tmpDir,
    outputDir: ".qrspi",
  };
}

describe("file-repository", () => {
  let config: SessionConfig;

  beforeEach(() => {
    config = createTempConfig();
  });

  afterEach(() => {
    rmSync(config.projectRoot, { recursive: true, force: true });
  });

  it("initializes directory structure", async () => {
    const layout = await initializeSessionDirectories(config);
    expect(layout.sessionDir).toContain("test-feature");
    expect(layout.stateFile).toContain("state.json");
    expect(layout.engineStateFile).toContain("engine_state.json");
    expect(layout.artifactsDir).toContain("artifacts");
    expect(layout.runsDir).toContain("runs");
  });

  it("creates initial workflow state", async () => {
    const state = createInitialWorkflowState(config);
    expect(state.featureId).toBe("test-feature");
    expect(state.currentStage).toBe("Q");
    expect(state.status).toBe("idle");
  });

  it("creates initial engine state", async () => {
    const state = createInitialEngineState(config);
    expect(state.featureId).toBe("test-feature");
    expect(state.currentStage).toBe("Q");
    expect(state.status).toBe("ready");
    expect(state.approvals).toEqual([]);
    expect(state.history).toEqual([]);
  });

  it("writes and reads workflow state", async () => {
    await initializeSessionDirectories(config);
    const state: WorkflowState = {
      featureId: "test-feature",
      currentStage: "R",
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeWorkflowState(config, state);
    const read = await readWorkflowState(config);
    expect(read).not.toBeNull();
    expect(read!.currentStage).toBe("R");
    expect(read!.featureId).toBe("test-feature");
  });

  it("writes and reads engine state", async () => {
    await initializeSessionDirectories(config);
    const state: EngineState = {
      featureId: "test-feature",
      currentStage: "D",
      status: "waiting_approval",
      approvals: [{ stage: "D", approvedAt: new Date().toISOString() }],
      stage_attempts: { Q: 1, R: 1, D: 1 },
      history: [],
      updatedAt: new Date().toISOString(),
    };
    await writeEngineState(config, state);
    const read = await readEngineState(config);
    expect(read).not.toBeNull();
    expect(read!.currentStage).toBe("D");
    expect(read!.status).toBe("waiting_approval");
    expect(read!.approvals).toHaveLength(1);
  });

  it("writes and reads artifacts", async () => {
    await initializeSessionDirectories(config);
    const artifact = {
      stage: "Q" as const,
      title: "Test Questions",
      content: "# Questions\n\n1. What?",
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    };
    await writeArtifact(config, artifact);
    const read = await readArtifact(config, "Q");
    expect(read).not.toBeNull();
    expect(read!.content).toContain("Questions");
  });

  it("creates run directories and files", async () => {
    await initializeSessionDirectories(config);
    const runDir = await createRunDir(config, "Q_20240101_attempt1");
    expect(runDir).toContain("runs");
    await writeRunFile(runDir, "test.json", { foo: "bar" });
    await writeRunFile(runDir, "test.txt", "hello world");
  });

  it("transitions workflow state", () => {
    const state: WorkflowState = {
      featureId: "test",
      currentStage: "Q",
      status: "idle",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };
    const next = transitionWorkflowState(state, "R", "ready");
    expect(next.currentStage).toBe("R");
    expect(next.status).toBe("ready");
    expect(next.updatedAt).not.toBe(state.updatedAt);
  });

  it("lists features in stable featureId order", async () => {
    const alphaConfig: SessionConfig = { ...config, featureId: "alpha-feature" };
    const zetaConfig: SessionConfig = { ...config, featureId: "zeta-feature" };

    await initializeSessionDirectories(zetaConfig);
    await writeWorkflowState(zetaConfig, createInitialWorkflowState(zetaConfig));
    await writeEngineState(zetaConfig, createInitialEngineState(zetaConfig));

    await initializeSessionDirectories(alphaConfig);
    await writeWorkflowState(alphaConfig, createInitialWorkflowState(alphaConfig));
    await writeEngineState(alphaConfig, createInitialEngineState(alphaConfig));

    const features = await listFeatures(config.projectRoot, config.outputDir);
    expect(features.map((feature) => feature.featureId)).toEqual([
      "alpha-feature",
      "zeta-feature",
    ]);
  });
});
