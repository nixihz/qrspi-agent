import type {
  ContextBudgetAudit,
  ContextBudgetConfig,
  ContextBudgetLimit,
  ContextBudgetWarning,
  ContextOverBudgetError,
  ContextSizeEstimate,
  RunnerContextBudgetMeta,
  StageCode,
} from "../workflow/types.js";

export const DEFAULT_CONTEXT_TARGET_UTILIZATION = 0.4;
export const DEFAULT_CONTEXT_SWITCH_THRESHOLD_UTILIZATION = 0.6;
export const DEFAULT_MAX_CONTEXT_SIZE = 50_000;

export function createDefaultContextBudgetConfig(
  overrides: Partial<ContextBudgetConfig> = {},
): ContextBudgetConfig {
  return {
    mode: "layered",
    unit: "character",
    targetUtilization: DEFAULT_CONTEXT_TARGET_UTILIZATION,
    switchThresholdUtilization: DEFAULT_CONTEXT_SWITCH_THRESHOLD_UTILIZATION,
    maxContextSize: DEFAULT_MAX_CONTEXT_SIZE,
    includeBudgetNoteInPrompt: true,
    ...overrides,
  };
}

export function estimateContextSize(content: string): ContextSizeEstimate {
  if (content.length === 0) {
    return { characters: 0, lines: 0 };
  }

  return {
    characters: content.length,
    lines: content.split("\n").length,
  };
}

export function addSizeEstimates(estimates: ContextSizeEstimate[]): ContextSizeEstimate {
  return {
    characters: estimates.reduce((sum, item) => sum + item.characters, 0),
    lines: estimates.reduce((sum, item) => sum + item.lines, 0),
  };
}

export function calculateContextBudgetLimit(
  config: ContextBudgetConfig,
): ContextBudgetLimit {
  return {
    targetSize: Math.floor(config.maxContextSize * config.targetUtilization),
    switchThresholdSize: Math.floor(config.maxContextSize * config.switchThresholdUtilization),
    maxContextSize: config.maxContextSize,
    targetPercent: Math.round(config.targetUtilization * 100),
    switchThresholdPercent: Math.round(config.switchThresholdUtilization * 100),
  };
}

export function createContextBudgetWarnings(audit: ContextBudgetAudit): ContextBudgetWarning[] {
  const warnings: ContextBudgetWarning[] = [...audit.warnings];
  const size = audit.config.unit === "line"
    ? audit.promptEstimate.lines
    : audit.promptEstimate.characters;

  if (audit.status === "over_threshold") {
    warnings.push({
      code: "context_over_threshold",
      severity: "error",
      message: `Estimated prompt size ${size} exceeds switch threshold ${audit.limits.switchThresholdSize}.`,
    });
  } else if (audit.status === "over_target") {
    warnings.push({
      code: "context_over_target",
      severity: "warning",
      message: `Estimated prompt size ${size} exceeds target ${audit.limits.targetSize}.`,
    });
  }

  if (audit.truncationDecisions.length > 0) {
    warnings.push({
      code: "content_truncated",
      severity: "info",
      message: `${audit.truncationDecisions.length} context sections were reduced to fit the budget target.`,
    });
  }

  return dedupeWarnings(warnings);
}

export function assertContextWithinThreshold(
  stage: StageCode,
  audit: ContextBudgetAudit,
): ContextOverBudgetError | undefined {
  if (audit.status !== "over_threshold") return undefined;
  return {
    code: "context_over_budget",
    stage,
    status: audit.status,
    message: `Stage ${stage} context is over the session-switch threshold.`,
    budget: audit,
  };
}

export function buildRunnerContextBudgetMeta(
  audit: ContextBudgetAudit,
): RunnerContextBudgetMeta {
  return {
    status: audit.status,
    promptEstimate: audit.promptEstimate,
    contextEstimate: audit.contextEstimate,
    warningCount: audit.warnings.length,
    truncationCount: audit.truncationDecisions.length,
  };
}

export function updateContextBudgetForPrompt(
  audit: ContextBudgetAudit,
  prompt: string,
): ContextBudgetAudit {
  const promptEstimate = estimateContextSize(prompt);
  const promptValue = estimateBudgetValue(promptEstimate, audit.config);
  const status = promptValue > audit.limits.switchThresholdSize
    ? "over_threshold"
    : promptValue > audit.limits.targetSize
      ? "over_target"
      : "within_target";
  const auditWithoutBudgetWarnings: ContextBudgetAudit = {
    ...audit,
    status,
    promptEstimate,
    warnings: audit.warnings.filter((warning) =>
      warning.code !== "context_over_target" &&
      warning.code !== "context_over_threshold" &&
      warning.code !== "content_truncated"
    ),
  };

  return {
    ...auditWithoutBudgetWarnings,
    warnings: createContextBudgetWarnings(auditWithoutBudgetWarnings),
  };
}

export function estimateBudgetValue(
  estimate: ContextSizeEstimate,
  config: ContextBudgetConfig,
): number {
  return config.unit === "line" ? estimate.lines : estimate.characters;
}

function dedupeWarnings(warnings: ContextBudgetWarning[]): ContextBudgetWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.severity}:${warning.stage ?? ""}:${warning.artifactPath ?? ""}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
