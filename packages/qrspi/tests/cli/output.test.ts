import { describe, it, expect } from "vitest";
import { formatFeatureList, formatSliceStatusOutput, formatStatusOutput } from "../../src/cli/output.js";

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

  it("marks blocked and needs_context with exclamation icon", () => {
    const blocked = formatFeatureList([
      { featureId: "auth", currentStage: "I", status: "blocked" },
    ]);
    const needsContext = formatFeatureList([
      { featureId: "auth", currentStage: "I", status: "needs_context" },
    ]);

    expect(blocked).toContain("!");
    expect(needsContext).toContain("!");
  });
});

describe("formatSliceStatusOutput", () => {
  it("prints an empty-state message when no slice records exist", () => {
    const result = formatSliceStatusOutput(
      { slices: [] },
      { featureId: "demo-feature" },
    );

    expect(result).toContain("Slice Status (Feature: demo-feature)");
    expect(result).toContain("No slice execution state recorded");
  });

  it("formats slice execution records with required fields", () => {
    const result = formatSliceStatusOutput(
      {
        current_slice_order: 2,
        slices: [
          {
            slice_name: "core-state",
            slice_order: 1,
            status: "completed",
            attempts: 1,
            model_tier: "low",
            started_at: "2026-04-29T09:00:00.000Z",
          },
        ],
      },
      {
        featureId: "demo-feature",
        currentSliceOrder: 2,
      },
    );

    expect(result).toContain("Current Slice Order: 2");
    expect(result).toContain("[1] core-state");
    expect(result).toContain("status: completed");
    expect(result).toContain("start_time: 2026-04-29T09:00:00.000Z");
    expect(result).toContain("attempts: 1");
  });
});

describe("formatStatusOutput", () => {
  it("appends a slice summary with distinct markers when slice execution state exists", () => {
    const result = formatStatusOutput(
      {
        featureId: "demo-feature",
        currentStage: "I",
        status: "idle",
        createdAt: "2026-04-29T09:00:00.000Z",
        updatedAt: "2026-04-29T09:00:00.000Z",
      },
      {
        featureId: "demo-feature",
        currentStage: "I",
        status: "running",
        approvals: [],
        stage_attempts: {},
        history: [],
        lastError: "",
        updatedAt: "2026-04-29T09:00:00.000Z",
      },
      {
        featureId: "demo-feature",
        current_slice_order: 2,
        updatedAt: "2026-04-29T09:10:00.000Z",
        slices: [
          {
            slice_name: "core-state",
            slice_order: 1,
            status: "completed",
            attempts: 1,
            model_tier: "low",
            started_at: "2026-04-29T09:00:00.000Z",
          },
          {
            slice_name: "status-surface",
            slice_order: 2,
            status: "running",
            attempts: 2,
            model_tier: "standard",
            started_at: "2026-04-29T09:06:00.000Z",
          },
          {
            slice_name: "retry-path",
            slice_order: 3,
            status: "failed",
            attempts: 1,
            model_tier: "standard",
            started_at: "2026-04-29T09:08:00.000Z",
          },
        ],
      },
    );

    expect(result).toContain("QRSPI Workflow Status");
    expect(result).toContain("Slice Summary (current: 2)");
    expect(result).toContain("✓ [1] core-state | status=completed | start=2026-04-29T09:00:00.000Z");
    expect(result).toContain(">>> [2] status-surface | status=running | start=2026-04-29T09:06:00.000Z");
    expect(result).toContain("! [3] retry-path | status=failed | start=2026-04-29T09:08:00.000Z");
  });
});
