import { readFile, writeFile, mkdir, access, readdir } from "fs/promises";
import { join } from "path";
import type {
  SessionConfig,
  WorkflowState,
  EngineState,
  StageArtifact,
  WorkTree,
  FileStoreLayout,
  StageCode,
  SessionStatus,
} from "../workflow/types.js";
import { resolveFileStoreLayout, buildArtifactFilename } from "./path-resolver.js";
import { getStageName } from "../workflow/stage-schema.js";

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const content = await readFile(file, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeSessionDirectories(
  config: SessionConfig,
): Promise<FileStoreLayout> {
  const layout = resolveFileStoreLayout(config);
  await ensureDir(layout.sessionDir);
  await ensureDir(layout.artifactsDir);
  await ensureDir(layout.runsDir);
  await ensureDir(layout.slicesDir);
  await ensureDir(layout.sessionsDir);
  await ensureDir(layout.structuredDir);
  await ensureDir(layout.promptsDir);
  return layout;
}

export async function readWorkflowState(
  config: SessionConfig,
): Promise<WorkflowState | null> {
  const layout = resolveFileStoreLayout(config);
  const raw = await readJson<{
    current_stage: StageCode;
    feature_id: string;
    timestamp: string;
    stage_name?: string;
  }>(layout.stateFile);

  if (!raw) return null;

  return {
    featureId: raw.feature_id,
    currentStage: raw.current_stage,
    status: "idle",
    createdAt: raw.timestamp,
    updatedAt: raw.timestamp,
  };
}

export async function writeWorkflowState(
  config: SessionConfig,
  state: WorkflowState,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  const now = new Date().toISOString();
  await writeJson(layout.stateFile, {
    current_stage: state.currentStage,
    feature_id: state.featureId,
    timestamp: now,
    stage_name: getStageName(state.currentStage),
  });
}

export async function readEngineState(
  config: SessionConfig,
): Promise<EngineState | null> {
  const layout = resolveFileStoreLayout(config);
  const raw = await readJson<Partial<EngineState>>(layout.engineStateFile);
  if (!raw) return null;

  return {
    featureId: raw.featureId ?? config.featureId,
    currentStage: raw.currentStage ?? "Q",
    status: raw.status ?? "idle",
    approvals: raw.approvals ?? [],
    stage_attempts: raw.stage_attempts ?? {},
    history: raw.history ?? [],
    lastError: raw.lastError ?? "",
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

export async function writeEngineState(
  config: SessionConfig,
  state: EngineState,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  await writeJson(layout.engineStateFile, {
    ...state,
    updated_at: new Date().toISOString(),
  });
}

export async function writeArtifact(
  config: SessionConfig,
  artifact: StageArtifact,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  const filename = buildArtifactFilename(artifact.stage);
  const artifactPath = join(layout.artifactsDir, filename);
  await writeFile(artifactPath, artifact.content, "utf-8");
}

export async function readArtifact(
  config: SessionConfig,
  stage: StageCode,
): Promise<StageArtifact | null> {
  const layout = resolveFileStoreLayout(config);
  const filename = buildArtifactFilename(stage);
  const artifactPath = join(layout.artifactsDir, filename);

  if (!(await exists(artifactPath))) return null;

  const content = await readFile(artifactPath, "utf-8");
  return {
    stage,
    title: `${stage} Artifact`,
    content,
    generatedAt: new Date().toISOString(),
    artifactPath,
  };
}

export async function writeWorkTree(
  config: SessionConfig,
  workTree: WorkTree,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  const workTreePath = join(layout.slicesDir, "work_tree.json");
  await writeJson(workTreePath, workTree);
}

export async function readWorkTree(
  config: SessionConfig,
): Promise<WorkTree | null> {
  const layout = resolveFileStoreLayout(config);
  const workTreePath = join(layout.slicesDir, "work_tree.json");
  return readJson<WorkTree>(workTreePath);
}

export async function createRunDir(
  config: SessionConfig,
  runDirName: string,
): Promise<string> {
  const layout = resolveFileStoreLayout(config);
  const runDir = join(layout.runsDir, runDirName);
  await ensureDir(runDir);
  return runDir;
}

export async function writeRunFile(
  runDir: string,
  filename: string,
  content: string | object,
): Promise<void> {
  const path = join(runDir, filename);
  if (typeof content === "string") {
    await writeFile(path, content, "utf-8");
  } else {
    await writeJson(path, content);
  }
}

export function createInitialWorkflowState(config: SessionConfig): WorkflowState {
  const now = new Date().toISOString();
  return {
    featureId: config.featureId,
    currentStage: "Q",
    status: "idle",
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialEngineState(config: SessionConfig): EngineState {
  const now = new Date().toISOString();
  return {
    featureId: config.featureId,
    currentStage: "Q",
    status: "ready",
    approvals: [],
    stage_attempts: {},
    history: [],
    lastError: "",
    updatedAt: now,
  };
}

export function transitionWorkflowState(
  state: WorkflowState,
  nextStage: StageCode,
  status: SessionStatus,
): WorkflowState {
  return {
    ...state,
    currentStage: nextStage,
    status,
    updatedAt: new Date().toISOString(),
  };
}

export async function listFeatures(projectRoot: string, outputDir: string): Promise<Array<{ featureId: string; currentStage: string; status: string }>> {
  const qrspiDir = join(projectRoot, outputDir);
  const features: Array<{ featureId: string; currentStage: string; status: string }> = [];
  try {
    const dirs = await readdir(qrspiDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const state = await readJson<{ current_stage?: string; feature_id?: string; timestamp?: string }>(join(qrspiDir, d.name, "state.json"));
      const engine = await readJson<{ status?: string }>(join(qrspiDir, d.name, "engine_state.json"));
      if (state) {
        features.push({
          featureId: state.feature_id ?? d.name,
          currentStage: state.current_stage ?? "?",
          status: engine?.status ?? "unknown",
        });
      }
    }
  } catch {
    // no .qrspi dir
  }
  return features;
}
