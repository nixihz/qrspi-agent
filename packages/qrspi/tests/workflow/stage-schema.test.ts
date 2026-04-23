import { describe, it, expect } from "vitest";
import {
  createStageDefinitions,
  getStageDefinition,
  getNextStage,
  isGateStage,
  getStageName,
  getStageDescription,
  getStageOrder,
  getStageIndex,
  isValidStageCode,
  getStageDependencies,
} from "../../src/workflow/stage-schema.js";
import type { StageCode } from "../../src/workflow/types.js";

describe("stage-schema", () => {
  it("returns all stage definitions", () => {
    const defs = createStageDefinitions();
    const codes = Object.keys(defs) as StageCode[];
    expect(codes).toHaveLength(8);
    expect(codes).toEqual(["Q", "R", "D", "S", "P", "W", "I", "PR"]);
  });

  it("each stage has a complete definition", () => {
    const defs = createStageDefinitions();
    for (const [code, def] of Object.entries(defs)) {
      expect(def.code).toBe(code);
      expect(def.name).toBeTruthy();
      expect(def.kind).toMatch(/alignment|execution/);
      expect(typeof def.gateRequired).toBe("boolean");
      expect(def.dependencies).toBeInstanceOf(Array);
    }
  });

  it("gets a single stage definition", () => {
    const def = getStageDefinition("Q");
    expect(def.code).toBe("Q");
    expect(def.name).toContain("Questions");
    expect(def.kind).toBe("alignment");
    expect(def.gateRequired).toBe(false);
  });

  it("stage order is correct", () => {
    expect(getNextStage("Q")).toBe("R");
    expect(getNextStage("R")).toBe("D");
    expect(getNextStage("D")).toBe("S");
    expect(getNextStage("S")).toBe("P");
    expect(getNextStage("P")).toBe("W");
    expect(getNextStage("W")).toBe("I");
    expect(getNextStage("I")).toBe("PR");
    expect(getNextStage("PR")).toBeUndefined();
  });

  it("correctly identifies gate stages", () => {
    expect(isGateStage("D")).toBe(true);
    expect(isGateStage("S")).toBe(true);
    expect(isGateStage("PR")).toBe(true);
    expect(isGateStage("Q")).toBe(false);
    expect(isGateStage("R")).toBe(false);
    expect(isGateStage("P")).toBe(false);
    expect(isGateStage("W")).toBe(false);
    expect(isGateStage("I")).toBe(false);
  });

  it("stage names and descriptions", () => {
    expect(getStageName("Q")).toContain("Questions");
    expect(getStageDescription("Q")).toBeTruthy();
    expect(getStageDescription("PR")).toContain("Human review");
  });

  it("stage order and index", () => {
    const order = getStageOrder();
    expect(order).toHaveLength(8);
    expect(getStageIndex("Q")).toBe(0);
    expect(getStageIndex("PR")).toBe(7);
  });

  it("validates stage codes", () => {
    expect(isValidStageCode("Q")).toBe(true);
    expect(isValidStageCode("PR")).toBe(true);
    expect(isValidStageCode("X")).toBe(false);
    expect(isValidStageCode("")).toBe(false);
  });

  it("gets stage dependencies", () => {
    const deps = getStageDependencies("D");
    expect(deps).toHaveLength(2);
    expect(deps.map((d) => d.stage)).toContain("Q");
    expect(deps.map((d) => d.stage)).toContain("R");
    expect(deps[0].required).toBe(true);
    expect(deps[0].summaryOnly).toBe(true);
  });
});
