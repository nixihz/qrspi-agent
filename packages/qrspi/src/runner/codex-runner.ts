import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Runner, RunnerExecInput, RunnerExecResult, RunnerOptions } from "../workflow/types.js";
import { appendLiveOutput } from "./live-output.js";
import { resolveRunnerModel } from "./model-resolver.js";

export function buildCodexExecArgs(
  cwd: string,
  lastMessageFile: string,
  model: string | undefined,
  options: RunnerOptions,
): string[] {
  const args = [
    "exec",
    "--ephemeral",
    "--full-auto",
    "--cd", cwd,
    "--output-last-message", lastMessageFile,
    "--color", "never",
  ];
  if (model) args.push("--model", model);
  if (options.codexProfile) args.push("--profile", options.codexProfile);
  return args;
}

export class CodexRunner implements Runner {
  readonly name = "codex" as const;

  constructor(private readonly defaultOptions: RunnerOptions = {}) {}

  async run(input: RunnerExecInput): Promise<RunnerExecResult> {
    const options = { ...this.defaultOptions, ...input.options };
    const model = resolveRunnerModel("codex", options.model);
    const start = Date.now();

    const lastMessageFile = join(input.cwd, ".qrspi", "_codex_last_message.txt");
    const args = buildCodexExecArgs(input.cwd, lastMessageFile, model, options);

    return new Promise((resolve) => {
      const proc = spawn("codex", args, { cwd: input.cwd });
      let stdout = "";
      let stderr = "";

      proc.stdin.write(input.prompt);
      proc.stdin.end();

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

      proc.on("close", async (code) => {
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
