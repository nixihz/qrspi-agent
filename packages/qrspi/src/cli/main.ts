#!/usr/bin/env node
import { Command } from "commander";
import { resolve, join } from "path";

import type {
  CliGlobalOptions,
  RunCommandOptions,
  InitCommandOptions,
  PromptCommandOptions,
  StageCode,
  SessionConfig,
  SliceDefinition,
} from "../workflow/types.js";
import {
  initWorkflow,
  runWorkflow,
  approveCurrentStage,
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

const VERSION = "1.0.0";

function resolveLangFromEnv(): string {
  const envLang = process.env.LANG ?? "";
  return envLang.startsWith("zh") ? "zh" : "en";
}

function resolveConfig(opts: CliGlobalOptions): SessionConfig {
  const projectRoot = resolve(opts.root ?? process.cwd());
  return {
    featureId: "",
    projectRoot,
    outputDir: ".qrspi",
  };
}

async function getFeatureConfig(opts: CliGlobalOptions): Promise<SessionConfig> {
  const base = resolveConfig(opts);
  const stateFile = join(base.projectRoot, base.outputDir);
  const { readdir } = await import("fs/promises");
  try {
    const dirs = await readdir(stateFile);
    if (dirs.length === 1) {
      return { ...base, featureId: dirs[0] };
    }
    for (const d of dirs) {
      const state = await readWorkflowState({ ...base, featureId: d });
      if (state) return { ...base, featureId: d };
    }
  } catch {
    // no .qrspi dir
  }
  return base;
}

export async function handleInitCommand(opts: InitCommandOptions): Promise<number> {
  const config: SessionConfig = {
    featureId: opts.featureId,
    projectRoot: resolve(opts.root ?? process.cwd()),
    outputDir: ".qrspi",
  };

  const { workflowState } = await initWorkflow(config);
  print(`[QRSPI] Initialized workflow: ${opts.featureId}`);
  print(`[QRSPI] Current stage: ${getStageName(workflowState.currentStage)}`);
  return 0;
}

export async function handleStatusCommand(opts: CliGlobalOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found. Run qrspi init <feature_id> first");
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  const engine = (await readEngineState(config)) ?? createInitialEngineState(config);
  print(formatStatusOutput(state, engine));
  return 0;
}

export async function handleStageCommand(opts: CliGlobalOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
    return 1;
  }

  const state = (await readWorkflowState(config)) ?? createInitialWorkflowState(config);
  print(formatStageOutput(state));
  return 0;
}

export async function handleListCommand(opts: CliGlobalOptions): Promise<number> {
  const projectRoot = resolve(opts.root ?? process.cwd());
  const features = await listFeatures(projectRoot, ".qrspi");
  print(formatFeatureList(features));
  return 0;
}

export async function handlePromptCommand(opts: PromptCommandOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
    return 1;
  }

  if (!isValidStageCode(opts.stage)) {
    printErr(`[QRSPI] Invalid stage code: ${opts.stage}`);
    return 1;
  }

  const registry = createPromptRegistry();
  const template = registry.get(opts.stage);

  if (!opts.render) {
    print(`Stage ${opts.stage} prompt template registered. Use --render to render the actual prompt.`);
    return 0;
  }

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

export async function handleRunCommand(opts: RunCommandOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId && !opts.featureId) {
    printErr("[QRSPI] No workflow found. Run qrspi init <feature_id> first");
    return 1;
  }
  if (opts.featureId) config.featureId = opts.featureId;

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
  opts: CliGlobalOptions,
  stage?: string,
): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
    return 1;
  }

  const targetStage = stage as StageCode | undefined;
  const { workflowState, engineState } = await approveCurrentStage(
    config,
    targetStage,
  );

  const approvedStage = targetStage ?? engineState.currentStage;
  const { getNextStage: getNext } = await import("../workflow/stage-schema.js");
  const nextStage = getNext(approvedStage as StageCode);

  if (nextStage) {
    print(formatApproveResult(approvedStage as StageCode, nextStage));
  } else {
    print(`✅ ${approvedStage} approved, workflow completed`);
  }
  return 0;
}

