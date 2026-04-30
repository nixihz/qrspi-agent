import type { ModelResolution, ModelTier, RunnerName, SliceDefinition } from "../workflow/types.js";

const DEFAULT_MODELS: Record<RunnerName, string> = {
  claude: "kimi-for-coding",
  codex: "gpt-5.4",
  mock: "gpt-5.4",
};

const DEFAULT_TIER_MODELS: Record<RunnerName, Record<ModelTier, string>> = {
  claude: {
    low: "kimi-for-coding",
    standard: "kimi-for-coding",
    powerful: "kimi-for-coding",
  },
  codex: {
    low: "gpt-5.4-mini",
    standard: "gpt-5.4",
    powerful: "gpt-5.5",
  },
  mock: {
    low: "gpt-5.4",
    standard: "gpt-5.4",
    powerful: "gpt-5.4",
  },
};

const TIER_RANK: Record<ModelTier, number> = {
  low: 0,
  standard: 1,
  powerful: 2,
};

export function resolveRunnerModel(runner: RunnerName, cliModel?: string): string {
  if (cliModel) return cliModel;

  const runnerKey = runner.toUpperCase();
  return (
    process.env[`QRSPI_${runnerKey}_MODEL`] ??
    process.env["QRSPI_MODEL"] ??
    DEFAULT_MODELS[runner] ??
    ""
  );
}

export function resolveRunnerModelForTier(
  runner: RunnerName,
  modelTier: ModelTier,
  cliModel?: string,
): ModelResolution {
  if (cliModel) {
    return { runner, model: cliModel, source: "cli", model_tier: modelTier };
  }

  const runnerKey = runner.toUpperCase();
  const tierKey = modelTier.toUpperCase();
  const candidates: Array<{ key: string; source: ModelResolution["source"] }> = [
    { key: `QRSPI_${runnerKey}_MODEL_${tierKey}`, source: "runner_tier_env" },
    { key: `QRSPI_MODEL_${tierKey}`, source: "tier_env" },
    { key: `QRSPI_${runnerKey}_MODEL`, source: "runner_env" },
    { key: "QRSPI_MODEL", source: "global_env" },
  ];

  for (const candidate of candidates) {
    const model = process.env[candidate.key];
    if (model) {
      return {
        runner,
        model,
        source: candidate.source,
        model_tier: modelTier,
        env_var: candidate.key,
      };
    }
  }

  return {
    runner,
    model: DEFAULT_TIER_MODELS[runner][modelTier],
    source: "tier_default",
    model_tier: modelTier,
  };
}

export function resolveSliceModelTier(slice: SliceDefinition): ModelTier {
  let resolved: ModelTier | undefined;

  for (const task of slice.tasks ?? []) {
    const tier = task.model_tier;
    if (!tier || !(tier in TIER_RANK)) continue;
    if (!resolved || TIER_RANK[tier] > TIER_RANK[resolved]) {
      resolved = tier;
    }
  }

  return resolved ?? "standard";
}

export function resolveRunnerName(cliRunner?: string): RunnerName {
  const r = cliRunner ?? process.env["QRSPI_RUNNER"] ?? "claude";
  if (r === "claude" || r === "codex" || r === "mock") return r;
  return "claude";
}

export function supportedRunnerNames(): RunnerName[] {
  return ["claude", "codex", "mock"];
}
