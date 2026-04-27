import type { Runner, RunnerName, RunnerOptions } from "../workflow/types.js";
import { MockRunner } from "./mock-runner.js";
import { ClaudeRunner } from "./claude-runner.js";
import { CodexRunner } from "./codex-runner.js";
import { resolveRunnerName, resolveRunnerModel, supportedRunnerNames } from "./model-resolver.js";

export { resolveRunnerName, resolveRunnerModel, supportedRunnerNames };

export function buildRunner(name: RunnerName, options: RunnerOptions = {}): Runner {
  switch (name) {
    case "mock":
      return new MockRunner(options);
    case "claude":
      return new ClaudeRunner(options);
    case "codex":
      return new CodexRunner(options);
    default:
      throw new Error(`Unknown runner: ${name as string}. Supported: ${supportedRunnerNames().join(", ")}`);
  }
}

export async function executeRunner(
  runner: Runner,
  input: Parameters<Runner["run"]>[0],
): Promise<ReturnType<Runner["run"]>> {
  return runner.run(input);
}
