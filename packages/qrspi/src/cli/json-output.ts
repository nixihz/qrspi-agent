import { readFile, readdir } from "fs/promises";
import { isAbsolute, join, relative } from "path";

import type { RunSingleStageResult } from "../engine/engine.js";
import { buildArtifactFilename, buildStructuredFilename, resolveFileStoreLayout } from "../storage/path-resolver.js";
import type {
  ContextPack,
  EngineState,
  GateReviewRecord,
  SessionConfig,
  StageCode,
  ValidationResult,
  WorkflowState,
} from "../workflow/types.js";
import { getNextStage, getStageDefinition, getStageDescription, isGateStage } from "../workflow/stage-schema.js";

interface CommandErrorInput {
  command: string;
  code: string;
  message: string;
  feature?: string;
  features?: string[];
}

function toProjectRelative(config: SessionConfig, path: string): string {
  if (!isAbsolute(path)) return path;
  const rel = relative(config.projectRoot, path);
  return rel.startsWith("..") ? path : rel;
}

function gateReviewEnvelope(config: SessionConfig, review: GateReviewRecord) {
  return {
    ...review,
    sourceFile: review.sourceFile ? toProjectRelative(config, review.sourceFile) : undefined,
    reviewPath: review.reviewPath ? toProjectRelative(config, review.reviewPath) : undefined,
  };
}

function gateReviewsEnvelope(config: SessionConfig, engineState: EngineState) {
  const reviews = (engineState.gate_reviews ?? []).map((review) =>
    gateReviewEnvelope(config, review),
  );
  return {
    latest: reviews.at(-1),
    history: reviews,
  };
}

function stageStatus(state: WorkflowState, engineState: EngineState): string {
  return engineState.status || state.status;
}

function stageEnvelope(state: WorkflowState, engineState: EngineState) {
  const def = getStageDefinition(state.currentStage);
  return {
    code: state.currentStage,
    name: def.name,
    type: def.kind,
    is_gate: def.gateRequired,
    status: stageStatus(state, engineState),
  };
}

function nextAction(state: WorkflowState, engineState: EngineState) {
  if (engineState.status === "waiting_approval" && isGateStage(state.currentStage)) {
    return {
      kind: "human_gate_review",
      message: `Review and approve or reject the ${state.currentStage} artifact.`,
    };
  }

  if (engineState.status === "failed") {
    return {
      kind: "inspect_failure",
      message: engineState.lastError || "Inspect the failed stage output and rerun after fixing it.",
    };
  }

  if (engineState.status === "blocked" || engineState.status === "needs_context") {
    return {
      kind: engineState.status,
      message: engineState.lastError || `Stage ${state.currentStage} requires human assistance.`,
    };
  }

  if (engineState.status === "completed") {
    return {
      kind: "complete",
      message: "Workflow is complete.",
    };
  }

  return {
    kind: "run_stage",
    message: `Run stage ${state.currentStage}.`,
  };
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

export async function buildArtifactsEnvelope(
  config: SessionConfig,
  stage: StageCode,
): Promise<{ latest?: string; structured?: string }> {
  const layout = resolveFileStoreLayout(config);
  const artifact = await latestMatchingFile(layout.artifactsDir, `${stage}_`);
  const structured = await latestMatchingFile(layout.structuredDir, `${stage}_`);

  return {
    latest: artifact
      ? toProjectRelative(config, join(layout.artifactsDir, artifact))
      : toProjectRelative(config, `${layout.artifactsDir}/${buildArtifactFilename(stage)}`),
    structured: structured
      ? toProjectRelative(config, join(layout.structuredDir, structured))
      : toProjectRelative(config, `${layout.structuredDir}/${buildStructuredFilename(stage)}`),
  };
}

export async function buildStatusJson(
  command: string,
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
) {
  return {
    ok: true,
    command,
    feature: config.featureId,
    stage: stageEnvelope(state, engineState),
    next_action: nextAction(state, engineState),
    artifacts: await buildArtifactsEnvelope(config, state.currentStage),
    gate_reviews: gateReviewsEnvelope(config, engineState),
    validation: {
      passed: engineState.status !== "failed",
      warnings: [],
    },
  };
}

export async function buildStageJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
) {
  return {
    ok: true,
    command: "stage",
    feature: config.featureId,
    stage: {
      ...stageEnvelope(state, engineState),
      description: getStageDescription(state.currentStage),
      next: getNextStage(state.currentStage),
    },
    next_action: nextAction(state, engineState),
    artifacts: await buildArtifactsEnvelope(config, state.currentStage),
  };
}

