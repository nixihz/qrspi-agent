import { readFile } from "fs/promises";
import { join } from "path";
import type {
  StageCode,
  ContextPack,
  ContextArtifactSummary,
  SessionConfig,
  Lang,
  BudgetedContextPack,
  ContextBuildOptions,
  ContextCommandBudgetData,
  ContextCommandDependencyData,
  ContextLayer,
  IncludedContextDependency,
} from "../workflow/types.js";
import { getStageDependencies } from "../workflow/stage-schema.js";
import { resolveFileStoreLayout, buildArtifactFilename } from "../storage/path-resolver.js";
import {
  addSizeEstimates,
  createDefaultContextBudgetConfig,
  estimateContextSize,
} from "./context-budget.js";
import { buildDependencyContextPlans, getStageContextProfile } from "./context-profiles.js";
import { loadContextSourceArtifacts } from "./context-source.js";
import { renderContextLayer } from "./context-layer-renderer.js";
import { applyContextBudget } from "./context-truncation.js";

const NO_ARTIFACT_LINE_LIMIT = 0;
const DEFAULT_UTILIZATION = 0.4;

export function summarizeArtifact(content: string, maxLines: number = NO_ARTIFACT_LINE_LIMIT): string {
  if (maxLines <= 0) return content;

  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const header = lines.slice(0, maxLines).join("\n");
  return `${header}\n\n...(truncated, original ${lines.length} lines)...`;
}

export async function buildContextPack(
  stage: StageCode,
  config: SessionConfig,
  maxLinesPerArtifact: number = NO_ARTIFACT_LINE_LIMIT,
  utilizationTarget: number = DEFAULT_UTILIZATION,
): Promise<ContextPack> {
  const layout = resolveFileStoreLayout(config);
  const deps = getStageDependencies(stage);
  const summaries: ContextArtifactSummary[] = [];

  for (const dep of deps) {
    const filename = buildArtifactFilename(dep.stage);
    const artifactPath = join(layout.artifactsDir, filename);

    try {
      const content = await readFile(artifactPath, "utf-8");
      const summary = summarizeArtifact(content, maxLinesPerArtifact);
      summaries.push({
        stage: dep.stage,
        artifactPath,
        summary,
      });
    } catch {
      if (dep.required) {
        // skip missing required artifacts silently
      }
    }
  }

  return {
    currentStage: stage,
    dependencies: summaries,
    maxLinesPerArtifact,
    utilizationTarget,
  };
}

export function formatContextForPrompt(context: ContextPack, lang: Lang = "en"): string {
  if (isBudgetedContextPack(context)) {
    return formatBudgetedContextForPrompt(context, lang);
  }

  if (context.dependencies.length === 0) return "";

  const title = lang === "zh" ? "前置阶段上下文" : "Previous Stage Context";
  const summaryLabel = lang === "zh" ? "产物内容" : "Artifact Content";

  const parts: string[] = [`## ${title}\n`];
  for (const dep of context.dependencies) {
    parts.push(`### Stage ${dep.stage} ${summaryLabel}\n\n${dep.summary}\n`);
  }
  return parts.join("\n");
}

export async function buildBudgetedContextPack(
  stage: StageCode,
  config: SessionConfig,
  options: ContextBuildOptions = {},
): Promise<BudgetedContextPack> {
  const budgetConfig = createDefaultContextBudgetConfig(options.budgetConfig);
  if (budgetConfig.mode === "full") {
    const fullContext = await buildContextPack(
      stage,
      config,
      options.maxLinesPerArtifact ?? NO_ARTIFACT_LINE_LIMIT,
      budgetConfig.targetUtilization,
    );
    const dependencies = fullContext.dependencies.map((dependency, index) =>
      upgradeLegacyDependency(dependency, index),
    );
    const contextEstimate = addSizeEstimates(dependencies.map((dependency) => dependency.includedEstimate));
    const promptEstimate = contextEstimate;
    const budget = {
      status: promptEstimate.characters > Math.floor(budgetConfig.maxContextSize * budgetConfig.switchThresholdUtilization)
        ? "over_threshold" as const
        : promptEstimate.characters > Math.floor(budgetConfig.maxContextSize * budgetConfig.targetUtilization)
          ? "over_target" as const
          : "within_target" as const,
      config: budgetConfig,
      limits: {
        targetSize: Math.floor(budgetConfig.maxContextSize * budgetConfig.targetUtilization),
        switchThresholdSize: Math.floor(budgetConfig.maxContextSize * budgetConfig.switchThresholdUtilization),
        maxContextSize: budgetConfig.maxContextSize,
        targetPercent: Math.round(budgetConfig.targetUtilization * 100),
        switchThresholdPercent: Math.round(budgetConfig.switchThresholdUtilization * 100),
      },
      promptEstimate,
      contextEstimate,
      dependencies,
      truncationDecisions: [],
      warnings: [],
    };
    return {
      ...fullContext,
      dependencies,
      budget,
      workflow_input: options.workflowInput,
    };
  }

  const dependencies = getStageDependencies(stage);
  const profile = getStageContextProfile(stage);
  const plans = buildDependencyContextPlans(stage, dependencies, profile);
  const sources = await loadContextSourceArtifacts(config, plans.map((plan) => plan.dependency.stage));
  const renderedDependencies = plans.map((plan) => {
    const source = sources.find((item) => item.stage === plan.dependency.stage);
    if (!source) {
      throw new Error(`Missing loaded source for stage ${plan.dependency.stage}`);
    }
    return renderContextLayer(source, plan);
  });
  const promptOverhead = estimateContextSize("");
  const audit = applyContextBudget(renderedDependencies, budgetConfig, promptOverhead);
  const sourceWarnings = sources.flatMap((source) => source.warnings);
  const budget = {
    ...audit,
    warnings: [...sourceWarnings, ...audit.warnings],
  };

  return {
    currentStage: stage,
    dependencies: budget.dependencies,
    maxLinesPerArtifact: options.maxLinesPerArtifact ?? NO_ARTIFACT_LINE_LIMIT,
    utilizationTarget: budgetConfig.targetUtilization,
    workflow_input: options.workflowInput,
    budget,
  };
}

