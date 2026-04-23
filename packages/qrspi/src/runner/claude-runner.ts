import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { Runner, RunnerExecInput, RunnerExecResult } from "../workflow/types.js";
import { resolveRunnerModel } from "./model-resolver.js";

export class ClaudeRunner implements Runner {
  readonly name = "claude" as const;

  async run(input: RunnerExecInput): Promise<RunnerExecResult> {
    const model = resolveRunnerModel("claude", input.options.model);
    const timeoutMs = input.options.timeoutMs ?? 300_000;
    const start = Date.now();

    const args = ["-p", input.prompt, "--permission-mode", "bypassPermissions"];
    if (model) args.push("--model", model);

    return new Promise((resolve) => {
      const proc = spawn("claude", args, { cwd: input.cwd });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          stdout,
          stderr: stderr + "\n[TIMEOUT]",
          exitCode: -1,
          durationMs: Date.now() - start,
          meta: { runner: "claude", model, timed_out: true },
        });
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
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
