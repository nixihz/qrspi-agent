#!/usr/bin/env node
import { createRequire } from "module";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve, join } from "path";
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

import { Command } from "commander";

import type {
  AdvanceCommandOptions,
  ApproveCommandOptions,
  CliGlobalOptions,
  FeatureScopedCommandOptions,
  InitCommandOptions,
  Lang,
  PromptCommandOptions,
  PromptExportCommandOptions,
  ProjectConfig,
  RejectCommandOptions,
  RewindCommandOptions,
  RunCommandOptions,
  StageCode,
  SessionConfig,
  SliceAddCommandOptions,
  SliceDefinition,
  ContextPack,
} from "../workflow/types.js";
import {
  initWorkflow,
  runWorkflow,
  approveCurrentStage,
  rejectCurrentStage,
  rewindWorkflowStage,
  advanceWorkflowStage,
} from "../engine/engine.js";
import {
  readWorkflowState,
  readEngineState,
  createInitialWorkflowState,
  createInitialEngineState,
  readWorkTree,
  writeWorkTree,
  listFeatures,
} from "../storage/file-repository.js";
import { buildRunner, resolveRunnerName, resolveRunnerModel } from "../runner/index.js";
import {
  formatStatusOutput,
  formatStageOutput,
  formatApproveResult,
  formatFeatureList,
  print,
  printErr,
} from "./output.js";
import {
  buildApproveJson,
  buildContextJson,
  buildErrorJson,
  buildInitJson,
  buildListJson,
  buildRejectJson,
  buildRunJson,
  buildStageJson,
  buildStatusJson,
  printJson,
} from "./json-output.js";
import {
  getStageOrder,
  getStageName,
  getStageDescription,
  createStageDefinitions,
  isValidStageCode,
} from "../workflow/stage-schema.js";
import { createPromptRegistry, renderStagePrompt } from "../prompts/template-registry.js";
import { buildContextPack } from "../context/context-builder.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../../package.json") as { version: string };

function resolveLangFromEnv(): Lang {
  const envLang = process.env.LANG ?? "";
  return envLang.startsWith("zh") ? "zh" : "en";
}

function resolveProjectConfig(opts: CliGlobalOptions): ProjectConfig {
  return {
    projectRoot: resolve(opts.root ?? process.cwd()),
    outputDir: ".qrspi",
  };
}

function createSessionConfig(
  projectConfig: ProjectConfig,
  featureId: string,
): SessionConfig {
  return {
    ...projectConfig,
    featureId,
  };
}

async function resolveFeatureConfig(
  opts: FeatureScopedCommandOptions,
): Promise<{
  config?: SessionConfig;
  error?: { code: string; message: string; feature?: string; features?: string[] };
}> {
  const projectConfig = resolveProjectConfig(opts);
  const workflows = await listFeatures(projectConfig.projectRoot, projectConfig.outputDir);
  const availableFeatures = workflows.map((workflow) => workflow.featureId);
  const requestedFeatureId = (opts.featureId ?? opts.feature)?.trim();

  if (requestedFeatureId) {
    if (!availableFeatures.includes(requestedFeatureId)) {
      const available = availableFeatures.length > 0 ? ` Available features: ${availableFeatures.join(", ")}` : "";
      return {
        error: {
          code: "WORKFLOW_NOT_FOUND",
          message: `[QRSPI] Workflow not found for feature: ${requestedFeatureId}.${available}`,
          feature: requestedFeatureId,
          features: availableFeatures,
        },
      };
    }

    return {
      config: createSessionConfig(projectConfig, requestedFeatureId),
    };
  }

  if (availableFeatures.length === 0) {
    return {
      error: {
        code: "NO_WORKFLOW",
        message: "[QRSPI] No workflow found. Run qrspi init <feature_id> first",
        features: [],
      },
    };
  }

  if (availableFeatures.length > 1) {
    return {
      error: {
        code: "MULTIPLE_WORKFLOWS",
        message: `[QRSPI] Multiple workflows found: ${availableFeatures.join(", ")}. Re-run with --feature <id>.`,
        features: availableFeatures,
      },
    };
  }

  return {
    config: createSessionConfig(projectConfig, availableFeatures[0]),
  };
}

