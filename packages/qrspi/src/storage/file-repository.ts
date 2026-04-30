import { access, mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";

import type {
  ApprovalRecord,
  ArtifactPointer,
  EngineState,
  FileStoreLayout,
  GateDecision,
  GateReviewRecord,
  GateStageCode,
  SessionConfig,
  SessionStatus,
  SliceExecutionRecord,
  SliceExecutionState,
  StageArtifact,
  StageCode,
  WorkTree,
  WorkflowState,
} from "../workflow/types.js";
import {
  buildArtifactFilename,
  buildGateReviewFilename,
  buildStructuredFilename,
  resolveFileStoreLayout,
} from "./path-resolver.js";
import { getStageName, isGateStage } from "../workflow/stage-schema.js";

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

async function getUpdatedAt(path: string): Promise<string | undefined> {
  try {
    const meta = await stat(path);
    return meta.mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function latestMatchingFile(dir: string, prefix: string): Promise<string | undefined> {
  try {
    const files = await readdir(dir);
    return files
      .filter((file) => file.startsWith(prefix))
      .sort()
      .at(-1);
  } catch {
    return undefined;
  }
}

function normalizeApprovalRecord(record: Partial<ApprovalRecord> & {
  stage?: StageCode;
  approvedAt?: string;
  approvedBy?: string;
}): ApprovalRecord | null {
  if (!record.stage || !isGateStage(record.stage)) {
    return null;
  }

  return {
    stage: record.stage,
    approved_at: record.approved_at ?? record.approvedAt ?? new Date().toISOString(),
    approved_by: record.approved_by ?? record.approvedBy,
    comment: record.comment,
  };
}

function fallbackArtifactPointer(
  config: SessionConfig,
  stage: GateStageCode,
  kind: ArtifactPointer["kind"],
): ArtifactPointer {
  const layout = resolveFileStoreLayout(config);
  const filePath = kind === "structured"
    ? join(layout.structuredDir, buildStructuredFilename(stage))
    : join(layout.artifactsDir, buildArtifactFilename(stage));

  return {
    stage,
    kind,
    path: filePath,
    exists: false,
  };
}

function normalizeGateReviewRecord(
  config: SessionConfig,
  record: Partial<GateReviewRecord> & {
    stage?: StageCode;
    decision?: GateDecision;
    recordedAt?: string;
    sourceFile?: string;
    reviewPath?: string;
  },
): GateReviewRecord | null {
  if (!record.stage || !isGateStage(record.stage) || !record.decision) {
    return null;
  }

  const artifact = record.artifact ?? fallbackArtifactPointer(config, record.stage, "markdown");
  const structuredArtifact = record.structured_artifact
    ?? (record.structured_artifact === null ? undefined : fallbackArtifactPointer(config, record.stage, "structured"));
  const reviewedAt = record.reviewed_at ?? record.recordedAt ?? new Date().toISOString();
  const sourceFile = record.source_file ?? record.sourceFile;
  const reviewPath = record.review_path ?? record.reviewPath;
  const inputSource = record.input_source
    ?? (sourceFile ? "file" : (record.note || record.feedback ? "inline" : "none"));

  return {
    id: record.id ?? `${record.stage}-${record.decision}-${reviewedAt}`,
    feature_id: record.feature_id ?? config.featureId,
    stage: record.stage,
    decision: record.decision,
    reviewed_at: reviewedAt,
    reviewed_by: record.reviewed_by,
    note: record.note,
    feedback: record.feedback,
    input_source: inputSource,
    artifact,
    structured_artifact: structuredArtifact,
    review_path: reviewPath,
    source_file: sourceFile,
  };
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
  await ensureDir(layout.gateReviewsDir);
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
  const raw = await readJson<Record<string, unknown>>(layout.engineStateFile);
  if (!raw) return null;

  const approvals = Array.isArray(raw.approvals)
    ? raw.approvals
      .map((record) => normalizeApprovalRecord(record as Partial<ApprovalRecord> & {
        stage?: StageCode;
        approvedAt?: string;
        approvedBy?: string;
      }))
      .filter((record): record is ApprovalRecord => record !== null)
    : [];

  const gateReviews = Array.isArray(raw.gate_reviews)
    ? raw.gate_reviews
      .map((record) => normalizeGateReviewRecord(config, record as Partial<GateReviewRecord> & {
        stage?: StageCode;
        decision?: GateDecision;
        recordedAt?: string;
        sourceFile?: string;
        reviewPath?: string;
      }))
      .filter((record): record is GateReviewRecord => record !== null)
    : [];

  return {
    featureId: typeof raw.featureId === "string" ? raw.featureId : config.featureId,
    currentStage: (raw.currentStage as StageCode | undefined) ?? "Q",
    status: (raw.status as SessionStatus | undefined) ?? "idle",
    approvals,
    gate_reviews: gateReviews,
    stage_attempts: (raw.stage_attempts as Partial<Record<StageCode, number>> | undefined) ?? {},
    history: Array.isArray(raw.history) ? raw.history as EngineState["history"] : [],
    lastError: typeof raw.lastError === "string" ? raw.lastError : "",
    lastContextError: raw.lastContextError as EngineState["lastContextError"],
    updatedAt: typeof raw.updatedAt === "string"
      ? raw.updatedAt
      : typeof raw.updated_at === "string"
        ? raw.updated_at
        : new Date().toISOString(),
  };
}

export async function writeEngineState(
  config: SessionConfig,
  state: EngineState,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  const updatedAt = state.updatedAt || new Date().toISOString();
  await writeJson(layout.engineStateFile, {
    ...state,
    updatedAt,
    updated_at: updatedAt,
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
  const pointer = await resolveArtifactPointer(config, stage, "markdown");
  if (!pointer.exists) return null;

  const content = await readFile(pointer.path, "utf-8");
  return {
    stage,
    title: `${stage} Artifact`,
    content,
    generatedAt: pointer.updated_at ?? new Date().toISOString(),
    artifactPath: pointer.path,
  };
}

export async function readStructuredArtifact<TStructured = unknown>(
  config: SessionConfig,
  stage: StageCode,
): Promise<TStructured | undefined> {
  const pointer = await resolveArtifactPointer(config, stage, "structured");
  if (!pointer.exists) return undefined;

  return (await readJson<TStructured>(pointer.path)) ?? undefined;
}

export async function resolveArtifactPointer(
  config: SessionConfig,
  stage: StageCode,
  kind: ArtifactPointer["kind"],
): Promise<ArtifactPointer> {
  const layout = resolveFileStoreLayout(config);

  if (kind === "run_parsed") {
    const engineState = (await readEngineState(config)) ?? createInitialEngineState(config);
    const latestRun = [...engineState.history]
      .filter((entry) => entry.stage === stage)
      .sort((left, right) => left.attempt - right.attempt)
      .at(-1);
    const path = latestRun
      ? join(latestRun.runDir, "parsed_artifact.json")
      : join(layout.runsDir, `${stage}_latest`, "parsed_artifact.json");
    return {
      stage,
      kind,
      path,
      exists: await exists(path),
      updated_at: await getUpdatedAt(path),
    };
  }

  const dir = kind === "structured" ? layout.structuredDir : layout.artifactsDir;
  const fallbackPath = kind === "structured"
    ? join(dir, buildStructuredFilename(stage))
    : join(dir, buildArtifactFilename(stage));
  const filename = await latestMatchingFile(dir, `${stage}_`);
  const path = filename ? join(dir, filename) : fallbackPath;

  return {
    stage,
    kind,
    path,
    exists: await exists(path),
    updated_at: await getUpdatedAt(path),
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

export async function writeSliceExecutionState(
  config: SessionConfig,
  state: SliceExecutionState,
): Promise<void> {
  const layout = resolveFileStoreLayout(config);
  await ensureDir(layout.slicesDir);
  const statePath = join(layout.slicesDir, "slice_state.json");
  await writeJson(statePath, state);
}

export async function readSliceExecutionState(
  config: SessionConfig,
): Promise<SliceExecutionState | null> {
  const layout = resolveFileStoreLayout(config);
  const statePath = join(layout.slicesDir, "slice_state.json");
  return readJson<SliceExecutionState>(statePath);
}

export function isSliceRetryable(record: SliceExecutionRecord): boolean {
  return record.status !== "running";
}

export async function resetSliceExecutionState(
  config: SessionConfig,
  targetOrder: number,
): Promise<SliceExecutionState> {
  const existing = await readSliceExecutionState(config);
  if (!existing) {
    throw new Error("No slice execution state recorded");
  }

  const targetIndex = existing.slices.findIndex((slice) => slice.slice_order === targetOrder);
  const target = existing.slices[targetIndex];
  if (!target) {
    throw new Error(`Slice order not found: ${targetOrder}`);
  }
  if (!isSliceRetryable(target)) {
    throw new Error(`Slice ${targetOrder} is currently running and cannot be retried`);
  }

  const slices = [...existing.slices];
  slices[targetIndex] = {
    slice_name: target.slice_name,
    slice_order: target.slice_order,
    status: "pending",
    attempts: target.attempts,
    model_tier: target.model_tier,
  };

  const updated: SliceExecutionState = {
    ...existing,
    current_slice_order: targetOrder,
    slices,
    updatedAt: new Date().toISOString(),
  };
  await writeSliceExecutionState(config, updated);
  return updated;
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

export async function writeGateReviewFile(
  config: SessionConfig,
  stage: StageCode,
  decision: GateDecision,
  content: string,
): Promise<string> {
  const layout = resolveFileStoreLayout(config);
  await ensureDir(layout.gateReviewsDir);
  const reviewPath = join(layout.gateReviewsDir, buildGateReviewFilename(stage, decision));
  await writeFile(reviewPath, content, "utf-8");
  return reviewPath;
}

export async function readGateReviewRecords(
  config: SessionConfig,
  stage?: GateStageCode,
): Promise<GateReviewRecord[]> {
  const engineState = (await readEngineState(config)) ?? createInitialEngineState(config);
  const records = engineState.gate_reviews
    .filter((record) => (stage ? record.stage === stage : true))
    .sort((left, right) => left.reviewed_at.localeCompare(right.reviewed_at));

  return Promise.all(records.map(async (record) => {
    const artifact = await resolveArtifactPointer(config, record.stage, "markdown");
    const structuredArtifact = await resolveArtifactPointer(config, record.stage, "structured");
    return {
      ...record,
      artifact,
      structured_artifact: structuredArtifact.exists ? structuredArtifact : undefined,
    };
  }));
}

export async function persistGateReviewRecord(
  config: SessionConfig,
  record: GateReviewRecord,
): Promise<void> {
  const engineState = (await readEngineState(config)) ?? createInitialEngineState(config);
  const newEngineState: EngineState = {
    ...engineState,
    gate_reviews: [...engineState.gate_reviews, record],
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, newEngineState);
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
    gate_reviews: [],
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

export async function listFeatures(
  projectRoot: string,
  outputDir: string,
): Promise<Array<{ featureId: string; currentStage: string; status: string }>> {
  const qrspiDir = join(projectRoot, outputDir);
  const features: Array<{ featureId: string; currentStage: string; status: string }> = [];

  try {
    const dirs = await readdir(qrspiDir, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;

      const state = await readJson<{ current_stage?: string; feature_id?: string }>(
        join(qrspiDir, dirent.name, "state.json"),
      );
      const engine = await readJson<{ status?: string }>(
        join(qrspiDir, dirent.name, "engine_state.json"),
      );

      if (!state) continue;

      features.push({
        featureId: state.feature_id ?? dirent.name,
        currentStage: state.current_stage ?? "?",
        status: engine?.status ?? "unknown",
      });
    }
  } catch {
    // no .qrspi dir
  }

  return features.sort((left, right) => left.featureId.localeCompare(right.featureId));
}