export async function handleAdvanceCommand(opts: CliGlobalOptions & { force?: boolean }): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
    return 1;
  }

  const state = await advanceWorkflowStage(config, opts.force);
  print(`[QRSPI] Advanced to stage: ${getStageName(state.currentStage)}`);
  return 0;
}

export async function handleSliceListCommand(opts: CliGlobalOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
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
  opts: CliGlobalOptions,
  name: string,
  desc: string,
  order: number,
  checkpoint: string,
): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
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

export async function handleContextCommand(opts: CliGlobalOptions): Promise<number> {
  const config = await getFeatureConfig(opts);
  if (!config.featureId) {
    printErr("[QRSPI] No workflow found");
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
      .option("--timeout <ms>", "Timeout in milliseconds", parseInt)
      .option("--lang <code>", "Language (en/zh)", resolveLangFromEnv());

  globalOpts(
    program
      .command("init <feature_id>")
      .description("Initialize a QRSPI workflow")
  ).action(async (featureId: string, opts: CliGlobalOptions) => {
    const code = await handleInitCommand({ ...opts, featureId });
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("status")
      .description("Show workflow status")
  ).action(async (opts: CliGlobalOptions) => {
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

  globalOpts(
    program
      .command("stage")
      .description("Show current stage")
  ).action(async (opts: CliGlobalOptions) => {
    const code = await handleStageCommand(opts);
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("prompt <stage>")
      .description("Render stage prompt")
      .option("--render", "Render the actual prompt", false)
      .option("--input <text>", "User input")
  ).action(async (stage: string, opts: PromptCommandOptions) => {
    const code = await handlePromptCommand({ ...opts, stage: stage as StageCode });
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("run")
      .description("Run the workflow")
      .option("--input <text>", "User requirement input")
      .option("--feature-id <id>", "Feature ID")
      .option("--max-stages <n>", "Maximum stages to execute", parseInt)
      .option("--no-stop-at-gate", "Do not stop at gate stages")
  ).action(async (opts: RunCommandOptions & { featureId?: string; "feature-id"?: string }) => {
    const finalOpts: RunCommandOptions = {
      ...opts,
      featureId: opts.featureId ?? opts["feature-id"],
    };
    const code = await handleRunCommand(finalOpts);
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("approve [stage]")
      .description("Approve a gate stage")
  ).action(async (stage: string | undefined, opts: CliGlobalOptions) => {
    const code = await handleApproveCommand(opts, stage);
    process.exitCode = code;
  });

  globalOpts(
    program
      .command("advance")
      .description("Manually advance to the next stage")
      .option("--force", "Force advance past a gate stage", false)
  ).action(async (opts: CliGlobalOptions & { force?: boolean }) => {
    const code = await handleAdvanceCommand(opts);
    process.exitCode = code;
  });

  const sliceCmd = program.command("slice").description("Manage work tree slices");

  globalOpts(
    sliceCmd.command("list").description("List slices")
  ).action(async (opts: CliGlobalOptions) => {
    const code = await handleSliceListCommand(opts);
    process.exitCode = code;
  });

  globalOpts(
    sliceCmd
      .command("add <name>")
      .description("Add a slice")
      .option("--desc <text>", "Slice description", "")
      .option("--order <n>", "Order", parseInt)
      .option("--checkpoint <text>", "Acceptance criteria", "")
  ).action(
    async (
      name: string,
      opts: CliGlobalOptions & { desc?: string; order?: number; checkpoint?: string },
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

  globalOpts(
    program.command("context").description("Show current context strategy")
  ).action(async (opts: CliGlobalOptions) => {
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
    await program.parseAsync(argv ?? process.argv);
  } catch (err) {
    printErr(`[QRSPI] Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const code = process.exitCode;
  return typeof code === "number" ? code : 0;
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
