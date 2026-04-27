import { spawn } from "child_process";
import type { Runner, RunnerExecInput, RunnerExecResult, RunnerOptions } from "../workflow/types.js";
import { appendLiveOutput } from "./live-output.js";
import { resolveRunnerModel } from "./model-resolver.js";

export class ClaudeRunner implements Runner {
  readonly name = "claude" as const;

  constructor(private readonly defaultOptions: RunnerOptions = {}) {}

  async run(input: RunnerExecInput): Promise<RunnerExecResult> {
    const options = { ...this.defaultOptions, ...input.options };
    const model = resolveRunnerModel("claude", options.model);
    const start = Date.now();

    const args = ["-p", input.prompt, "--permission-mode", "bypassPermissions"];
    if (model) args.push("--model", model);

    return new Promise((resolve) => {
      const proc = spawn("claude", args, { cwd: input.cwd });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stdout += chunk;
        appendLiveOutput(options.liveStdoutPath, chunk);
      });
      proc.stderr.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        appendLiveOutput(options.liveStderrPath, chunk);
      });

      proc.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
          durationMs: Date.now() - start,
          meta: { runner: "claude", model },
        });
      });
    });
  }
}
