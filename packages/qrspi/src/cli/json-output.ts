import { readFile, readdir } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";

import type { RunSingleStageResult } from "../engine/engine.js";
import {
  createInitialEngineState,
  createInitialWorkflowState,
  readArtifact,
  readEngineState,
  readGateReviewRecords,
  readStructuredArtifact,
  resolveArtifactPointer,
  readWorkflowState,
} from "../storage/file-repository.js";
import type {
  ApprovalRecord,
  ArtifactPointer,
  CliErrorEnvelope,
  CliResponseEnvelope,
  ContextPack,
  ContextCommandData,
  CurrentGateContext,
  EngineState,
  FeatureListItem,
  GateDecisionCommandData,
  GateReviewItem,
  GateReviewRecord,
  GateStageCode,
  ListCommandData,
  NextActionSummary,
  OutputFormat,
  RunCommandData,
  SessionConfig,
  StageCode,
  StageCommandData,
  StageRunSummary,
  StageSummary,
  StatusCommandData,
  ValidationResult,
  ValidationSummary,
  WorkflowState,
  WorkflowStatusSummary,
} from "../workflow/types.js";
import { getNextStage, getStageDefinition, getStageDescription, getStageOrder, isGateStage } from "../workflow/stage-schema.js";

interface CommandErrorInput {
  command: string;
  code: string;
  message: string;
  feature?: string;
  details?: Record<string, unknown>;
}

const CONTEXT_SWITCH_THRESHOLD_PERCENT = 60;

function toProjectRelative(config: SessionConfig, path: string): string {
  if (!isAbsolute(path)) return path;
  const rel = relative(config.projectRoot, path);
  return rel.startsWith("..") ? path : rel;
}

function relativizeArtifactPointer(config: SessionConfig, pointer: ArtifactPointer): ArtifactPointer {
  return {
    ...pointer,
    path: toProjectRelative(config, pointer.path),
  };
}

function relativizeApprovalRecord(record: ApprovalRecord): ApprovalRecord {
  return { ...record };
}

function relativizeGateReviewRecord(config: SessionConfig, record: GateReviewRecord): GateReviewRecord {
  return {
    ...record,
    artifact: relativizeArtifactPointer(config, record.artifact),
    structured_artifact: record.structured_artifact
      ? relativizeArtifactPointer(config, record.structured_artifact)
      : undefined,
    review_path: record.review_path ? toProjectRelative(config, record.review_path) : undefined,
    source_file: record.source_file ? toProjectRelative(config, record.source_file) : undefined,
  };
}

function stageAttempts(stage: StageCode, engineState: EngineState): number {
  return engineState.stage_attempts[stage]
    ?? engineState.history.filter((entry) => entry.stage === stage).length;
}

function buildWorkflowSummary(
  state: WorkflowState,
  engineState: EngineState,
): WorkflowStatusSummary {
  const waitingForGate = engineState.status === "waiting_approval" && isGateStage(state.currentStage);
  return {
    feature_id: state.featureId,
    current_stage: state.currentStage,
    engine_status: engineState.status || state.status,
    waiting_for_gate: waitingForGate,
    current_gate: waitingForGate ? state.currentStage as GateStageCode : undefined,
    last_error: engineState.lastError || undefined,
    updated_at: engineState.updatedAt,
  };
}

function buildStageSummary(
  stage: StageCode,
  workflowStatus: WorkflowStatusSummary,
  engineState: EngineState,
): StageSummary {
  const def = getStageDefinition(stage);
  return {
    code: stage,
    name: def.name,
    description: getStageDescription(stage),
    is_gate: def.gateRequired,
    status: stage === workflowStatus.current_stage ? workflowStatus.engine_status : "idle",
    attempts: stageAttempts(stage, engineState),
  };
}

