import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import type {
  GateDecisionInput,
  GateReviewRecord,
  GateStageCode,
  ImplementationStatus,
  ModelResolution,
  SessionConfig,
  SessionStatus,
  WorkflowState,
  EngineState,
  StageArtifact,
  ValidationResult,
  Runner,
  RunnerOptions,
  SliceDefinition,
  SliceExecutionRecord,
  SliceExecutionState,
  ContextOverBudgetError,
  ContextBudgetStatus,
  BudgetedContextPack,
  StageCode,
  RunWorkflowOptions,
  Lang,
  WorkflowInputMetadata,
} from "../workflow/types.js";
import {
  getNextStage,
  isGateStage,
  getStageName,
  getStageIndex,
} from "../workflow/stage-schema.js";
import {
  readWorkflowState,
  writeWorkflowState,
  readEngineState,
  writeEngineState,
  writeArtifact,
  readArtifact,
  readWorkTree,
  writeWorkTree,
  readSliceExecutionState,
  writeSliceExecutionState,
  initializeSessionDirectories,
  createInitialWorkflowState,
  createInitialEngineState,
  createRunDir,
  writeRunFile,
  transitionWorkflowState,
  writeGateReviewFile,
  resolveArtifactPointer,
} from "../storage/file-repository.js";
import { resolveFileStoreLayout, buildRunDirName, buildSliceRunDirName } from "../storage/path-resolver.js";
import { buildBudgetedContextPack } from "../context/context-builder.js";
import {
  assertContextWithinThreshold,
  buildRunnerContextBudgetMeta,
  updateContextBudgetForPrompt,
} from "../context/context-budget.js";
import { createPromptRegistry, renderStagePrompt } from "../prompts/template-registry.js";
import { validateStageArtifact } from "../validators/stage-validator.js";
import { parseStageOutput, type ParsedArtifact } from "../parsers/artifact-parser.js";
import { resolveRunnerModelForTier, resolveSliceModelTier } from "../runner/model-resolver.js";

export interface RunSingleStageResult {
  workflowState: WorkflowState;
  engineState: EngineState;
  artifact?: StageArtifact;
  validation: ValidationResult;
  sliceResults?: SliceExecutionRecord[];
}

