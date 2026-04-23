import { describe, it, expect } from "vitest";
import { formatFeatureList } from "../../src/cli/output.js";

describe("formatFeatureList", () => {
  it("returns empty message when no features", () => {
    const result = formatFeatureList([]);
    expect(result).toContain("No workflows found");
  });

  it("formats single feature", () => {
    const result = formatFeatureList([
      { featureId: "auth", currentStage: "Q", status: "ready" },
    ]);
    expect(result).toContain("auth");
    expect(result).toContain("Q");
    expect(result).toContain("ready");
  });

  it("marks completed with checkmark", () => {
    const result = formatFeatureList([
      { featureId: "auth", currentStage: "PR", status: "completed" },
    ]);
    expect(result).toContain("✓");
  });

  it("marks waiting_approval with pause icon", () => {
    const result = formatFeatureList([
      { featureId: "auth", currentStage: "D", status: "waiting_approval" },
    ]);
    expect(result).toContain("⏸");
  });
});