function nextAction(state: WorkflowState, engineState: EngineState): NextActionSummary {
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

function validationSummaryFromValidation(validation: ValidationResult): ValidationSummary {
  return {
    valid: validation.valid,
    errors: validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
    warnings: validation.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

async function readValidationSummaryForStage(
  config: SessionConfig,
  engineState: EngineState,
  stage: StageCode,
): Promise<ValidationSummary | undefined> {
  const latestRun = [...engineState.history]
    .filter((entry) => entry.stage === stage)
    .sort((left, right) => left.attempt - right.attempt)
    .at(-1);
  if (!latestRun) return undefined;

  try {
    const validation = JSON.parse(
      await readFile(join(latestRun.runDir, "validation.json"), "utf-8"),
    ) as ValidationResult;
    return validationSummaryFromValidation(validation);
  } catch {
    return undefined;
  }
}

function extractSectionItems(content: string, headings: string[]): string[] {
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, "gim");
    const sections: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const bodyStart = match.index + match[0].length;
      const remainder = content.slice(bodyStart);
      const nextHeading = /^#{1,6}\s+/m.exec(remainder);
      const body = nextHeading
        ? remainder.slice(0, nextHeading.index).trim()
        : remainder.trim();
      if (body) {
        sections.push(body);
      }
    }

    if (sections.length === 0) continue;

    return sections.flatMap((body) =>
      body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return line.slice(2).trim();
          }
          return line;
        }),
    );
  }

  return [];
}