async function requireFeatureConfig(
  opts: FeatureScopedCommandOptions,
  command = "unknown",
): Promise<SessionConfig | null> {
  const result = await resolveFeatureConfig(opts);
  if (!result.config) {
    const error = result.error ?? {
      code: "FEATURE_RESOLUTION_FAILED",
      message: "[QRSPI] Failed to resolve workflow",
    };
    printCommandError(command, opts, error);
    return null;
  }

  return result.config;
}

function isJsonOutput(opts: CliGlobalOptions): boolean {
  return opts.json === true || opts.output === "json";
}

function printCommandError(
  command: string,
  opts: CliGlobalOptions,
  error: { code: string; message: string; feature?: string; features?: string[] },
): void {
  if (isJsonOutput(opts)) {
    printJson(buildErrorJson({ command, ...error }));
    return;
  }

  printErr(error.message);
}

async function readTextFile(projectRoot: string, filePath: string): Promise<string> {
  return readFile(resolve(projectRoot, filePath), "utf-8");
}

function withFeatureOption(cmd: Command): Command {
  return cmd.option("--feature <id>", "Feature ID");
}

function createEmptyContext(stage: StageCode): ContextPack {
  return {
    currentStage: stage,
    dependencies: [],
    maxLinesPerArtifact: 0,
    utilizationTarget: 0.4,
  };
}

function renderPromptTemplateForExport(stage: StageCode, lang: Lang): string {
  const registry = createPromptRegistry();
  return renderStagePrompt(registry, {
    featureId: "prompt-export",
    stage,
    context: createEmptyContext(stage),
    lang,
  });
}

function renderPromptTemplateBundle(stages: StageCode[], lang: Lang): string {
  const title = lang === "zh" ? "QRSPI Prompt 模板" : "QRSPI Prompt Templates";
  const description = lang === "zh"
    ? "以下内容是各阶段的基础系统提示词模板，不包含具体 workflow 的上下文产物或用户输入。"
    : "These are the base system prompt templates for each stage, without workflow-specific context artifacts or user input.";

  const body = stages
    .map((stage) => renderPromptTemplateForExport(stage, lang))
    .join("\n\n---\n\n");

  return [
    `# ${title}`,
    "",
    description,
    "",
    `Stages: ${stages.join(", ")}`,
    `Language: ${lang}`,
    "",
    "---",
    "",
    body,
  ].join("\n");
}

function buildPromptExportFilename(stage: StageCode, lang: Lang): string {
  return `${stage}_prompt.${lang}.md`;
}

function normalizeLegacyPromptArgs(argv: string[]): string[] {
  const normalized = [...argv];

  if (normalized[2] === "prompts" && normalized[3] === "export") {
    normalized.splice(2, 2, "prompt", "export");
    return normalized;
  }

  const legacyStage = normalized[3];
  if (
    normalized[2] === "prompt" &&
    typeof legacyStage === "string" &&
    isValidStageCode(legacyStage as StageCode)
  ) {
    const renderIndex = normalized.indexOf("--render");
    if (renderIndex !== -1) {
      normalized.splice(renderIndex, 1);
      normalized.splice(3, 1, "render", legacyStage);
    }
  }

  return normalized;
}

export async function handleInitCommand(opts: InitCommandOptions): Promise<number> {
  const config: SessionConfig = {
    featureId: opts.featureId,
    ...resolveProjectConfig(opts),
  };

  const { workflowState } = await initWorkflow(config);
  const engineState = (await readEngineState(config)) ?? createInitialEngineState(config);
  if (isJsonOutput(opts)) {
    printJson(buildInitJson(config, workflowState, engineState));
    return 0;
  }

  print(`[QRSPI] Initialized workflow: ${opts.featureId}`);
  print(`[QRSPI] Current stage: ${getStageName(workflowState.currentStage)}`);
  return 0;
}

export async function handleStatusCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "status");
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engine = (await readEngineState(config)) ?? createInitialEngineState(config);
  if (isJsonOutput(opts)) {
    printJson(await buildStatusJson("status", config, state, engine));
    return 0;
  }

  print(formatStatusOutput(state, engine));
  return 0;
}

