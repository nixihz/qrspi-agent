import { describe, it, expect } from "vitest";
import { buildRunner, resolveRunnerName, resolveRunnerModel, supportedRunnerNames } from "../../src/runner/index.js";
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

  it("builds mock runner", () => {
    const runner = buildRunner("mock");
    expect(runner.name).toBe("mock");
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
});
