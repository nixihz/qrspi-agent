import { join } from "path";
import type {
  SessionConfig,
  WorkflowState,
  EngineState,
  StageArtifact,
  ValidationResult,
  Runner,
  StageCode,
  RunCommandOptions,
  ApprovalRecord,
  Lang,
} from "../workflow/types.js";
import {
  getNextStage,
  isGateStage,
  getStageDefinition,
  getStageName,
} from "../workflow/stage-schema.js";
import {
  readWorkflowState,
  writeWorkflowState,
  readEngineState,
  writeEngineState,
  writeArtifact,
  readArtifact,
  writeWorkTree,
  initializeSessionDirectories,
  createInitialWorkflowState,
  createInitialEngineState,
  createRunDir,
  writeRunFile,
  transitionWorkflowState,
} from "../storage/file-repository.js";
import { resolveFileStoreLayout, buildRunDirName } from "../storage/path-resolver.js";
import { buildContextPack } from "../context/context-builder.js";
import { createPromptRegistry, renderStagePrompt } from "../prompts/template-registry.js";
import { validateStageArtifact } from "../validators/stage-validator.js";
import { resolveRunnerModel } from "../runner/index.js";
import { parseStageOutput } from "../parsers/artifact-parser.js";

export interface RunSingleStageResult {
  workflowState: WorkflowState;
  engineState: EngineState;
  artifact?: StageArtifact;
  validation: ValidationResult;
}

export async function runSingleStage(
  config: SessionConfig,
  workflowState: WorkflowState,
  engineState: EngineState,
  runner: Runner,
  userInput?: string,
  lang: Lang = "en",
): Promise<RunSingleStageResult> {
  const stage = workflowState.currentStage;
  const attempt = (engineState.stage_attempts[stage] ?? 0) + 1;
  const runDirName = buildRunDirName(stage, attempt);
  const runDir = await createRunDir(config, runDirName);
  const startedAt = new Date().toISOString();

  const updatedEngineState: EngineState = {
    ...engineState,
    stage_attempts: { ...engineState.stage_attempts, [stage]: attempt },
  };

  try {
    const contextPack = await buildContextPack(stage, config);

    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: config.featureId,
      stage,
      userInput,
      context: contextPack,
      lang,
    });

    await writeRunFile(runDir, "prompt.md", prompt);
    await writeRunFile(runDir, "context.json", contextPack);

    const runnerResult = await runner.run({
      prompt,
      cwd: config.projectRoot,
      stage,
      options: {
        model: resolveRunnerModel(runner.name),
      },
    });

    await writeRunFile(runDir, "runner_stdout.txt", runnerResult.stdout);
    await writeRunFile(runDir, "runner_stderr.txt", runnerResult.stderr);
    await writeRunFile(runDir, "runner_meta.json", {
      ok: runnerResult.exitCode === 0,
      exit_code: runnerResult.exitCode,
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

    const successEngineState: EngineState = {
      ...updatedEngineState,
      status: isGateStage(stage) ? "waiting_approval" : "ready",
      lastError: "",
      history: [
        ...updatedEngineState.history,
        {
          stage,
          attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          runDir,
          success: true,
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

export async function runWorkflow(
  config: SessionConfig,
  runner: Runner,
  options: RunCommandOptions,
): Promise<{ workflowState: WorkflowState; engineState: EngineState; results: RunSingleStageResult[] }> {
  let workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  let engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const results: RunSingleStageResult[] = [];
  const maxStages = options.maxStages ?? 99;
  let stagesRun = 0;

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
    );

    results.push(result);
    workflowState = result.workflowState;
    engineState = result.engineState;
    stagesRun++;

    if (!result.validation.valid) break;

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

export async function approveCurrentStage(
  config: SessionConfig,
  stage?: StageCode,
  approver?: string,
  comment?: string,
): Promise<{ workflowState: WorkflowState; engineState: EngineState }> {
  const workflowState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engineState =
    (await readEngineState(config)) ?? createInitialEngineState(config);

  const targetStage = stage ?? workflowState.currentStage;

  if (!isGateStage(targetStage)) {
    throw new Error(`Stage ${targetStage} is not a gate stage, no approval needed`);
  }

  const approval: ApprovalRecord = {
    stage: targetStage,
    approvedAt: new Date().toISOString(),
    approvedBy: approver,
    comment,
  };

  const next = getNextStage(targetStage);

  const newEngineState: EngineState = {
    ...engineState,
    approvals: [...engineState.approvals, approval],
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