export async function handleStageCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "stage");
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engine = (await readEngineState(config)) ?? createInitialEngineState(config);
  if (isJsonOutput(opts)) {
    printJson(await buildStageJson(config, state, engine));
    return 0;
  }

  print(formatStageOutput(state));
  return 0;
}

export async function handleListCommand(opts: CliGlobalOptions): Promise<number> {
  const projectConfig = resolveProjectConfig(opts);
  const features = await listFeatures(projectConfig.projectRoot, projectConfig.outputDir);
  if (isJsonOutput(opts)) {
    printJson(buildListJson(features));
    return 0;
  }

  print(formatFeatureList(features));
  return 0;
}

export async function handlePromptCommand(opts: PromptCommandOptions): Promise<number> {
  const config = await requireFeatureConfig(opts, "prompt");
  if (!config) {
    return 1;
  }

  if (!isValidStageCode(opts.stage)) {
    printErr(`[QRSPI] Invalid stage code: ${opts.stage}`);
    return 1;
  }

  const registry = createPromptRegistry();
  const context = await buildContextPack(opts.stage, config);
  const prompt = renderStagePrompt(registry, {
    featureId: config.featureId,
    stage: opts.stage,
    userInput: opts.input,
    context,
    lang: opts.lang,
  });
  print(prompt);
  return 0;
}

export async function handlePromptExportCommand(
  opts: PromptExportCommandOptions,
  stage?: string,
): Promise<number> {
  const lang = opts.lang ?? resolveLangFromEnv();
  const projectConfig = resolveProjectConfig(opts);
  const stages: StageCode[] = stage
    ? [stage as StageCode]
    : getStageOrder();

  if (stage && !isValidStageCode(stage)) {
    printErr(`[QRSPI] Invalid stage code: ${stage}`);
    return 1;
  }

  if (opts.split && !opts.out) {
    printErr("[QRSPI] --split requires --out <directory>");
    return 1;
  }

  if (opts.split && opts.out) {
    const outputDir = resolve(projectConfig.projectRoot, opts.out);
    await mkdir(outputDir, { recursive: true });

    for (const stageCode of stages) {
      const filePath = join(outputDir, buildPromptExportFilename(stageCode, lang));
      await writeFile(filePath, renderPromptTemplateForExport(stageCode, lang), "utf-8");
      print(`[QRSPI] Exported prompt template: ${filePath}`);
    }

    return 0;
  }

  const content = renderPromptTemplateBundle(stages, lang);

  if (!opts.out) {
    print(content);
    return 0;
  }

  const outputPath = resolve(projectConfig.projectRoot, opts.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf-8");
  print(`[QRSPI] Exported prompt templates: ${outputPath}`);
  return 0;
}

export async function handleRunCommand(opts: RunCommandOptions): Promise<number> {
  const config = await requireFeatureConfig(opts, "run");
  if (!config) {
    return 1;
  }

  const runnerName = resolveRunnerName(opts.runner);
  const runner = buildRunner(runnerName, { model: opts.model });

  const { workflowState, engineState, results } = await runWorkflow(config, runner, opts);
  if (isJsonOutput(opts)) {
    const payload = await buildRunJson(
      config,
      workflowState,
      engineState,
      results,
      opts.includeRunnerOutput,
    );
    printJson(payload);
    return payload.ok ? 0 : 1;
  }

  print(`[QRSPI] Resumed workflow: ${getStageName(workflowState.currentStage)} (Feature: ${config.featureId})`);

  for (const r of results) {
    if (r.artifact) {
      print(`[QRSPI] Artifact saved: .qrspi/${config.featureId}/artifacts/${r.artifact.stage}_${new Date().toISOString().slice(0, 10)}.md`);
    }
    const next = getStageOrder()[getStageOrder().indexOf(r.workflowState.currentStage) + 1];
    if (next && r.validation.valid && r.engineState.status === "ready") {
      print(`[QRSPI] Entering stage: ${getStageName(next)}`);
      print(`  ${getStageDescription(next)}`);
    }
  }

  if (results.length > 0) {
    print("");
    print("🤖 Auto-execution Results");
    print("==================================================");

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const currentStageForResult = r.artifact?.stage ?? r.workflowState.currentStage;

      if (!r.validation.valid) {
        print(`- ${currentStageForResult} execution failed: ${r.validation.summary}`);
      } else if (r.engineState.status === "needs_context" || r.engineState.status === "blocked") {
        print(`- ${currentStageForResult} reported ${r.engineState.status} and stayed on ${r.workflowState.currentStage}`);
      } else if (r.validation.valid) {
        const nextStage = getStageOrder()[getStageOrder().indexOf(currentStageForResult) + 1];
        if (nextStage) {
          print(`- ${currentStageForResult} completed and advanced to ${nextStage}`);
        }
        if (r.engineState.status === "waiting_approval") {
          const gateStage = r.workflowState.currentStage;
          print(`- ${gateStage} completed and validated, awaiting human approval`);
          print(`- Stage ${gateStage} is waiting for human confirmation`);
        }
      }
    }

    print("==================================================");
    print(`Current Stage: ${workflowState.currentStage} - ${getStageName(workflowState.currentStage)}`);
    print(`Engine Status: ${engineState.status}`);
  }

  return results.every(
    (r) =>
      r.validation.valid &&
      r.engineState.status !== "failed" &&
      r.engineState.status !== "blocked" &&
      r.engineState.status !== "needs_context",
  ) ? 0 : 1;
}

