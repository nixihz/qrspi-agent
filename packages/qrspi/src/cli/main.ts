#!/usr/bin/env node
import { createRequire } from "module";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve, join } from "path";
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

import { Command } from "commander";

import type {
  AdvanceCommandOptions,
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
): Promise<{ config?: SessionConfig; error?: string }> {
  const projectConfig = resolveProjectConfig(opts);
  const workflows = await listFeatures(projectConfig.projectRoot, projectConfig.outputDir);
  const availableFeatures = workflows.map((workflow) => workflow.featureId);
  const requestedFeatureId = (opts.featureId ?? opts.feature)?.trim();

  if (requestedFeatureId) {
    if (!availableFeatures.includes(requestedFeatureId)) {
      const available = availableFeatures.length > 0 ? ` Available features: ${availableFeatures.join(", ")}` : "";
      return {
        error: `[QRSPI] Workflow not found for feature: ${requestedFeatureId}.${available}`,
      };
    }

    return {
      config: createSessionConfig(projectConfig, requestedFeatureId),
    };
  }

  if (availableFeatures.length === 0) {
    return {
      error: "[QRSPI] No workflow found. Run qrspi init <feature_id> first",
    };
  }

  if (availableFeatures.length > 1) {
    return {
      error: `[QRSPI] Multiple workflows found: ${availableFeatures.join(", ")}. Re-run with --feature <id>.`,
    };
  }

  return {
    config: createSessionConfig(projectConfig, availableFeatures[0]),
  };
}

async function requireFeatureConfig(
  opts: FeatureScopedCommandOptions,
): Promise<SessionConfig | null> {
  const result = await resolveFeatureConfig(opts);
  if (!result.config) {
    printErr(result.error ?? "[QRSPI] Failed to resolve workflow");
    return null;
  }

  return result.config;
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
  print(`[QRSPI] Initialized workflow: ${opts.featureId}`);
  print(`[QRSPI] Current stage: ${getStageName(workflowState.currentStage)}`);
  return 0;
}

export async function handleStatusCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engine = (await readEngineState(config)) ?? createInitialEngineState(config);
  print(formatStatusOutput(state, engine));
  return 0;
}

export async function handleStageCommand(
  opts: FeatureScopedCommandOptions,
): Promise<number> {
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  print(formatStageOutput(state));
  return 0;
}

export async function handleListCommand(opts: CliGlobalOptions): Promise<number> {
  const projectConfig = resolveProjectConfig(opts);
  const features = await listFeatures(projectConfig.projectRoot, projectConfig.outputDir);
  print(formatFeatureList(features));
  return 0;
}

export async function handlePromptCommand(opts: PromptCommandOptions): Promise<number> {
  const config = await requireFeatureConfig(opts);
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
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const runnerName = resolveRunnerName(opts.runner);
  const runner = buildRunner(runnerName, { model: opts.model });

  const { workflowState, engineState, results } = await runWorkflow(config, runner, opts);

  print(`[QRSPI] Resumed workflow: ${getStageName(workflowState.currentStage)} (Feature: ${config.featureId})`);

  for (const r of results) {
    if (r.artifact) {
      print(`[QRSPI] Artifact saved: .qrspi/${config.featureId}/artifacts/${r.artifact.stage}_${new Date().toISOString().slice(0, 10)}.md`);
    }
    const next = getStageOrder()[getStageOrder().indexOf(r.workflowState.currentStage) + 1];
    if (next && r.validation.valid) {
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
      const stageCodes = getStageOrder();
      const currentStageForResult = stageCodes[i] ?? workflowState.currentStage;

      if (r.validation.valid) {
        const nextStage = stageCodes[i + 1];
        if (nextStage) {
          print(`- ${currentStageForResult} completed and advanced to ${nextStage}`);
        }
        if (engineState.status === "waiting_approval") {
          const gateStage = workflowState.currentStage;
          print(`- ${gateStage} completed and validated, awaiting human approval`);
          print(`- Stage ${gateStage} is waiting for human confirmation`);
        }
      } else {
        print(`- ${currentStageForResult} execution failed: ${r.validation.summary}`);
      }
    }

    print("==================================================");
    print(`Current Stage: ${workflowState.currentStage} - ${getStageName(workflowState.currentStage)}`);
    print(`Engine Status: ${engineState.status}`);
  }

  return results.every((r) => r.validation.valid) ? 0 : 1;
}

export async function handleApproveCommand(
  opts: FeatureScopedCommandOptions,
  stage?: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const targetStage = stage as StageCode | undefined;
  const currentState =
    (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const approvedStage = targetStage ?? currentState.currentStage;

  await approveCurrentStage(
    config,
    targetStage,
  );

  const { getNextStage: getNext } = await import("../workflow/stage-schema.js");
  const nextStage = getNext(approvedStage as StageCode);

  if (nextStage) {
    print(formatApproveResult(approvedStage as StageCode, nextStage));
  } else {
    print(`✅ ${approvedStage} approved, workflow completed`);
  }
  return 0;
}

export async function handleRejectCommand(
  opts: RejectCommandOptions,
  stage?: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const targetStage = stage as StageCode | undefined;
  const { workflowState } = await rejectCurrentStage(
    config,
    targetStage,
    opts.comment,
  );

  print(`[QRSPI] Rejected stage: ${workflowState.currentStage}`);
  print("[QRSPI] Stage is ready to regenerate. Run qrspi run to execute it again.");
  return 0;
}

export async function handleRewindCommand(
  opts: RewindCommandOptions,
  stage: string,
): Promise<number> {
  const config = await requireFeatureConfig(opts);
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
  const config = await requireFeatureConfig(opts);
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
  const config = await requireFeatureConfig(opts);
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
  const config = await requireFeatureConfig(opts);
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
  const config = await requireFeatureConfig(opts);
  if (!config) {
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const context = await buildContextPack(state.currentStage, config);

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
      .option("--lang <code>", "Language (en/zh)", resolveLangFromEnv());

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
  ).action(async (opts: RunCommandOptions) => {
    const code = await handleRunCommand(opts);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("approve [stage]")
      .description("Approve a gate stage")
  ).action(async (stage: string | undefined, opts: FeatureScopedCommandOptions) => {
    const code = await handleApproveCommand(opts, stage);
    process.exitCode = code;
  });

  featureScopedOpts(
    program
      .command("reject [stage]")
      .description("Reject a gate stage and make it ready to regenerate")
      .option("--comment <text>", "Rejection comment")
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