export function formatBudgetedContextForPrompt(
  contextPack: BudgetedContextPack,
  lang: Lang = "en",
): string {
  if (contextPack.dependencies.length === 0) return "";

  const title = lang === "zh" ? "前置阶段上下文" : "Previous Stage Context";
  const summaryLabel = lang === "zh" ? "上下文内容" : "Context Content";
  const layerLabel = lang === "zh" ? "层级" : "Layer";
  const requiredLabel = lang === "zh" ? "必需" : "Required";
  const parts: string[] = [`## ${title}\n`];

  const note = formatContextBudgetNoteForPrompt(contextPack.budget, lang);
  if (note) {
    parts.push(note, "");
  }

  for (const dep of contextPack.dependencies) {
    parts.push(
      [
        `### Stage ${dep.stage} ${summaryLabel}`,
        `${layerLabel}: ${dep.layer}; ${requiredLabel}: ${dep.required ? "yes" : "no"}; Artifact: ${dep.artifactPath}`,
        "",
        dep.includedContent,
        "",
      ].join("\n"),
    );
  }
  return parts.join("\n");
}

export function formatContextBudgetNoteForPrompt(
  audit: BudgetedContextPack["budget"],
  lang: Lang = "en",
): string {
  if (!audit.config.includeBudgetNoteInPrompt) return "";
  const lines = lang === "zh"
    ? [
      "### Context Budget Note",
      `状态: ${audit.status}; 估算 prompt: ${audit.promptEstimate.characters} chars / ${audit.promptEstimate.lines} lines; 目标: ${audit.limits.targetSize}; 阈值: ${audit.limits.switchThresholdSize}.`,
    ]
    : [
      "### Context Budget Note",
      `Status: ${audit.status}; estimated prompt: ${audit.promptEstimate.characters} chars / ${audit.promptEstimate.lines} lines; target: ${audit.limits.targetSize}; threshold: ${audit.limits.switchThresholdSize}.`,
    ];

  if (audit.truncationDecisions.length > 0) {
    const pointerLines = audit.truncationDecisions
      .slice(0, 10)
      .map((decision) => `- ${decision.stage}: ${decision.reason}; source=${decision.artifactPath}`);
    lines.push(lang === "zh" ? "裁剪指针:" : "Truncation pointers:", ...pointerLines);
  }

  return lines.join("\n");
}

export function buildContextCommandBudgetData(
  contextPack: BudgetedContextPack,
): ContextCommandBudgetData {
  const { budget } = contextPack;
  return {
    target_max_percent: budget.limits.targetPercent,
    switch_threshold_percent: budget.limits.switchThresholdPercent,
    mode: budget.config.mode,
    unit: budget.config.unit,
    max_context_size: budget.limits.maxContextSize,
    target_size: budget.limits.targetSize,
    switch_threshold_size: budget.limits.switchThresholdSize,
    prompt_estimate: budget.promptEstimate,
    context_estimate: budget.contextEstimate,
    status: budget.status,
    warnings: budget.warnings,
    truncation_decisions: budget.truncationDecisions,
  };
}

export function buildContextCommandDependencyData(
  dependency: IncludedContextDependency,
): ContextCommandDependencyData {
  return {
    stage: dependency.stage,
    required: dependency.required,
    layer: dependency.layer,
    artifact_path: dependency.artifactPath,
    structured_path: dependency.pointer.structuredPath,
    original_estimate: dependency.originalEstimate,
    included_estimate: dependency.includedEstimate,
    truncated: dependency.originalEstimate.characters !== dependency.includedEstimate.characters
      || dependency.layer === "pointer",
    pointer: dependency.pointer,
  };
}

function upgradeLegacyDependency(
  dependency: ContextArtifactSummary,
  index: number,
): IncludedContextDependency {
  const estimate = estimateContextSize(dependency.summary);
  const pointer = {
    stage: dependency.stage,
    artifactPath: dependency.artifactPath,
    reason: "full context compatibility mode",
  };
  return {
    ...dependency,
    layer: "full" as ContextLayer,
    required: true,
    priority: (index + 1) * 10,
    includedContent: dependency.summary,
    originalEstimate: estimate,
    includedEstimate: estimate,
    pointer,
    sections: [
      {
        id: `${dependency.stage}:full`,
        title: "Full Artifact",
        content: dependency.summary,
        estimate,
        source: pointer,
        priority: (index + 1) * 10,
        required: true,
      },
    ],
  };
}

function isBudgetedContextPack(context: ContextPack): context is BudgetedContextPack {
  return "budget" in context;
}