export async function handleApproveCommand(
  opts: ApproveCommandOptions,
  stage?: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "approve");
  if (!config) {
    return 1;
  }

  const targetStage = stage as StageCode | undefined;
  const currentState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const approvedStage = targetStage ?? currentState.currentStage;

  try {
    const note = opts.noteFile ? await readTextFile(config.projectRoot, opts.noteFile) : undefined;
    const result = await approveCurrentStage(
      config,
      targetStage,
      undefined,
      note,
      opts.noteFile,
    );

    if (isJsonOutput(opts)) {
      printJson(buildApproveJson(config, approvedStage as StageCode, result.workflowState, result.engineState));
      return 0;
    }

    const { getNextStage: getNext } = await import("../workflow/stage-schema.js");
    const nextStage = getNext(approvedStage as StageCode);

    if (nextStage) {
      print(formatApproveResult(approvedStage as StageCode, nextStage));
    } else {
      print(`✅ ${approvedStage} approved, workflow completed`);
    }
    return 0;
  } catch (error) {
    printCommandError("approve", opts, {
      code: "APPROVE_FAILED",
      message: `[QRSPI] Error: ${error instanceof Error ? error.message : String(error)}`,
      feature: config.featureId,
    });
    return 1;
  }
}

export async function handleRejectCommand(
  opts: RejectCommandOptions,
  stage?: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "reject");
  if (!config) {
    return 1;
  }

  const targetStage = stage as StageCode | undefined;

  try {
    const feedback = opts.feedbackFile ? await readTextFile(config.projectRoot, opts.feedbackFile) : undefined;
    const comment = [opts.comment, feedback].filter(Boolean).join("\n\n") || undefined;
    const { workflowState, engineState } = await rejectCurrentStage(
      config,
      targetStage,
      comment,
      opts.feedbackFile,
    );
    const rejectedStage = targetStage ?? workflowState.currentStage;

    if (isJsonOutput(opts)) {
      printJson(buildRejectJson(config, rejectedStage, workflowState, engineState));
      return 0;
    }

    print(`[QRSPI] Rejected stage: ${workflowState.currentStage}`);
    print("[QRSPI] Stage is ready to regenerate. Run qrspi run to execute it again.");
    return 0;
  } catch (error) {
    printCommandError("reject", opts, {
      code: "REJECT_FAILED",
      message: `[QRSPI] Error: ${error instanceof Error ? error.message : String(error)}`,
      feature: config.featureId,
    });
    return 1;
  }
}

export async function handleRewindCommand(
  opts: RewindCommandOptions,
  stage: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "rewind");
  if (!config) {
    return 1;
  }

  if (!isValidStageCode(stage)) {
    printErr(`[QRSPI] Invalid stage code: ${stage}`);
    return 1;
  }

  const { workflowState } = await rewindWorkflowStage(
    config,
    stage,
    opts.reason,
  );

  print(`[QRSPI] Rewound workflow to stage: ${getStageName(workflowState.currentStage)}`);
  print("[QRSPI] Stage is ready to regenerate. Run qrspi run to execute it again.");
  return 0;
}