export function buildListJson(features: Array<{ featureId: string; currentStage: string; status: string }>) {
  return {
    ok: true,
    command: "list",
    features: features.map((feature) => ({
      feature: feature.featureId,
      stage: feature.currentStage,
      status: feature.status,
    })),
  };
}

export function buildContextJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
  context: ContextPack,
) {
  return {
    ok: true,
    command: "context",
    feature: config.featureId,
    stage: stageEnvelope(state, engineState),
    context: {
      current_stage: context.currentStage,
      dependency_count: context.dependencies.length,
      max_lines_per_artifact: context.maxLinesPerArtifact,
      utilization_target: context.utilizationTarget,
      dependencies: context.dependencies.map((dep) => ({
        stage: dep.stage,
        artifact: toProjectRelative(config, dep.artifactPath),
        summary: dep.summary,
      })),
    },
  };
}

function validationJson(validation: ValidationResult) {
  return {
    passed: validation.valid,
    summary: validation.summary,
    warnings: validation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
    issues: validation.issues,
  };
}

async function runnerOutputForResult(config: SessionConfig, result: RunSingleStageResult) {
  const latestHistory = result.engineState.history.at(-1);
  if (!latestHistory?.runDir) return undefined;

  const stdoutPath = `${latestHistory.runDir}/runner_stdout.txt`;
  const stderrPath = `${latestHistory.runDir}/runner_stderr.txt`;
  return {
    stdout_file: toProjectRelative(config, stdoutPath),
    stderr_file: toProjectRelative(config, stderrPath),
    stdout: await readFile(stdoutPath, "utf-8").catch(() => ""),
    stderr: await readFile(stderrPath, "utf-8").catch(() => ""),
  };
}

export async function buildRunJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
  results: RunSingleStageResult[],
  includeRunnerOutput = false,
) {
  const resultItems = [];
  for (const result of results) {
    const latestHistory = result.engineState.history.at(-1);
    const item: Record<string, unknown> = {
      stage: result.artifact?.stage ?? result.workflowState.currentStage,
      success:
        result.validation.valid &&
        result.engineState.status !== "failed" &&
        result.engineState.status !== "blocked" &&
        result.engineState.status !== "needs_context",
      status: result.engineState.status,
      validation: validationJson(result.validation),
      artifact: result.artifact
        ? toProjectRelative(config, result.artifact.artifactPath)
        : undefined,
      run_dir: latestHistory?.runDir ? toProjectRelative(config, latestHistory.runDir) : undefined,
    };

    if (includeRunnerOutput) {
      item.runner_output = await runnerOutputForResult(config, result);
    }

    resultItems.push(item);
  }

  return {
    ok: results.every(
      (result) =>
        result.validation.valid &&
        result.engineState.status !== "failed" &&
        result.engineState.status !== "blocked" &&
        result.engineState.status !== "needs_context",
    ),
    command: "run",
    feature: config.featureId,
    stage: stageEnvelope(state, engineState),
    next_action: nextAction(state, engineState),
    artifacts: await buildArtifactsEnvelope(config, state.currentStage),
    results: resultItems,
  };
}

export function buildApproveJson(
  config: SessionConfig,
  approvedStage: StageCode,
  state: WorkflowState,
  engineState: EngineState,
) {
  return {
    ok: true,
    command: "approve",
    feature: config.featureId,
    approved_stage: approvedStage,
    stage: stageEnvelope(state, engineState),
    next_action: nextAction(state, engineState),
    gate_review: gateReviewsEnvelope(config, engineState).latest,
  };
}

export function buildRejectJson(
  config: SessionConfig,
  rejectedStage: StageCode,
  state: WorkflowState,
  engineState: EngineState,
) {
  return {
    ok: true,
    command: "reject",
    feature: config.featureId,
    rejected_stage: rejectedStage,
    stage: stageEnvelope(state, engineState),
    next_action: nextAction(state, engineState),
    gate_review: gateReviewsEnvelope(config, engineState).latest,
  };
}

export function buildErrorJson(input: CommandErrorInput) {
  return {
    ok: false,
    command: input.command,
    feature: input.feature,
    error: {
      code: input.code,
      message: input.message,
      features: input.features,
    },
  };
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