function extractCodeSymbols(content: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

export function extractGateReviewItems(
  stage: GateStageCode,
  markdown: string,
  structured?: unknown,
): GateReviewItem[] {
  const items: GateReviewItem[] = [];
  const data = (structured && typeof structured === "object")
    ? structured as Record<string, unknown>
    : {};

  if (stage === "D") {
    const structuredDecisions = Array.isArray(data.decisions) ? data.decisions : [];
    const structuredPending = Array.isArray(data.pending_confirmations) ? data.pending_confirmations : [];
    const goals = extractSectionItems(markdown, ["Goals", "目标"]);
    const nonGoals = extractSectionItems(markdown, ["Non-Goals", "Non Goals", "非目标"]);
    const recommended = extractSectionItems(markdown, ["Recommended Approach", "推荐方案"]);
    const rejected = Array.isArray(data.rejected_alternatives)
      ? data.rejected_alternatives as string[]
      : extractSectionItems(markdown, ["Rejected Alternatives", "拒绝的备选方案"]);
    const risks = Array.isArray(data.risks)
      ? data.risks as string[]
      : extractSectionItems(markdown, ["Risks", "Risks and Mitigations", "风险", "风险与缓解"]);

    goals.forEach((text, index) => {
      items.push({ id: `goal-${index + 1}`, label: "Goal", status: "confirmed", source: "markdown", text });
    });
    nonGoals.forEach((text, index) => {
      items.push({ id: `non-goal-${index + 1}`, label: "Non-goal", status: "confirmed", source: "markdown", text });
    });
    recommended.forEach((text, index) => {
      items.push({ id: `recommended-${index + 1}`, label: "Recommended approach", status: "confirmed", source: "markdown", text });
    });
    structuredDecisions.forEach((text, index) => {
      items.push({
        id: `decision-${index + 1}`,
        label: "Decision",
        status: "confirmed",
        source: "structured",
        text: String(text),
      });
    });
    rejected.forEach((text, index) => {
      items.push({
        id: `rejected-${index + 1}`,
        label: "Rejected alternative",
        status: "confirmed",
        source: Array.isArray(data.rejected_alternatives) ? "structured" : "markdown",
        text: String(text),
      });
    });
    risks.forEach((text, index) => {
      items.push({
        id: `risk-${index + 1}`,
        label: "Risk",
        status: "unknown",
        source: Array.isArray(data.risks) ? "structured" : "markdown",
        text: String(text),
      });
    });
    structuredPending.forEach((text, index) => {
      items.push({
        id: `pending-${index + 1}`,
        label: "Pending confirmation",
        status: "pending",
        source: "structured",
        text: String(text),
      });
    });
  }

  if (stage === "S") {
    const interfaces = Array.isArray(data.interfaces)
      ? data.interfaces
      : extractCodeSymbols(markdown, /^\s*export\s+interface\s+([A-Za-z0-9_]+)/gm);
    const types = Array.isArray(data.types)
      ? data.types
      : extractCodeSymbols(markdown, /^\s*export\s+type\s+([A-Za-z0-9_]+)/gm);
    const functions = Array.isArray(data.functions)
      ? data.functions
      : extractCodeSymbols(markdown, /^\s*export\s+function\s+([A-Za-z0-9_]+)/gm);
    const constraints = Array.isArray(data.constraints)
      ? data.constraints
      : extractSectionItems(markdown, ["Architecture Constraints", "Boundaries", "约束", "边界"]);

    interfaces.forEach((text, index) => {
      items.push({
        id: `interface-${index + 1}`,
        label: "Interface",
        status: "confirmed",
        source: Array.isArray(data.interfaces) ? "structured" : "markdown",
        text: String(text),
      });
    });
    types.forEach((text, index) => {
      items.push({
        id: `type-${index + 1}`,
        label: "Type",
        status: "confirmed",
        source: Array.isArray(data.types) ? "structured" : "markdown",
        text: String(text),
      });
    });
    functions.forEach((text, index) => {
      items.push({
        id: `function-${index + 1}`,
        label: "Function",
        status: "confirmed",
        source: Array.isArray(data.functions) ? "structured" : "markdown",
        text: String(text),
      });
    });
    constraints.forEach((text, index) => {
      items.push({
        id: `constraint-${index + 1}`,
        label: "Boundary",
        status: "unknown",
        source: Array.isArray(data.constraints) ? "structured" : "markdown",
        text: String(text),
      });
    });
  }

  if (stage === "PR") {
    const checklist = Array.isArray(data.review_checklist)
      ? data.review_checklist
      : extractSectionItems(markdown, ["Review Checklist", "Code Review Checklist", "审查清单"]);
    const changes = Array.isArray(data.changes)
      ? data.changes
      : extractSectionItems(markdown, ["Change Summary", "变更摘要"]);
    const tests = Array.isArray(data.tests)
      ? data.tests
      : extractSectionItems(markdown, ["Tests", "Test Coverage", "测试", "测试覆盖"]);

    checklist.forEach((text, index) => {
      const normalizedText = String(text);
      const status = normalizedText.includes("[x]") || normalizedText.includes("[X]")
        ? "confirmed"
        : normalizedText.includes("[ ]")
          ? "pending"
          : "unknown";
      items.push({
        id: `checklist-${index + 1}`,
        label: "Review checklist",
        status,
        source: Array.isArray(data.review_checklist) ? "structured" : "markdown",
        text: normalizedText,
      });
    });
    changes.forEach((text, index) => {
      items.push({
        id: `change-${index + 1}`,
        label: "Change",
        status: "confirmed",
        source: Array.isArray(data.changes) ? "structured" : "markdown",
        text: String(text),
      });
    });
    tests.forEach((text, index) => {
      items.push({
        id: `test-${index + 1}`,
        label: "Test evidence",
        status: "confirmed",
        source: Array.isArray(data.tests) ? "structured" : "markdown",
        text: String(text),
      });
    });
  }

  return items;
}

export async function resolveCurrentGateContext(
  config: SessionConfig,
): Promise<CurrentGateContext | undefined> {
  const workflowState = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState = (await readEngineState(config)) ?? createInitialEngineState(config);
  if (!isGateStage(workflowState.currentStage) || engineState.status !== "waiting_approval") {
    return undefined;
  }

  const stage = workflowState.currentStage as GateStageCode;
  const markdownArtifact = await resolveArtifactPointer(config, stage, "markdown");
  const structuredArtifact = await resolveArtifactPointer(config, stage, "structured");
  const markdown = await readArtifact(config, stage);
  const structured = await readStructuredArtifact<Record<string, unknown>>(config, stage);
  const validation = await readValidationSummaryForStage(config, engineState, stage);

  return {
    stage,
    markdown_artifact: relativizeArtifactPointer(config, markdownArtifact),
    structured_artifact: structuredArtifact.exists
      ? relativizeArtifactPointer(config, structuredArtifact)
      : undefined,
    review_items: extractGateReviewItems(stage, markdown?.content ?? "", structured),
    validation,
  };
}

export function isJsonOutputRequested(options: { json?: unknown; output?: unknown }): boolean {
  return options.json === true || options.output === "json";
}

export function createCliEnvelope<TData>(
  command: string,
  result: {
    ok: boolean;
    featureId?: string;
    data?: TData;
    error?: CliErrorEnvelope;
  },
): CliResponseEnvelope<TData> {
  return {
    schema_version: "1",
    ok: result.ok,
    command,
    feature_id: result.featureId,
    timestamp: new Date().toISOString(),
    data: result.data,
    error: result.error,
  };
}

export function writeCliResponse<TData>(
  envelope: CliResponseEnvelope<TData>,
  format: OutputFormat,
): void {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${String(envelope.data ?? "")}\n`);
}

export async function buildArtifactsEnvelope(
  config: SessionConfig,
  stage: StageCode,
): Promise<ArtifactPointer[]> {
  const pointers = await Promise.all([
    resolveArtifactPointer(config, stage, "markdown"),
    resolveArtifactPointer(config, stage, "structured"),
    resolveArtifactPointer(config, stage, "run_parsed"),
  ]);
  return pointers.map((pointer) => relativizeArtifactPointer(config, pointer));
}

export async function buildStatusJson(
  command: string,
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
): Promise<CliResponseEnvelope<StatusCommandData>> {
  const workflow = buildWorkflowSummary(state, engineState);
  const stages = getStageOrder().map((stage) => buildStageSummary(stage, workflow, engineState));
  const artifacts = await buildArtifactsEnvelope(config, state.currentStage);
  const currentGateContext = await resolveCurrentGateContext(config);
  const latestGateReview = (await readGateReviewRecords(config)).at(-1);

  const data: StatusCommandData = {
    workflow,
    stages,
    approvals: engineState.approvals.map(relativizeApprovalRecord),
    latest_gate_review: latestGateReview
      ? relativizeGateReviewRecord(config, latestGateReview)
      : undefined,
    current_gate_context: currentGateContext,
    artifacts,
    next_action: nextAction(state, engineState),
  };

  return createCliEnvelope(command, {
    ok: true,
    featureId: config.featureId,
    data,
  });
}

export async function buildStageJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
): Promise<CliResponseEnvelope<StageCommandData>> {
  const workflow = buildWorkflowSummary(state, engineState);
  const data: StageCommandData = {
    stage: buildStageSummary(state.currentStage, workflow, engineState),
    workflow,
    next_action: nextAction(state, engineState),
    artifacts: await buildArtifactsEnvelope(config, state.currentStage),
  };

  return createCliEnvelope("stage", {
    ok: true,
    featureId: config.featureId,
    data,
  });
}

export function buildListJson(
  features: Array<{ featureId: string; currentStage: string; status: string }>,
): CliResponseEnvelope<ListCommandData> {
  const data: ListCommandData = {
    features: features.map((feature) => ({
      feature_id: feature.featureId,
      current_stage: feature.currentStage as StageCode,
      status: feature.status as FeatureListItem["status"],
    })),
  };

  return createCliEnvelope("list", {
    ok: true,
    data,
  });
}

export function buildInitJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
): CliResponseEnvelope<{
  workflow: WorkflowStatusSummary;
  next_action: NextActionSummary;
}> {
  return createCliEnvelope("init", {
    ok: true,
    featureId: config.featureId,
    data: {
      workflow: buildWorkflowSummary(state, engineState),
      next_action: nextAction(state, engineState),
    },
  });
}

export async function buildContextJson(
  config: SessionConfig,
  state: WorkflowState,
  context: ContextPack,
): Promise<CliResponseEnvelope<ContextCommandData>> {
  const dependencies = await Promise.all(
    context.dependencies.map((dep) => resolveArtifactPointer(config, dep.stage, "markdown")),
  );

  const data: ContextCommandData = {
    current_stage: state.currentStage,
    dependencies: dependencies.map((pointer) => relativizeArtifactPointer(config, pointer)),
    context_budget: {
      target_max_percent: Math.round(context.utilizationTarget * 100),
      switch_threshold_percent: CONTEXT_SWITCH_THRESHOLD_PERCENT,
    },
  };

  return createCliEnvelope("context", {
    ok: true,
    featureId: config.featureId,
    data,
  });
}

async function runnerOutputForResult(
  config: SessionConfig,
  result: RunSingleStageResult,
): Promise<StageRunSummary["runner_output"] | undefined> {
  const latestHistory = result.engineState.history.at(-1);
  if (!latestHistory?.runDir) return undefined;

  const stdoutPath = join(latestHistory.runDir, "runner_stdout.txt");
  const stderrPath = join(latestHistory.runDir, "runner_stderr.txt");
  return {
    stdout_file: toProjectRelative(config, stdoutPath),
    stderr_file: toProjectRelative(config, stderrPath),
    stdout: await readFile(stdoutPath, "utf-8").catch(() => ""),
    stderr: await readFile(stderrPath, "utf-8").catch(() => ""),
  };
}

async function buildRunSummaryItem(
  config: SessionConfig,
  result: RunSingleStageResult,
  includeRunnerOutput: boolean,
): Promise<StageRunSummary> {
  const stage = result.artifact?.stage ?? result.workflowState.currentStage;
  const attempt = result.engineState.stage_attempts[stage]
    ?? result.engineState.history.filter((entry) => entry.stage === stage).length;
  const artifact = await resolveArtifactPointer(config, stage, "markdown");
  const structuredArtifact = await resolveArtifactPointer(config, stage, "structured");

  return {
    stage,
    attempt,
    validation: validationSummaryFromValidation(result.validation),
    artifact: relativizeArtifactPointer(config, artifact),
    structured_artifact: structuredArtifact.exists
      ? relativizeArtifactPointer(config, structuredArtifact)
      : undefined,
    runner_output: includeRunnerOutput
      ? await runnerOutputForResult(config, result)
      : undefined,
  };
}

export async function buildRunJson(
  config: SessionConfig,
  state: WorkflowState,
  engineState: EngineState,
  results: RunSingleStageResult[],
  includeRunnerOutput = false,
): Promise<CliResponseEnvelope<RunCommandData>> {
  const executedStages = await Promise.all(
    results.map((result) => buildRunSummaryItem(config, result, includeRunnerOutput)),
  );
  const workflow = buildWorkflowSummary(state, engineState);
  const data: RunCommandData = {
    workflow,
    executed_stages: executedStages,
    stopped_at_gate: workflow.waiting_for_gate ? workflow.current_gate : undefined,
    next_action: nextAction(state, engineState),
  };

  const ok = results.every(
    (result) =>
      result.validation.valid &&
      result.engineState.status !== "failed" &&
      result.engineState.status !== "blocked" &&
      result.engineState.status !== "needs_context",
  );

  return createCliEnvelope("run", {
    ok,
    featureId: config.featureId,
    data,
  });
}

async function latestGateReviewForStage(
  config: SessionConfig,
  stage: GateStageCode,
): Promise<GateReviewRecord | undefined> {
  return (await readGateReviewRecords(config, stage)).at(-1);
}

export async function buildApproveJson(
  config: SessionConfig,
  approvedStage: GateStageCode,
  state: WorkflowState,
  engineState: EngineState,
): Promise<CliResponseEnvelope<GateDecisionCommandData>> {
  const reviewRecord = await latestGateReviewForStage(config, approvedStage);
  return createCliEnvelope("approve", {
    ok: true,
    featureId: config.featureId,
    data: {
      workflow: buildWorkflowSummary(state, engineState),
      review_record: reviewRecord
        ? relativizeGateReviewRecord(config, reviewRecord)
        : {
          id: `${approvedStage}-missing-review`,
          feature_id: config.featureId,
          stage: approvedStage,
          decision: "approved",
          reviewed_at: new Date().toISOString(),
          input_source: "none",
          artifact: relativizeArtifactPointer(
            config,
            await resolveArtifactPointer(config, approvedStage, "markdown"),
          ),
        },
    },
  });
}

export async function buildRejectJson(
  config: SessionConfig,
  rejectedStage: GateStageCode,
  state: WorkflowState,
  engineState: EngineState,
): Promise<CliResponseEnvelope<GateDecisionCommandData>> {
  const reviewRecord = await latestGateReviewForStage(config, rejectedStage);
  return createCliEnvelope("reject", {
    ok: true,
    featureId: config.featureId,
    data: {
      workflow: buildWorkflowSummary(state, engineState),
      review_record: reviewRecord
        ? relativizeGateReviewRecord(config, reviewRecord)
        : {
          id: `${rejectedStage}-missing-review`,
          feature_id: config.featureId,
          stage: rejectedStage,
          decision: "rejected",
          reviewed_at: new Date().toISOString(),
          input_source: "none",
          artifact: relativizeArtifactPointer(
            config,
            await resolveArtifactPointer(config, rejectedStage, "markdown"),
          ),
        },
    },
  });
}

export function buildRewindJson(
  config: SessionConfig,
  workflow: WorkflowStatusSummary,
  targetStage: StageCode,
): CliResponseEnvelope<{
  workflow: WorkflowStatusSummary;
  target_stage: StageCode;
}> {
  return createCliEnvelope("rewind", {
    ok: true,
    featureId: config.featureId,
    data: {
      workflow,
      target_stage: targetStage,
    },
  });
}

export function buildAdvanceJson(
  config: SessionConfig,
  workflow: WorkflowStatusSummary,
): CliResponseEnvelope<{
  workflow: WorkflowStatusSummary;
}> {
  return createCliEnvelope("advance", {
    ok: true,
    featureId: config.featureId,
    data: {
      workflow,
    },
  });
}

export function buildErrorJson(input: CommandErrorInput): CliResponseEnvelope<never> {
  return createCliEnvelope(input.command, {
    ok: false,
    featureId: input.feature,
    error: {
      code: input.code,
      message: input.message,
      details: input.details,
    },
  });
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function readReviewTextInput(input: {
  inline?: string;
  file?: string;
  projectRoot?: string;
}): Promise<{ text?: string; source: "inline" | "file" | "none" }> {
  if (input.file) {
    const path = input.projectRoot ? resolve(input.projectRoot, input.file) : input.file;
    return {
      text: await readFile(path, "utf-8"),
      source: "file",
    };
  }

  if (input.inline?.trim()) {
    return {
      text: input.inline,
      source: "inline",
    };
  }

  return { source: "none" };
}

export function classifyCliError(error: unknown): CliErrorEnvelope {
  if (error instanceof Error) {
    return {
      code: "CLI_ERROR",
      message: error.message,
    };
  }

  return {
    code: "CLI_ERROR",
    message: String(error),
  };
}

export function getCanonicalPluginSourceRoot(projectRoot: string): string {
  return join(projectRoot, "skills");
}

export function resolvePluginSkillPath(pluginRoot: string, skillName: string): string {
  return join(pluginRoot, "skills", skillName, "SKILL.md");
}

export function resolvePluginHookConfigPath(pluginRoot: string): string {
  return join(pluginRoot, "hooks", "qrspi-hooks.json");
}

export function resolvePluginScriptPath(pluginRoot: string, scriptName: string): string {
  return join(pluginRoot, "scripts", scriptName);
}
