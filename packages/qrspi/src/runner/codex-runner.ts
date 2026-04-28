import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Runner, RunnerExecInput, RunnerExecResult, RunnerOptions } from "../workflow/types.js";
import { appendLiveOutput } from "./live-output.js";
import { resolveRunnerModel } from "./model-resolver.js";

const BENIGN_CODEX_STDERR_PATTERNS = [
  "WARN codex_analytics::client: events failed",
  "WARN codex_core::plugins::manager: failed to warm featured plugin ids cache",
  "WARN codex_rmcp_client::stdio_server_launcher: Failed to terminate MCP process group",
  "WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt",
];

export function sanitizeCodexStderr(stderr: string): string {
  const lines = stderr.split(/\r?\n/);
  const kept: string[] = [];
  let skippingHtmlBlock = false;

  for (const line of lines) {
    if (skippingHtmlBlock) {
      if (line.includes("</html>")) {
        skippingHtmlBlock = false;
      }
      continue;
    }

    const isBenign = BENIGN_CODEX_STDERR_PATTERNS.some((pattern) => line.includes(pattern));
    if (isBenign) {
      if (line.includes("<html>") && !line.includes("</html>")) {
        skippingHtmlBlock = true;
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

export function buildCodexExecArgs(
  cwd: string,
  lastMessageFile: string,
  model: string | undefined,
  options: RunnerOptions,
): string[] {
  const args = [
    "exec",
    "--ephemeral",
    "--disable", "plugins",
    "--disable", "general_analytics",
    "--json",
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
        const sanitizedStderr = sanitizeCodexStderr(stderr);

        resolve({
          stdout: lastMessage,
          stderr: sanitizedStderr,
          exitCode: code ?? 0,
          durationMs: Date.now() - start,
          meta: { runner: "codex", model, live_stdout_format: "codex-jsonl" },
        });
      });
    });
  }
}