export async function handleAdvanceCommand(
  opts: AdvanceCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "advance");
  if (!config) {
    return 1;
  }

  const state = await advanceWorkflowStage(config, opts.force);
  print(`[QRSPI] Advanced to stage: ${getStageName(state.currentStage)}`);
  return 0;
}

export async function handleSliceListCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "slice");
  if (!config) {
    return 1;
  }

  const wt = await readWorkTree(config);
  if (!wt || wt.slices.length === 0) {
    print("[QRSPI] No slices yet");
    return 0;
  }

  for (const slice of wt.slices) {
    print(`  ✓ [${slice.order}] ${slice.name}: ${slice.description}`);
  }
  return 0;
}

export async function handleSliceAddCommand(
  opts: SliceAddCommandOptions,
  name: string,
  desc: string,
  order: number,
  checkpoint: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "slice");
  if (!config) {
    return 1;
  }

  const wt = (await readWorkTree(config)) ?? { slices: [] };
  const newSlice: SliceDefinition = {
    name,
    description: desc,
    order,
    tasks: [],
    checkpoint,
  };
  wt.slices.push(newSlice);
  wt.slices.sort((a, b) => a.order - b.order);
  await writeWorkTree(config, wt);
  print(`[QRSPI] Added slice: ${name}`);
  return 0;
}

export async function handleBudgetCommand(_opts: CliGlobalOptions): Promise<number> {
  const defs = createStageDefinitions();
  print("QRSPI Stage Budget");
  print("=".repeat(40));
  for (const [stage, def] of Object.entries(defs)) {
    const gateLabel = def.gateRequired ? " [gate]" : "";
    const kindLabel = def.kind === "alignment" ? "Alignment" : "Execution";
    print(`  ${stage}: ${def.name} (${kindLabel})${gateLabel}`);
  }
  return 0;
}

export async function handleContextCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts, "context");
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engine = (await readEngineState(config)) ?? createInitialEngineState(config);
  const context = await buildContextPack(state.currentStage, config);
  if (isJsonOutput(opts)) {
    printJson(buildContextJson(config, state, engine, context));
    return 0;
  }

  print(`Current Stage: ${state.currentStage}`);
  print(`Dependency count: ${context.dependencies.length}`);
  for (const dep of context.dependencies) {
    print(`  - ${dep.stage}: ${dep.summary.split("\n")[0]}`);
  }
  return 0;
}

export async function handleVersionCommand(): Promise<number> {
  print(VERSION);
  return 0;
}