export async function runSingleStage(
  config: SessionConfig,
  workflowState: WorkflowState,
  engineState: EngineState,
  runner: Runner,
  userInput?: string,
  lang: Lang = "en",
  runnerOptions: RunnerOptions = {},
  workflowInput?: WorkflowInputMetadata,
  contextMode: RunWorkflowOptions["contextMode"] = "layered",
): Promise<RunSingleStageResult> {
  const stage = workflowState.currentStage;
  if (stage === "I") {
    const workTree = await readWorkTree(config);
    if (workTree?.slices?.length) {
      return runImplementationSlices(
        config,
        workflowState,
        engineState,
        runner,
        workTree.slices,
        userInput,
        lang,
        runnerOptions,
        workflowInput,
        contextMode,
      );
    }
  }

  const attempt = (engineState.stage_attempts[stage] ?? 0) + 1;
  const runDirName = buildRunDirName(stage, attempt);
  const runDir = await createRunDir(config, runDirName);
  const startedAt = new Date().toISOString();

  const updatedEngineState: EngineState = {
    ...engineState,
    stage_attempts: { ...engineState.stage_attempts, [stage]: attempt },
  };

  try {
    const contextPack = await buildBudgetedContextPack(stage, config, {
      workflowInput,
      budgetConfig: { mode: contextMode },
    });
    const runContextPack = workflowInput && workflowInput.input_source !== "none"
      ? { ...contextPack, workflow_input: workflowInput }
      : contextPack;

    const registry = createPromptRegistry();
    const initialPrompt = renderStagePrompt(registry, {
      featureId: config.featureId,
      stage,
      userInput,
      workflowInput,
      context: runContextPack,
      lang,
    });
    const budget = updateContextBudgetForPrompt(runContextPack.budget, initialPrompt);
    const finalizedContextPack = { ...runContextPack, budget };
    const prompt = renderStagePrompt(registry, {
      featureId: config.featureId,
      stage,
      userInput,
      workflowInput,
      context: finalizedContextPack,
      lang,
    });

    await writeRunFile(runDir, "prompt.md", prompt);
    await writeRunFile(runDir, "context.json", finalizedContextPack);
    await writeRunFile(runDir, "live_stdout.txt", "");
    await writeRunFile(runDir, "live_stderr.txt", "");

    const contextError = assertContextWithinThreshold(stage, finalizedContextPack.budget);
    if (contextError) {
      const blockedEngineState: EngineState = {
        ...updatedEngineState,
        status: "needs_context",
        lastError: contextError.message,
        lastContextError: contextError,
        history: [
          ...updatedEngineState.history,
          {
            stage,
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            runDir,
            success: false,
            contextBudgetStatus: finalizedContextPack.budget.status,
            contextBudgetWarnings: finalizedContextPack.budget.warnings.length,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      await writeEngineState(config, blockedEngineState);
      const blockedWorkflowState = transitionWorkflowState(workflowState, stage, "needs_context");
      await writeWorkflowState(config, blockedWorkflowState);

      return {
        workflowState: blockedWorkflowState,
        engineState: blockedEngineState,
        validation: {
          stage,
          valid: false,
          issues: [{ severity: "error", message: contextError.message }],
          summary: `Context over budget: ${contextError.message}`,
        },
      };
    }

    const preconditionFailure = getStagePreconditionFailure(stage, updatedEngineState);
    if (preconditionFailure) {
      throw new Error(preconditionFailure);
    }

    const runnerResult = await runner.run({
      prompt,
      cwd: config.projectRoot,
      stage,
      options: {
        ...runnerOptions,
        liveStdoutPath: join(runDir, "live_stdout.txt"),
        liveStderrPath: join(runDir, "live_stderr.txt"),
      },
    });

    await writeRunFile(runDir, "runner_stdout.txt", runnerResult.stdout);
    await writeRunFile(runDir, "runner_stderr.txt", runnerResult.stderr);
    await writeRunFile(runDir, "runner_meta.json", {
      ok: runnerResult.exitCode === 0,
      exit_code: runnerResult.exitCode,
      live_stdout_file: join(runDir, "live_stdout.txt"),
      live_stderr_file: join(runDir, "live_stderr.txt"),
      context_budget: buildRunnerContextBudgetMeta(finalizedContextPack.budget),
      ...runnerResult.meta,
    });

    const content = runnerResult.stdout;
    const validation = validateStageArtifact(stage, content);
    await writeRunFile(runDir, "validation.json", validation);

    if (!validation.valid) {
      const failedEngineState: EngineState = {
        ...updatedEngineState,
        status: "failed",
        lastError: validation.summary,
        history: [
          ...updatedEngineState.history,
          {
            stage,
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            runDir,
            success: false,
            contextBudgetStatus: finalizedContextPack.budget.status,
            contextBudgetWarnings: finalizedContextPack.budget.warnings.length,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      await writeEngineState(config, failedEngineState);
      const failedWorkflowState = transitionWorkflowState(workflowState, stage, "failed");
      await writeWorkflowState(config, failedWorkflowState);

      return {
        workflowState: failedWorkflowState,
        engineState: failedEngineState,
        validation,
      };
    }

    const layout = resolveFileStoreLayout(config);
    const artifact: StageArtifact = {
      stage,
      title: `${stage} - ${getStageName(stage)}`,
      content,
      generatedAt: new Date().toISOString(),
      artifactPath: join(layout.artifactsDir, `${stage}_${new Date().toISOString().slice(0, 10)}.md`),
    };
    await writeArtifact(config, artifact);

    const parsedArtifact = parseStageOutput(stage, content);
    await writeRunFile(runDir, "parsed_artifact.json", parsedArtifact);
    const structuredFilename = `${stage}_${new Date().toISOString().slice(0, 10)}.json`;
    await writeRunFile(layout.structuredDir, structuredFilename, parsedArtifact);

    if (stage === "W") {
      try {
        const workTree = JSON.parse(content);
        await writeWorkTree(config, workTree);
      } catch {
        // not valid JSON, skip
      }
    }

    const reportedStatus = getReportedStageStatus(stage, parsedArtifact);
    if (reportedStatus === "BLOCKED" || reportedStatus === "NEEDS_CONTEXT") {
      const pausedEngineState: EngineState = {
        ...updatedEngineState,
        status: reportedStatus === "BLOCKED" ? "blocked" : "needs_context",
        lastError: `Stage ${stage} reported ${reportedStatus}`,
        history: [
          ...updatedEngineState.history,
          {
            stage,
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            runDir,
            success: false,
            contextBudgetStatus: finalizedContextPack.budget.status,
            contextBudgetWarnings: finalizedContextPack.budget.warnings.length,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      await writeEngineState(config, pausedEngineState);

      const pausedWorkflowState = transitionWorkflowState(
        workflowState,
        stage,
        pausedEngineState.status,
      );
      await writeWorkflowState(config, pausedWorkflowState);

      return {
        workflowState: pausedWorkflowState,
        engineState: pausedEngineState,
        artifact,
        validation,
      };
    }

    const successEngineState: EngineState = {
      ...updatedEngineState,
      status: isGateStage(stage) ? "waiting_approval" : "ready",
      lastError: "",
      lastContextError: undefined,
      history: [
        ...updatedEngineState.history,
        {
          stage,
          attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          runDir,
          success: true,
          contextBudgetStatus: finalizedContextPack.budget.status,
          contextBudgetWarnings: finalizedContextPack.budget.warnings.length,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await writeEngineState(config, successEngineState);

    const nextStatus = isGateStage(stage) ? "waiting_approval" : "idle";
    const successWorkflowState = transitionWorkflowState(workflowState, stage, nextStatus);
    await writeWorkflowState(config, successWorkflowState);

    return {
      workflowState: successWorkflowState,
      engineState: successEngineState,
      artifact,
      validation,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const failedEngineState: EngineState = {
      ...updatedEngineState,
      status: "failed",
      lastError: errMsg,
      history: [
        ...updatedEngineState.history,
        {
          stage,
          attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          runDir,
          success: false,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await writeEngineState(config, failedEngineState);
    const failedWorkflowState = transitionWorkflowState(workflowState, stage, "failed");
    await writeWorkflowState(config, failedWorkflowState);

    return {
      workflowState: failedWorkflowState,
      engineState: failedEngineState,
      validation: {
        stage,
        valid: false,
        issues: [{ severity: "error", message: errMsg }],
        summary: `Execution failed: ${errMsg}`,
      },
    };
  }
}

async function runImplementationSlices(
  config: SessionConfig,
  workflowState: WorkflowState,
  engineState: EngineState,
  runner: Runner,
  slices: SliceDefinition[],
  userInput?: string,
  lang: Lang = "en",
  runnerOptions: RunnerOptions = {},
  workflowInput?: WorkflowInputMetadata,
  contextMode: RunWorkflowOptions["contextMode"] = "layered",
): Promise<RunSingleStageResult> {
  const stage: StageCode = "I";
  const stageAttempt = (engineState.stage_attempts[stage] ?? 0) + 1;
  const startedAt = new Date().toISOString();
  const baseEngineState: EngineState = {
    ...engineState,
    stage_attempts: { ...engineState.stage_attempts, [stage]: stageAttempt },
  };
  let sliceState = await prepareSliceExecutionState(config, slices);

  for (const slice of sortedSlices(slices)) {
    const recordIndex = sliceState.slices.findIndex(
      (record) => record.slice_order === slice.order && record.slice_name === slice.name,
    );
    const currentRecord = sliceState.slices[recordIndex];
    if (!currentRecord) continue;
    if (currentRecord.status === "completed") continue;

    const sliceAttempt = currentRecord.attempts + 1;
    const modelTier = resolveSliceModelTier(slice);
    const modelResolution = resolveRunnerModelForTier(runner.name, modelTier, runnerOptions.model);
    const runDirName = buildSliceRunDirName(slice.order, slice.name, sliceAttempt);
    const runDir = await createRunDir(config, runDirName);
    const sliceStartedAt = new Date().toISOString();

    sliceState = updateSliceRecord(sliceState, recordIndex, {
      status: "running",
      attempts: sliceAttempt,
      currentRunDir: runDir,
      startedAt: sliceStartedAt,
      modelTier,
      runnerName: runner.name,
      modelResolution,
    });
    await writeSliceExecutionState(config, sliceState);

    const contextPack = await buildSliceContextPack(stage, config, workflowInput, contextMode);
    const prompt = buildSliceImplementationPrompt({
      config,
      slice,
      slices,
      sliceState,
      contextPack,
      userInput,
      workflowInput,
      lang,
    });
    const budget = updateContextBudgetForPrompt(contextPack.budget, prompt);
    const finalizedContextPack = {
      ...contextPack,
      budget,
      slice_execution: {
        current_slice: slice,
        state: sliceState,
        model_resolution: modelResolution,
      },
    };

    await writeRunFile(runDir, "prompt.md", prompt);
    await writeRunFile(runDir, "context.json", finalizedContextPack);
    await writeRunFile(runDir, "live_stdout.txt", "");
    await writeRunFile(runDir, "live_stderr.txt", "");

    const contextError = assertContextWithinThreshold(stage, budget);
    if (contextError) {
      sliceState = updateSliceRecord(sliceState, recordIndex, {
        status: "needs_context",
        finishedAt: new Date().toISOString(),
        validation: {
          stage,
          valid: false,
          issues: [{ severity: "error", message: contextError.message }],
          summary: `Context over budget: ${contextError.message}`,
        },
        lastError: contextError.message,
      });
      await writeSliceExecutionState(config, sliceState);

      const failedEngineState = buildSlicePausedEngineState(
        baseEngineState,
        "needs_context",
        stage,
        stageAttempt,
        startedAt,
        runDir,
        contextError.message,
        budget.status,
        budget.warnings.length,
        contextError,
      );
      await writeEngineState(config, failedEngineState);
      const failedWorkflowState = transitionWorkflowState(workflowState, stage, "needs_context");
      await writeWorkflowState(config, failedWorkflowState);

      return {
        workflowState: failedWorkflowState,
        engineState: failedEngineState,
        validation: sliceState.slices[recordIndex]?.validation ?? {
          stage,
          valid: false,
          issues: [{ severity: "error", message: contextError.message }],
          summary: `Context over budget: ${contextError.message}`,
        },
        sliceResults: sliceState.slices,
      };
    }

    const runnerResult = await runner.run({
      prompt,
      cwd: config.projectRoot,
      stage,
      options: {
        ...runnerOptions,
        model: modelResolution.model,
        modelTier,
        liveStdoutPath: join(runDir, "live_stdout.txt"),
        liveStderrPath: join(runDir, "live_stderr.txt"),
      },
    });

    await writeRunFile(runDir, "runner_stdout.txt", runnerResult.stdout);
    await writeRunFile(runDir, "runner_stderr.txt", runnerResult.stderr);
    await writeRunFile(runDir, "runner_meta.json", {
      ok: runnerResult.exitCode === 0,
      exit_code: runnerResult.exitCode,
      live_stdout_file: join(runDir, "live_stdout.txt"),
      live_stderr_file: join(runDir, "live_stderr.txt"),
      context_budget: buildRunnerContextBudgetMeta(budget),
      slice: {
        name: slice.name,
        order: slice.order,
        model_tier: modelTier,
        model_resolution: modelResolution,
      },
      ...runnerResult.meta,
    });

    const validation = validateStageArtifact(stage, runnerResult.stdout);
    await writeRunFile(runDir, "validation.json", validation);
    const parsedArtifact = parseStageOutput(stage, runnerResult.stdout);
    await writeRunFile(runDir, "parsed_artifact.json", parsedArtifact);
    const reportedStatus = getReportedStageStatus(stage, parsedArtifact);
    const sliceStatus = toSliceExecutionStatus(validation, reportedStatus);
    const lastError = validation.valid ? "" : validation.summary;

    sliceState = updateSliceRecord(sliceState, recordIndex, {
      status: sliceStatus,
      finishedAt: new Date().toISOString(),
      validation,
      reportedStatus,
      lastError,
    });
    await writeSliceExecutionState(config, sliceState);

    if (sliceStatus !== "completed") {
      const failedEngineStatus = sliceStatus === "blocked" || sliceStatus === "needs_context"
        ? sliceStatus
        : "failed";
      const failedEngineState = buildSlicePausedEngineState(
        baseEngineState,
        failedEngineStatus,
        stage,
        stageAttempt,
        startedAt,
        runDir,
        lastError || `Slice ${slice.name} reported ${reportedStatus ?? "failure"}`,
        budget.status,
        budget.warnings.length,
      );
      await writeEngineState(config, failedEngineState);
      const failedWorkflowState = transitionWorkflowState(workflowState, stage, failedEngineStatus);
      await writeWorkflowState(config, failedWorkflowState);

      return {
        workflowState: failedWorkflowState,
        engineState: failedEngineState,
        validation,
        sliceResults: sliceState.slices,
      };
    }
  }

  const aggregateRunDir = await createRunDir(config, buildRunDirName(stage, stageAttempt));
  const completedOutputs = await readCompletedSliceOutputs(sliceState);
  const aggregateContent = buildAggregatedImplementationArtifact(sliceState, completedOutputs);
  const aggregateValidation = validateStageArtifact(stage, aggregateContent);
  await writeRunFile(aggregateRunDir, "prompt.md", "Aggregated from completed slice implementation runs.");
  await writeRunFile(aggregateRunDir, "context.json", { slice_execution: sliceState });
  await writeRunFile(aggregateRunDir, "runner_stdout.txt", aggregateContent);
  await writeRunFile(aggregateRunDir, "runner_stderr.txt", "");
  await writeRunFile(aggregateRunDir, "runner_meta.json", {
    ok: aggregateValidation.valid,
    exit_code: 0,
    runner: runner.name,
    aggregation: "slice_execution",
    slices: sliceState.slices.map((record) => ({
      name: record.slice_name,
      order: record.slice_order,
      status: record.status,
      attempts: record.attempts,
      run_dir: record.run_dir,
      model_tier: record.model_tier,
      model: record.model,
    })),
  });
  await writeRunFile(aggregateRunDir, "validation.json", aggregateValidation);
  const aggregateParsedArtifact = parseStageOutput(stage, aggregateContent);
  await writeRunFile(aggregateRunDir, "parsed_artifact.json", aggregateParsedArtifact);

  if (!aggregateValidation.valid) {
    const failedEngineState = buildSlicePausedEngineState(
      baseEngineState,
      "failed",
      stage,
      stageAttempt,
      startedAt,
      aggregateRunDir,
      aggregateValidation.summary,
    );
    await writeEngineState(config, failedEngineState);
    const failedWorkflowState = transitionWorkflowState(workflowState, stage, "failed");
    await writeWorkflowState(config, failedWorkflowState);
    return {
      workflowState: failedWorkflowState,
      engineState: failedEngineState,
      validation: aggregateValidation,
      sliceResults: sliceState.slices,
    };
  }

  const layout = resolveFileStoreLayout(config);
  const artifact: StageArtifact = {
    stage,
    title: `${stage} - ${getStageName(stage)}`,
    content: aggregateContent,
    generatedAt: new Date().toISOString(),
    artifactPath: join(layout.artifactsDir, `${stage}_${new Date().toISOString().slice(0, 10)}.md`),
  };
  await writeArtifact(config, artifact);
  await writeRunFile(layout.structuredDir, `${stage}_${new Date().toISOString().slice(0, 10)}.json`, aggregateParsedArtifact);

  const successEngineState: EngineState = {
    ...baseEngineState,
    status: "ready",
    lastError: "",
    lastContextError: undefined,
    history: [
      ...baseEngineState.history,
      {
        stage,
        attempt: stageAttempt,
        startedAt,
        finishedAt: new Date().toISOString(),
        runDir: aggregateRunDir,
        success: true,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, successEngineState);

  const successWorkflowState = transitionWorkflowState(workflowState, stage, "idle");
  await writeWorkflowState(config, successWorkflowState);

  return {
    workflowState: successWorkflowState,
    engineState: successEngineState,
    artifact,
    validation: aggregateValidation,
    sliceResults: sliceState.slices,
  };
}

async function readCompletedSliceOutputs(sliceState: SliceExecutionState): Promise<string[]> {
  const outputs: string[] = [];

  for (const record of sliceState.slices) {
    if (record.status !== "completed" || !record.run_dir) continue;

    try {
      outputs.push(await readFile(join(record.run_dir, "runner_stdout.txt"), "utf-8"));
    } catch {
      outputs.push(`Output unavailable for slice ${record.slice_order}: ${record.slice_name}`);
    }
  }

  return outputs;
}

async function buildSliceContextPack(
  stage: StageCode,
  config: SessionConfig,
  workflowInput: WorkflowInputMetadata | undefined,
  contextMode: RunWorkflowOptions["contextMode"],
): Promise<BudgetedContextPack> {
  return buildBudgetedContextPack(stage, config, {
    workflowInput,
    budgetConfig: { mode: contextMode },
  });
}

async function prepareSliceExecutionState(
  config: SessionConfig,
  slices: SliceDefinition[],
): Promise<SliceExecutionState> {
  const existing = await readSliceExecutionState(config);
  const existingByKey = new Map(
    (existing?.slices ?? []).map((record) => [sliceKey(record.slice_order, record.slice_name), record]),
  );
  const now = new Date().toISOString();
  const state: SliceExecutionState = {
    featureId: config.featureId,
    current_slice_order: existing?.current_slice_order,
    slices: sortedSlices(slices).map((slice) => {
      const previous = existingByKey.get(sliceKey(slice.order, slice.name));
      return previous ?? {
        slice_name: slice.name,
        slice_order: slice.order,
        status: "pending",
        attempts: 0,
        model_tier: resolveSliceModelTier(slice),
      };
    }),
    updatedAt: now,
  };
  await writeSliceExecutionState(config, state);
  return state;
}

function sortedSlices(slices: SliceDefinition[]): SliceDefinition[] {
  return [...slices].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function sliceKey(order: number, name: string): string {
  return `${order}:${name}`;
}

function updateSliceRecord(
  state: SliceExecutionState,
  index: number,
  update: {
    status?: SliceExecutionRecord["status"];
    attempts?: number;
    currentRunDir?: string;
    startedAt?: string;
    finishedAt?: string;
    modelTier?: SliceExecutionRecord["model_tier"];
    runnerName?: SliceExecutionRecord["runner"];
    modelResolution?: ModelResolution;
    validation?: ValidationResult;
    reportedStatus?: ImplementationStatus;
    lastError?: string;
  },
): SliceExecutionState {
  const slices = [...state.slices];
  const previous = slices[index];
  if (!previous) return state;

  slices[index] = {
    ...previous,
    status: update.status ?? previous.status,
    attempts: update.attempts ?? previous.attempts,
    model_tier: update.modelTier ?? previous.model_tier,
    runner: update.runnerName ?? previous.runner,
    model: update.modelResolution?.model ?? previous.model,
    model_resolution: update.modelResolution ?? previous.model_resolution,
    run_dir: update.currentRunDir ?? previous.run_dir,
    started_at: update.startedAt ?? previous.started_at,
    finished_at: update.finishedAt ?? previous.finished_at,
    validation: update.validation ?? previous.validation,
    reported_status: update.reportedStatus ?? previous.reported_status,
    last_error: update.lastError ?? previous.last_error,
  };

  return {
    ...state,
    current_slice_order: slices[index].slice_order,
    slices,
    updatedAt: new Date().toISOString(),
  };
}

function buildSliceImplementationPrompt(input: {
  config: SessionConfig;
  slice: SliceDefinition;
  slices: SliceDefinition[];
  sliceState: SliceExecutionState;
  contextPack: BudgetedContextPack;
  userInput?: string;
  workflowInput?: WorkflowInputMetadata;
  lang: Lang;
}): string {
  const registry = createPromptRegistry();
  const basePrompt = renderStagePrompt(registry, {
    featureId: input.config.featureId,
    stage: "I",
    userInput: input.userInput,
    workflowInput: input.workflowInput,
    context: input.contextPack,
    lang: input.lang,
  });
  const completed = input.sliceState.slices
    .filter((record) => record.status === "completed")
    .map((record) => `- [${record.slice_order}] ${record.slice_name}: ${record.status} (${record.run_dir ?? "no run dir"})`)
    .join("\n") || "- None";
  const pending = input.slices
    .filter((slice) => slice.order !== input.slice.order)
    .map((slice) => `- [${slice.order}] ${slice.name}`)
    .join("\n") || "- None";

  return [
    basePrompt,
    "## Slice Execution Scope",
    "Run exactly one vertical slice in this runner session.",
    "Do not implement other pending slices unless the current slice explicitly requires a tiny compatibility touch.",
    "",
    "### Current Slice",
    JSON.stringify(input.slice, null, 2),
    "",
    "### Completed Slices",
    completed,
    "",
    "### Other Slices",
    pending,
    "",
    "### Required Slice Report",
    "The final answer must still follow the I stage Implementation Report format and include Status, Implementation Content, Verification Result, Files Changed, Self-Review, and Remaining Issues when blocked.",
  ].join("\n");
}

function toSliceExecutionStatus(
  validation: ValidationResult,
  reportedStatus: ImplementationStatus | undefined,
): SliceExecutionRecord["status"] {
  if (!validation.valid) return "failed";
  if (reportedStatus === "BLOCKED") return "blocked";
  if (reportedStatus === "NEEDS_CONTEXT") return "needs_context";
  return "completed";
}

function buildSlicePausedEngineState(
  engineState: EngineState,
  status: SessionStatus,
  stage: StageCode,
  attempt: number,
  startedAt: string,
  runDir: string,
  lastError: string,
  contextBudgetStatus?: ContextBudgetStatus,
  contextBudgetWarnings?: number,
  contextError?: ContextOverBudgetError,
): EngineState {
  return {
    ...engineState,
    status,
    lastError,
    lastContextError: contextError,
    history: [
      ...engineState.history,
      {
        stage,
        attempt,
        startedAt,
        finishedAt: new Date().toISOString(),
        runDir,
        success: false,
        contextBudgetStatus,
        contextBudgetWarnings,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function buildAggregatedImplementationArtifact(
  sliceState: SliceExecutionState,
  outputs: string[],
): string {
  const hasConcerns = sliceState.slices.some((record) => record.reported_status === "DONE_WITH_CONCERNS");
  const status = hasConcerns ? "DONE_WITH_CONCERNS" : "DONE";
  const sliceLines = sliceState.slices.map((record) => (
    `- [${record.slice_order}] ${record.slice_name}: ${record.status}; run=${record.run_dir ?? "n/a"}; model=${record.model ?? "n/a"}; tier=${record.model_tier}`
  ));
  const outputSections = outputs.map((output, index) => (
    `## Slice ${index + 1} Output\n\n${output.trim()}`
  ));

  return [
    "# Implementation Report",
    "",
    `**Status:** ${status}`,
    "",
    "## Implementation Content",
    ...sliceLines,
    "",
    "## Verification Result",
    ...sliceState.slices.map((record) => `- ${record.slice_name}: ${record.validation?.summary ?? "validated"}`),
    "",
    "## Files Changed",
    "- See each slice output for the concrete changed file list.",
    "",
    "## Self-Review",
    "- Completeness: all WorkTree slices reached a completed status before aggregation.",
    "- Quality: each slice was validated independently before the final I artifact was written.",
    "- Testing: each slice report includes its own verification result; the aggregate validation passed.",
    "",
    "## Remaining Issues",
    "- None reported by completed slices.",
    "",
    ...outputSections,
  ].join("\n");
}

export async function resumeSliceExecution(
  config: SessionConfig,
  runner: Runner,
  targetSliceOrder: number,
  options: RunWorkflowOptions = {},
): Promise<{ workflowState: WorkflowState; engineState: EngineState; results: RunSingleStageResult[] }> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);
  const sliceState = await readSliceExecutionState(config);

  if (workflowState.currentStage !== "I") {
    throw new Error(`Cannot retry slice while current stage is ${workflowState.currentStage}; expected I`);
  }
  if (!sliceState?.slices.some((slice) => slice.slice_order === targetSliceOrder)) {
    throw new Error(`Slice order not found: ${targetSliceOrder}`);
  }

  await writeWorkflowState(config, {
    ...workflowState,
    status: "idle",
    updatedAt: new Date().toISOString(),
  });
  await writeEngineState(config, {
    ...engineState,
    currentStage: "I",
    status: "ready",
    lastError: "",
    lastContextError: undefined,
    updatedAt: new Date().toISOString(),
  });

  return runWorkflow(config, runner, {
    ...options,
    maxStages: 1,
  });
}

export async function runWorkflow(
  config: SessionConfig,
  runner: Runner,
  options: RunWorkflowOptions,
): Promise<{ workflowState: WorkflowState; engineState: EngineState; results: RunSingleStageResult[] }> {
  let workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  let engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const results: RunSingleStageResult[] = [];
  const maxStages = options.maxStages ?? 99;
  let stagesRun = 0;
  const runnerOptions: RunnerOptions = {
    model: options.model,
    codexProfile: options.codexProfile,
    codexConfig: options.codexConfig,
  };

  while (stagesRun < maxStages) {
    const stage = workflowState.currentStage;
    const alreadyCompleted = engineState.history.some(
      (h) => h.stage === stage && h.success,
    );

    if (alreadyCompleted && engineState.status !== "waiting_approval") {
      const next = getNextStage(stage);
      if (!next) break;
      workflowState = transitionWorkflowState(workflowState, next, "idle");
      await writeWorkflowState(config, workflowState);
      engineState = { ...engineState, currentStage: next };
      await writeEngineState(config, engineState);
      continue;
    }

    if (engineState.status === "waiting_approval") {
      if (options.noStopAtGate) {
        // continue anyway (auto-approve not allowed here, just skip for now)
      }
      break;
    }

    const result = await runSingleStage(
      config,
      workflowState,
      engineState,
      runner,
      options.input,
      options.lang,
      runnerOptions,
      options.workflowInput ? {
        input_source: options.workflowInput.input_source,
        source_file: options.workflowInput.source_file,
        file_kind: options.workflowInput.file_kind,
      } : undefined,
      options.contextMode ?? "layered",
    );

    results.push(result);
    workflowState = result.workflowState;
    engineState = result.engineState;
    stagesRun++;

    if (!result.validation.valid) break;

    if (
      result.engineState.status === "failed" ||
      result.engineState.status === "blocked" ||
      result.engineState.status === "needs_context"
    ) {
      break;
    }

    if (isGateStage(stage)) {
      break;
    }

    const next = getNextStage(stage);
    if (!next) break;

    workflowState = transitionWorkflowState(workflowState, next, "idle");
    await writeWorkflowState(config, workflowState);
    engineState = { ...engineState, currentStage: next, status: "ready" };
    await writeEngineState(config, engineState);
  }

  return { workflowState, engineState, results };
}

function getReportedStageStatus(
  stage: StageCode,
  parsedArtifact: ParsedArtifact,
): ImplementationStatus | undefined {
  if (stage !== "I") return undefined;
  const rawStatus = parsedArtifact.structured_data.status;
  if (
    rawStatus === "DONE" ||
    rawStatus === "DONE_WITH_CONCERNS" ||
    rawStatus === "BLOCKED" ||
    rawStatus === "NEEDS_CONTEXT"
  ) {
    return rawStatus;
  }
  return undefined;
}

function getStagePreconditionFailure(stage: StageCode, engineState: EngineState): string | undefined {
  if (stage !== "PR") return undefined;

  const hasSuccessfulImplementation = engineState.history.some(
    (entry) => entry.stage === "I" && entry.success,
  );
  if (!hasSuccessfulImplementation) {
    return "PR stage requires a successful I stage (DONE or DONE_WITH_CONCERNS)";
  }

  return undefined;
}

export async function approveCurrentStage(
  config: SessionConfig,
  input: GateDecisionInput = {},
): Promise<{ workflowState: WorkflowState; engineState: EngineState }> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const targetStage = (input.stage ?? workflowState.currentStage) as StageCode;

  if (!isGateStage(targetStage)) {
    throw new Error(`Stage ${targetStage} is not a gate stage, no approval needed`);
  }
  const gateStage = targetStage as GateStageCode;

  if (workflowState.currentStage !== targetStage) {
    throw new Error(
      `Cannot approve stage ${targetStage} while current stage is ${workflowState.currentStage}`,
    );
  }

  if (engineState.status !== "waiting_approval") {
    throw new Error(`Stage ${targetStage} is not waiting for approval`);
  }

  const approvedAt = new Date().toISOString();
  const note = input.note ?? input.comment;
  const reviewPath = note
    ? await writeGateReviewFile(config, targetStage, "approved", note)
    : undefined;
  const artifact = await resolveArtifactPointer(config, gateStage, "markdown");
  const structuredArtifact = await resolveArtifactPointer(config, gateStage, "structured");

  const reviewRecord: GateReviewRecord = {
    id: randomUUID(),
    feature_id: config.featureId,
    stage: gateStage,
    decision: "approved",
    reviewed_at: approvedAt,
    reviewed_by: input.reviewer,
    note,
    feedback: input.feedback,
    input_source: input.noteFile ? "file" : (note ? "inline" : "none"),
    artifact,
    structured_artifact: structuredArtifact.exists ? structuredArtifact : undefined,
    review_path: reviewPath,
    source_file: input.noteFile,
  };

  const next = getNextStage(targetStage);

  const newEngineState: EngineState = {
    ...engineState,
    approvals: [...engineState.approvals, {
      stage: gateStage,
      approved_at: approvedAt,
      approved_by: input.reviewer,
      comment: note,
    }],
    gate_reviews: [...engineState.gate_reviews, reviewRecord],
    currentStage: next ?? targetStage,
    status: next ? "ready" : "completed",
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, newEngineState);

  const newWorkflowState = transitionWorkflowState(
    workflowState,
    next ?? targetStage,
    next ? "idle" : "completed",
  );
  await writeWorkflowState(config, newWorkflowState);

  return { workflowState: newWorkflowState, engineState: newEngineState };
}

export async function rejectCurrentStage(
  config: SessionConfig,
  input: GateDecisionInput = {},
): Promise<{ workflowState: WorkflowState; engineState: EngineState }> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const targetStage = (input.stage ?? workflowState.currentStage) as StageCode;

  if (!isGateStage(targetStage)) {
    throw new Error(`Stage ${targetStage} is not a gate stage, no rejection needed`);
  }
  const gateStage = targetStage as GateStageCode;

  if (workflowState.currentStage !== targetStage) {
    throw new Error(
      `Cannot reject stage ${targetStage} while current stage is ${workflowState.currentStage}`,
    );
  }

  if (engineState.status !== "waiting_approval") {
    throw new Error(`Stage ${targetStage} is not waiting for approval`);
  }

  const recordedAt = new Date().toISOString();
  const feedback = input.feedback ?? input.comment;
  const reviewPath = feedback
    ? await writeGateReviewFile(config, targetStage, "rejected", feedback)
    : undefined;
  const artifact = await resolveArtifactPointer(config, gateStage, "markdown");
  const structuredArtifact = await resolveArtifactPointer(config, gateStage, "structured");

  const reviewRecord: GateReviewRecord = {
    id: randomUUID(),
    feature_id: config.featureId,
    stage: gateStage,
    decision: "rejected",
    reviewed_at: recordedAt,
    reviewed_by: input.reviewer,
    note: input.note,
    feedback,
    input_source: input.feedbackFile ? "file" : (feedback ? "inline" : "none"),
    artifact,
    structured_artifact: structuredArtifact.exists ? structuredArtifact : undefined,
    review_path: reviewPath,
    source_file: input.feedbackFile,
  };

  const newEngineState: EngineState = {
    ...engineState,
    currentStage: targetStage,
    status: "ready",
    lastError: feedback ?? `Stage ${targetStage} rejected; ready to regenerate`,
    gate_reviews: [...engineState.gate_reviews, reviewRecord],
    history: engineState.history.filter(
      (entry) => !(entry.stage === targetStage && entry.success),
    ),
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, newEngineState);

  const newWorkflowState = transitionWorkflowState(workflowState, targetStage, "idle");
  await writeWorkflowState(config, newWorkflowState);

  return { workflowState: newWorkflowState, engineState: newEngineState };
}

export async function rewindWorkflowStage(
  config: SessionConfig,
  targetStage: StageCode,
  reason?: string,
): Promise<{ workflowState: WorkflowState; engineState: EngineState }> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const targetIndex = getStageIndex(targetStage);
  const currentIndex = Math.max(
    getStageIndex(workflowState.currentStage),
    getStageIndex(engineState.currentStage),
  );

  if (targetIndex > currentIndex) {
    throw new Error(
      `Cannot rewind from ${workflowState.currentStage}/${engineState.currentStage} to future stage ${targetStage}`,
    );
  }

  const newEngineState: EngineState = {
    ...engineState,
    currentStage: targetStage,
    status: "ready",
    approvals: engineState.approvals.filter(
      (approval) => getStageIndex(approval.stage) < targetIndex,
    ),
    gate_reviews: engineState.gate_reviews.filter(
      (review) => getStageIndex(review.stage) < targetIndex,
    ),
    history: engineState.history.filter(
      (entry) => getStageIndex(entry.stage) < targetIndex,
    ),
    lastError: reason ?? `Rewound workflow to stage ${targetStage}`,
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, newEngineState);

  const newWorkflowState = transitionWorkflowState(workflowState, targetStage, "idle");
  await writeWorkflowState(config, newWorkflowState);

  return { workflowState: newWorkflowState, engineState: newEngineState };
}

export async function advanceWorkflowStage(
  config: SessionConfig,
  force = false,
): Promise<WorkflowState> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const stage = workflowState.currentStage;

  if (isGateStage(stage) && !force) {
    throw new Error(
      `Stage ${stage} is a gate stage, run qrspi approve ${stage} first`,
    );
  }

  const next = getNextStage(stage);
  if (!next) {
    throw new Error(`${stage} is the final stage, cannot advance further`);
  }

  const newState = transitionWorkflowState(workflowState, next, "idle");
  await writeWorkflowState(config, newState);

  const newEngineState: EngineState = {
    ...engineState,
    currentStage: next,
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
  await writeEngineState(config, newEngineState);

  return newState;
}

export async function initWorkflow(
  config: SessionConfig,
): Promise<{ workflowState: WorkflowState; engineState: EngineState }> {
  await initializeSessionDirectories(config);

  const existing = await readWorkflowState(config);
  if (existing) {
    const existingEngine = await readEngineState(config);
    return {
      workflowState: existing,
      engineState: existingEngine ?? createInitialEngineState(config),
    };
  }

  const workflowState = createInitialWorkflowState(config);
  const engineState = createInitialEngineState(config);

  await writeWorkflowState(config, workflowState);
  await writeEngineState(config, engineState);

  return { workflowState, engineState };
}
