import { describe, it, expect } from "vitest";
import { createPromptRegistry, renderStagePrompt } from "../../src/prompts/template-registry.js";
import type { ContextPack } from "../../src/workflow/types.js";

function makeContext(stage: string): ContextPack {
  return {
    currentStage: stage as "Q",
    dependencies: [],
    maxLinesPerArtifact: 40,
    utilizationTarget: 0.8,
  };
}

describe("prompt template registry", () => {
  it("creates registry for all stages", () => {
    const registry = createPromptRegistry();
    const stages = ["Q", "R", "D", "S", "P", "W", "I", "PR"] as const;
    for (const stage of stages) {
      const template = registry.get(stage);
      expect(template.stage).toBe(stage);
    }
  });

  it("renders English prompt by default", () => {
    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: "test",
      stage: "Q",
      context: makeContext("Q"),
    });
    expect(prompt).toContain("Technical Questions");
    expect(prompt).toContain("Instructions");
    expect(prompt).not.toContain("技术问题");
  });

  it("renders Chinese prompt when lang=zh", () => {
    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: "test",
      stage: "Q",
      context: makeContext("Q"),
      lang: "zh",
    });
    expect(prompt).toContain("技术问题");
    expect(prompt).toContain("指令");
    expect(prompt).not.toContain("Technical Questions");
  });

  it("renders English prompt when lang=en", () => {
    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: "test",
      stage: "Q",
      context: makeContext("Q"),
      lang: "en",
    });
    expect(prompt).toContain("Technical Questions");
    expect(prompt).toContain("Instructions");
  });

  it("includes user input when provided", () => {
    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: "test",
      stage: "Q",
      context: makeContext("Q"),
      userInput: "Add login feature",
      lang: "en",
    });
    expect(prompt).toContain("Add login feature");
  });

  it("includes Chinese user input label when lang=zh", () => {
    const registry = createPromptRegistry();
    const prompt = renderStagePrompt(registry, {
      featureId: "test",
      stage: "Q",
      context: makeContext("Q"),
      userInput: "添加登录功能",
      lang: "zh",
    });
    expect(prompt).toContain("用户输入");
  });
});
