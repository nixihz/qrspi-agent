import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { delimiter, join } from "path";
import { describe, it, expect } from "vitest";
import { buildCodexExecArgs, CodexRunner, sanitizeCodexStderr } from "../../src/runner/codex-runner.js";
import {
  buildRunner,
  resolveRunnerName,
  resolveRunnerModel,
  resolveRunnerModelForTier,
  resolveSliceModelTier,
  supportedRunnerNames,
} from "../../src/runner/index.js";
import { MockRunner } from "../../src/runner/mock-runner.js";
import type { RunnerExecInput } from "../../src/workflow/types.js";

describe("runner", () => {
  it("returns supported runner list", () => {
    const names = supportedRunnerNames();
    expect(names).toContain("mock");
    expect(names).toContain("claude");
    expect(names).toContain("codex");
  });

  it("resolves runner name", () => {
    expect(resolveRunnerName("mock")).toBe("mock");
    expect(resolveRunnerName("claude")).toBe("claude");
    // unknown runner falls back to claude
    expect(resolveRunnerName("unknown")).toBe("claude");
    expect(resolveRunnerName()).toBe("claude");
  });

  it("resolves runner model", () => {
    expect(resolveRunnerModel("mock")).toBe("gpt-5.4");
    expect(resolveRunnerModel("claude")).toBe("kimi-for-coding");
    expect(resolveRunnerModel("codex")).toBe("gpt-5.4");
  });

  it("resolves runner model by model tier with CLI override first", () => {
    expect(resolveRunnerModelForTier("codex", "low").model).toBe("gpt-5.4-mini");
    expect(resolveRunnerModelForTier("codex", "standard").model).toBe("gpt-5.4");
    expect(resolveRunnerModelForTier("codex", "powerful").model).toBe("gpt-5.5");
    expect(resolveRunnerModelForTier("codex", "powerful", "cli-model")).toMatchObject({
      model: "cli-model",
      source: "cli",
      model_tier: "powerful",
    });
  });

  it("resolves tier-specific model environment overrides", () => {
    const previousRunnerTier = process.env.QRSPI_CODEX_MODEL_POWERFUL;
    const previousTier = process.env.QRSPI_MODEL_POWERFUL;
    try {
      process.env.QRSPI_MODEL_POWERFUL = "global-powerful";
      expect(resolveRunnerModelForTier("codex", "powerful")).toMatchObject({
        model: "global-powerful",
        source: "tier_env",
        env_var: "QRSPI_MODEL_POWERFUL",
      });

      process.env.QRSPI_CODEX_MODEL_POWERFUL = "codex-powerful";
      expect(resolveRunnerModelForTier("codex", "powerful")).toMatchObject({
        model: "codex-powerful",
        source: "runner_tier_env",
        env_var: "QRSPI_CODEX_MODEL_POWERFUL",
      });
    } finally {
      if (previousRunnerTier === undefined) delete process.env.QRSPI_CODEX_MODEL_POWERFUL;
      else process.env.QRSPI_CODEX_MODEL_POWERFUL = previousRunnerTier;
      if (previousTier === undefined) delete process.env.QRSPI_MODEL_POWERFUL;
      else process.env.QRSPI_MODEL_POWERFUL = previousTier;
    }
  });

  it("promotes a slice to its most powerful task model tier", () => {
    expect(resolveSliceModelTier({
      name: "mixed",
      description: "mixed complexity",
      order: 1,
      checkpoint: "done",
      tasks: [
        { id: "t1", description: "simple", estimated_minutes: 5, context_budget: "low", dependencies: [], model_tier: "low" },
        { id: "t2", description: "broad", estimated_minutes: 30, context_budget: "high", dependencies: ["t1"], model_tier: "powerful" },
      ],
    })).toBe("powerful");
  });

  it("builds mock runner", () => {
    const runner = buildRunner("mock");
    expect(runner.name).toBe("mock");
  });

  it("passes buildRunner model options to runner execution", async () => {
    const runner = buildRunner("mock", { model: "custom-model" });

    const result = await runner.run({
      prompt: "test prompt",
      cwd: "/tmp",
      stage: "Q",
      options: {},
    });

    expect(result.meta.model).toBe("custom-model");
  });

  it("runs codex in ephemeral mode to avoid nested session persistence noise", () => {
    const args = buildCodexExecArgs(
      "/repo",
      "/repo/.qrspi/_codex_last_message.txt",
      "gpt-5.5",
      { codexProfile: "default" },
    );

    expect(args).toEqual([
      "exec",
      "--ephemeral",
      "--disable",
      "plugins",
      "--disable",
      "general_analytics",
      "--json",
      "--full-auto",
      "--cd",
      "/repo",
      "--output-last-message",
      "/repo/.qrspi/_codex_last_message.txt",
      "--color",
      "never",
      "--model",
      "gpt-5.5",
      "--profile",
      "default",
    ]);
  });

  it("removes benign codex stderr noise while preserving real errors", () => {
    const stderr = [
      "Reading prompt from stdin...",
      "2026-04-28T07:13:15.856964Z  WARN codex_analytics::client: events failed with status 403 Forbidden: <html>",
      "  <head>",
      "  </head>",
      "</html>",
      "2026-04-28T07:05:53.374127Z  WARN codex_rmcp_client::stdio_server_launcher: Failed to terminate MCP process group 48040: Operation not permitted (os error 1)",
      "2026-04-28T07:05:53.914616Z  WARN codex_core::plugins::manager: failed to warm featured plugin ids cache error=remote plugin sync request to https://chatgpt.com/backend-api/plugins/featured failed with status 403 Forbidden: <html>",
      "  <body>",
      "</html>",
      "2026-04-28T07:05:54.251355Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: prompt must be at most 128 characters",
      "Error: thread/start failed",
    ].join("\n");

    expect(sanitizeCodexStderr(stderr)).toBe(["Reading prompt from stdin...", "Error: thread/start failed"].join("\n"));
  });

  it("writes codex stdout and stderr chunks to live files before process close", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "qrspi-codex-runner-"));
    const binDir = join(tempRoot, "bin");
    const repoDir = join(tempRoot, "repo");
    const liveDir = join(tempRoot, "live");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(repoDir, ".qrspi"), { recursive: true });

    const fakeCodexPath = join(binDir, "codex");
    writeFileSync(
      fakeCodexPath,
      [
        "#!/usr/bin/env node",
        "const fs = require('fs');",
        "const outputIndex = process.argv.indexOf('--output-last-message');",
        "const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;",
        "process.stdin.resume();",
        "process.stdout.write('{\"type\":\"session.started\"}\\n');",
        "process.stderr.write('stderr chunk 1\\n');",
        "setTimeout(() => {",
        "  process.stdout.write('{\"type\":\"assistant.delta\",\"delta\":\"hello\"}\\n');",
        "  process.stderr.write('stderr chunk 2\\n');",
        "  if (outputFile) fs.writeFileSync(outputFile, '# Final Artifact\\n\\nDONE\\n');",
        "  setTimeout(() => process.exit(0), 100);",
        "}, 100);",
      ].join("\n"),
      "utf-8",
    );
    chmodSync(fakeCodexPath, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;

    const liveStdoutPath = join(liveDir, "nested", "live_stdout.txt");
    const liveStderrPath = join(liveDir, "nested", "live_stderr.txt");
    const runner = new CodexRunner({ model: "test-model" });
    const runPromise = runner.run({
      prompt: "test prompt",
      cwd: repoDir,
      stage: "Q",
      options: { liveStdoutPath, liveStderrPath },
    });

    try {
      await waitForFileContent(liveStdoutPath, "session.started");
      await waitForFileContent(liveStderrPath, "stderr chunk 1");

      const result = await runPromise;

      expect(readFileSync(liveStdoutPath, "utf-8")).toContain("assistant.delta");
      expect(readFileSync(liveStderrPath, "utf-8")).toContain("stderr chunk 2");
      expect(result.stdout).toBe("# Final Artifact\n\nDONE\n");
      expect(result.stderr).toContain("stderr chunk 1");
      expect(result.stderr).toContain("stderr chunk 2");
      expect(result.meta.live_stdout_format).toBe("codex-jsonl");
    } finally {
      process.env.PATH = previousPath;
      await runPromise.catch(() => undefined);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("mock runner executes", async () => {
    const runner = new MockRunner();
    const input: RunnerExecInput = {
      prompt: "test prompt",
      cwd: "/tmp",
      stage: "Q",
      options: {},
    };
    const result = await runner.run(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Technical Questions");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("mock runner returns content for all stages", async () => {
    const runner = new MockRunner();
    const stages = ["Q", "R", "D", "S", "P", "W", "I", "PR"] as const;
    for (const stage of stages) {
      const result = await runner.run({
        prompt: "test",
        cwd: "/tmp",
        stage,
        options: {},
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    }
  });

  it("mock runner PR template uses the canonical PR sections", async () => {
    const runner = new MockRunner();
    const result = await runner.run({
      prompt: "test",
      cwd: "/tmp",
      stage: "PR",
      options: {},
    });

    expect(result.stdout).toContain("## Change Summary");
    expect(result.stdout).toContain("## Test Coverage");
    expect(result.stdout).toContain("## Release Criteria");
    expect(result.stdout).toContain("## Review Checklist");
  });
});

async function waitForFileContent(path: string, expected: string): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    try {
      if (readFileSync(path, "utf-8").includes(expected)) return;
    } catch {
      // file is created by the runner data handler
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for ${expected} in ${path}`);
}
