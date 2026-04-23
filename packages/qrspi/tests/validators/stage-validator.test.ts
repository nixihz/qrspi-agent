import { describe, it, expect } from "vitest";
import { validateStageArtifact, createStageValidators } from "../../src/validators/stage-validator.js";
import type { StageCode } from "../../src/workflow/types.js";

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

describe("stage-validator", () => {
  it("validates Q stage - content too short", () => {
    const result = validateStageArtifact("Q", "short");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("too short"))).toBe(true);
  });

  it("validates Q stage - normal content", () => {
    const content = Array.from({ length: 15 }, (_, i) => `### Q${i + 1}: Question ${i + 1}`).join("\n");
    const result = validateStageArtifact("Q", content);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("validates Q stage - too few questions", () => {
    const content = "### Q1: Question 1\n\n### Q2: Question 2\n\n";
    const result = validateStageArtifact("Q", content);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Too few questions"))).toBe(true);
  });

  it("validates R stage", () => {
    const result = validateStageArtifact("R", makeLines(20));
    expect(result.valid).toBe(true);
  });

  it("validates D stage - missing required sections", () => {
    const result = validateStageArtifact("D", makeLines(25));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("Missing required section"))).toBe(true);
  });

  it("validates D stage - normal content", () => {
    const content = `
## 1. Current State
status

## 2. Target State
expected

## 3. Design Decisions
alternative A
alternative B
` + makeLines(20);
    const result = validateStageArtifact("D", content);
    expect(result.valid).toBe(true);
  });

  it("validates S stage - missing type definitions", () => {
    const result = validateStageArtifact("S", makeLines(25));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === "warning" && i.message.includes("type definitions"))).toBe(true);
  });

  it("validates W stage - invalid JSON", () => {
    const result = validateStageArtifact("W", "not json");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("JSON"))).toBe(true);
  });

  it("validates W stage - valid JSON", () => {
    const content = JSON.stringify({
      slices: [
        { name: "slice1", description: "desc", order: 1, tasks: [], checkpoint: "ok" },
      ],
    });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(true);
  });

  it("validates W stage - empty slices", () => {
    const content = JSON.stringify({ slices: [] });
    const result = validateStageArtifact("W", content);
    expect(result.valid).toBe(false);
  });

  it("creates validators for all stages", () => {
    const validators = createStageValidators();
    const stages: StageCode[] = ["Q", "R", "D", "S", "P", "W", "I", "PR"];
    for (const stage of stages) {
      expect(validators[stage]).toBeDefined();
      expect(validators[stage].stage).toBe(stage);
    }
  });

  it("validates I and PR stages", () => {
    expect(validateStageArtifact("I", makeLines(10)).valid).toBe(true);
    expect(validateStageArtifact("PR", makeLines(10)).valid).toBe(true);
  });
});