export async function main(argv?: string[]): Promise<number> {
  const program = new Command();

  program
    .name("qrspi")
    .version(VERSION)
    .description("Structured programming agent workflow framework. Orchestrates an 8-stage pipeline (Questions → Research → Design → Structure → Plan → Work Tree → Implement → Pull Request) with automated artifact validation, bilingual prompts, and gate approvals.");

  const globalOpts = (cmd: Command) =>
    cmd
      .option("--root <path>", "Project root directory", ".")
      .option("--runner <name>", "Runner type (claude/codex/mock)")
      .option("--model <model>", "Model name")
      .option("--lang <code>", "Language (en/zh)", resolveLangFromEnv())
      .option("--output <format>", "Output format (text/json)", "text")
      .option("--json", "Output JSON");

  const featureScopedOpts = (cmd: Command) => withFeatureOption(globalOpts(cmd));

  globalOpts(
    program
      .command("init <feature_id>")
      .description("Initialize a QRSPI workflow")
  ).action(async (featureId: string, opts: CliGlobalOptions) => {
    const code = await handleInitCommand({ ...opts, featureId });
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("status")
      .description("Show workflow status")
  ).action(async (opts: FeatureScopedCommandOptions) => {
    const code = await handleStatusCommand(opts);
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("list")
      .description("List all workflow features")
  ).action(async (opts: CliGlobalOptions) => {
    const code = await handleListCommand(opts);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("stage")
      .description("Show current stage")
  ).action(async (opts: FeatureScopedCommandOptions) => {
    const code = await handleStageCommand(opts);
    process.exitCode = code;
  });

  const promptCmd = program.command("prompt").description("Render and export prompts");

  featureScopedOpts(
    promptCmd
      .command("render <stage>")
      .description("Render a workflow-aware stage prompt")
      .option("--input <text>", "User input")
  ).action(async (stage: string, opts: PromptCommandOptions) => {
    const code = await handlePromptCommand({ ...opts, stage: stage as StageCode });
    process.exitCode = code;
  });

  globalOpts(
    promptCmd
      .command("export [stage]")
      .description("Export base prompt templates for all stages or one stage")
      .option("--out <path>", "Output markdown file, or output directory when --split is used")
      .option("--split", "Write one markdown file per stage", false)
  ).action(async (stage: string | undefined, opts: PromptExportCommandOptions) => {
    const code = await handlePromptExportCommand(opts, stage);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("run")
      .description("Run the workflow")
      .option("--input <text>", "User requirement input")
      .option("--max-stages <n>", "Maximum stages to execute", parseInt)
      .option("--no-stop-at-gate", "Do not stop at gate stages")
      .option("--include-runner-output", "Include runner stdout/stderr in JSON output", false)
  ).action(async (opts: RunCommandOptions) => {
    const code = await handleRunCommand(opts);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("approve [stage]")
      .description("Approve a gate stage")
      .option("--note-file <path>", "Markdown note file to store with the approval")
  ).action(async (stage: string | undefined, opts: ApproveCommandOptions) => {
    const code = await handleApproveCommand(opts, stage);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("reject [stage]")
      .description("Reject a gate stage and make it ready to regenerate")
      .option("--comment <text>", "Rejection comment")
      .option("--feedback-file <path>", "Markdown feedback file to store with the rejection")
  ).action(async (stage: string | undefined, opts: RejectCommandOptions) => {
    const code = await handleRejectCommand(opts, stage);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("rewind <stage>")
      .description("Rewind workflow to a previous stage and make it ready to regenerate")
      .option("--reason <text>", "Rewind reason")
  ).action(async (stage: string, opts: RewindCommandOptions) => {
    const code = await handleRewindCommand(opts, stage);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("advance")
      .description("Manually advance to the next stage")
      .option("--force", "Force advance past a gate stage", false)
  ).action(async (opts: AdvanceCommandOptions) => {
    const code = await handleAdvanceCommand(opts);
    process.exitCode = code;
  });

  const sliceCmd = program.command("slice").description("Manage work tree slices");

  featureScopedOpts(
    sliceCmd.command("list").description("List slices")
  ).action(async (opts: FeatureScopedCommandOptions) => {
    const code = await handleSliceListCommand(opts);
    process.exitCode = code;
  });

  featureScopedOpts(
    sliceCmd
      .command("add <name>")
      .description("Add a slice")
      .option("--desc <text>", "Slice description", "")
      .option("--order <n>", "Order", parseInt)
      .option("--checkpoint <text>", "Acceptance criteria", "")
  ).action(
    async (
      name: string,
      opts: SliceAddCommandOptions,
    ) => {
      const code = await handleSliceAddCommand(
        opts,
        name,
        opts.desc ?? "",
        opts.order ?? 1,
        opts.checkpoint ?? "",
      );
      process.exitCode = code;
    },
  );

  globalOpts(
    program.command("budget").description("Show stage budget")
  ).action(async (opts: CliGlobalOptions) => {
    const code = await handleBudgetCommand(opts);
    process.exitCode = code;
  });

  featureScopedOpts(
    program.command("context").description("Show current context strategy")
  ).action(async (opts: FeatureScopedCommandOptions) => {
    const code = await handleContextCommand(opts);
    process.exitCode = code;
  });

  program
    .command("version")
    .description("Show version")
    .action(async () => {
      const code = await handleVersionCommand();
      process.exitCode = code;
    });

  try {
    await program.parseAsync(normalizeLegacyPromptArgs(argv ?? process.argv));
  } catch (err) {
    printErr(`[QRSPI] Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const code = process.exitCode;
  return typeof code === "number" ? code : 0;
}

const isDirectExecution = process.argv[1]
  ? realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  : false;

if (isDirectExecution) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
