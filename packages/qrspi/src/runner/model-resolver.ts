import type { RunnerName } from "../workflow/types.js";

const DEFAULT_MODELS: Record<RunnerName, string> = {
  claude: "kimi-for-coding",
  codex: "gpt-5.4",
  mock: "gpt-5.4",
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

export function resolveRunnerName(cliRunner?: string): RunnerName {
  const r = cliRunner ?? process.env["QRSPI_RUNNER"] ?? "claude";
  if (r === "claude" || r === "codex" || r === "mock") return r;
  return "claude";
}

export function supportedRunnerNames(): RunnerName[] {
  return ["claude", "codex", "mock"];
}
