import { spawn } from "child_process";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import type { Runner, RunnerExecInput, RunnerExecResult } from "../workflow/types.js";
import { resolveRunnerModel } from "./model-resolver.js";

export class CodexRunner implements Runner {
  readonly name = "codex" as const;

  async run(input: RunnerExecInput): Promise<RunnerExecResult> {
    const model = resolveRunnerModel("codex", input.options.model);
    const timeoutMs = input.options.timeoutMs ?? 300_000;
    const start = Date.now();

    const lastMessageFile = join(input.cwd, ".qrspi", "_codex_last_message.txt");
    const args = [
      "exec",
      "--full-auto",
      "--cd", input.cwd,
      "--output-last-message", lastMessageFile,
      "--color", "never",
    ];
    if (model) args.push("--model", model);
    if (input.options.codexProfile) args.push("--profile", input.options.codexProfile);

    return new Promise((resolve) => {
      const proc = spawn("codex", args, { cwd: input.cwd });
      let stdout = "";
      let stderr = "";

      proc.stdin.write(input.prompt);
      proc.stdin.end();

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          stdout,
          stderr: stderr + "\n[TIMEOUT]",
          exitCode: -1,
          durationMs: Date.now() - start,
          meta: { runner: "codex", model, timed_out: true },
        });
      }, timeoutMs);

      proc.on("close", async (code) => {
        clearTimeout(timer);
        let lastMessage = stdout;
        try {
          lastMessage = await readFile(lastMessageFile, "utf-8");
        } catch {
          // fall back to stdout
        }
        resolve({
          stdout: lastMessage,
          stderr,
          exitCode: code ?? 0,
          durationMs: Date.now() - start,
          meta: { runner: "codex", model },
        });
      });
    });
  }
}
