import type {
  ContextBudgetAudit,
  ContextBudgetConfig,
  ContextBudgetLimit,
  ContextBudgetStatus,
  ContextSizeEstimate,
  ContextTruncationDecision,
  IncludedContextDependency,
} from "../workflow/types.js";
import {
  addSizeEstimates,
  calculateContextBudgetLimit,
  createContextBudgetWarnings,
  estimateBudgetValue,
  estimateContextSize,
} from "./context-budget.js";
import { downgradeDependencyToPointer } from "./context-layer-renderer.js";

export function applyContextBudget(
  dependencies: IncludedContextDependency[],
  config: ContextBudgetConfig,
  promptOverhead: ContextSizeEstimate,
): ContextBudgetAudit {
  const limits = calculateContextBudgetLimit(config);
  const initialContextEstimate = addSizeEstimates(dependencies.map((dependency) => dependency.includedEstimate));
  const initialPromptEstimate = addSizeEstimates([promptOverhead, initialContextEstimate]);

  if (config.mode === "full") {
    const auditWithoutWarnings = createAudit(
      dependencies,
      config,
      limits,
      initialPromptEstimate,
      initialContextEstimate,
      [],
    );
    return {
      ...auditWithoutWarnings,
      warnings: createContextBudgetWarnings(auditWithoutWarnings),
    };
  }

  const initialPromptValue = estimateBudgetValue(initialPromptEstimate, config);
  const shouldTruncate = initialPromptValue > limits.targetSize;
  const truncated = shouldTruncate
    ? truncateContextToBudget(dependencies, limits, config, promptOverhead)
    : { dependencies, decisions: [] };
  const contextEstimate = addSizeEstimates(truncated.dependencies.map((dependency) => dependency.includedEstimate));
  const promptEstimate = addSizeEstimates([promptOverhead, contextEstimate]);
  const auditWithoutWarnings = createAudit(
    truncated.dependencies,
    config,
    limits,
    promptEstimate,
    contextEstimate,
    truncated.decisions,
  );

  return {
    ...auditWithoutWarnings,
    warnings: createContextBudgetWarnings(auditWithoutWarnings),
  };
}

export function truncateContextToBudget(
  dependencies: IncludedContextDependency[],
  limits: ContextBudgetLimit,
  config: ContextBudgetConfig,
  promptOverhead: ContextSizeEstimate,
): {
  dependencies: IncludedContextDependency[];
  decisions: ContextTruncationDecision[];
} {
  const working = dependencies.map((dependency) => ({ ...dependency }));
  const decisions: ContextTruncationDecision[] = [];
  const candidates = working
    .map((dependency, index) => ({ dependency, index }))
    .filter(({ dependency }) => !dependency.required && dependency.layer !== "pointer")
    .sort((left, right) => {
      if (left.dependency.layer !== right.dependency.layer) {
        return layerRank(left.dependency.layer) - layerRank(right.dependency.layer);
      }
      if (left.dependency.priority !== right.dependency.priority) {
        return left.dependency.priority - right.dependency.priority;
      }
      return left.index - right.index;
    });

  for (const candidate of candidates) {
    if (currentPromptValue(working, promptOverhead, config) <= limits.targetSize) break;

    const before = candidate.dependency.includedEstimate;
    const downgraded = downgradeDependencyToPointer(
      candidate.dependency,
      "budget target truncation",
    );
    working[candidate.index] = downgraded;
    decisions.push({
      id: `${candidate.dependency.stage}-${decisions.length + 1}`,
      stage: candidate.dependency.stage,
      artifactPath: candidate.dependency.artifactPath,
      fromLayer: candidate.dependency.layer,
      toLayer: "pointer",
      reason: candidate.dependency.layer === "summary" ? "optional_summary" : "lower_priority",
      before,
      after: downgraded.includedEstimate,
      pointer: downgraded.pointer,
    });
  }

  return { dependencies: working, decisions };
}

function createAudit(
  dependencies: IncludedContextDependency[],
  config: ContextBudgetConfig,
  limits: ContextBudgetLimit,
  promptEstimate: ContextSizeEstimate,
  contextEstimate: ContextSizeEstimate,
  truncationDecisions: ContextTruncationDecision[],
): ContextBudgetAudit {
  return {
    status: classifyBudgetStatus(promptEstimate, config, limits),
    config,
    limits,
    promptEstimate,
    contextEstimate,
    dependencies,
    truncationDecisions,
    warnings: [],
  };
}

function classifyBudgetStatus(
  promptEstimate: ContextSizeEstimate,
  config: ContextBudgetConfig,
  limits: ContextBudgetLimit,
): ContextBudgetStatus {
  const size = estimateBudgetValue(promptEstimate, config);
  if (size > limits.switchThresholdSize) return "over_threshold";
  if (size > limits.targetSize) return "over_target";
  return "within_target";
}

function currentPromptValue(
  dependencies: IncludedContextDependency[],
  promptOverhead: ContextSizeEstimate,
  config: ContextBudgetConfig,
): number {
  const contextEstimate = addSizeEstimates(dependencies.map((dependency) => dependency.includedEstimate));
  return estimateBudgetValue(addSizeEstimates([promptOverhead, contextEstimate]), config);
}

function layerRank(layer: IncludedContextDependency["layer"]): number {
  if (layer === "summary") return 1;
  if (layer === "full") return 2;
  if (layer === "focused") return 3;
  return 4;
}

export function estimatePromptOverhead(stageInstructionPrompt: string): ContextSizeEstimate {
  return estimateContextSize(stageInstructionPrompt);
}
