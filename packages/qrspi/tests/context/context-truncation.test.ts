import { describe, expect, it } from "vitest";

import { createDefaultContextBudgetConfig, estimateContextSize } from "../../src/context/context-budget.js";
import { applyContextBudget } from "../../src/context/context-truncation.js";
import type { IncludedContextDependency, StageCode } from "../../src/workflow/types.js";

function dep(stage: StageCode, layer: IncludedContextDependency["layer"], size: number, required = false): IncludedContextDependency {
  const content = `${stage} `.repeat(size);
  const estimate = estimateContextSize(content);
  const pointer = {
    stage,
    artifactPath: `${stage}.md`,
    reason: "test",
  };
  return {
    stage,
    artifactPath: `${stage}.md`,
    summary: content,
    layer,
    required,
    priority: size,
    includedContent: content,
    originalEstimate: estimate,
    includedEstimate: estimate,
    pointer,
    sections: [],
  };
}

describe("context truncation", () => {
  it("deterministically downgrades optional summary context before required content", () => {
    const config = createDefaultContextBudgetConfig({ maxContextSize: 300 });
    const dependencies = [
      dep("Q", "summary", 80, false),
      dep("R", "summary", 70, false),
      dep("S", "full", 20, true),
    ];

    const first = applyContextBudget(dependencies, config, estimateContextSize(""));
    const second = applyContextBudget(dependencies, config, estimateContextSize(""));

    expect(first.truncationDecisions.length).toBeGreaterThan(0);
    expect(first.truncationDecisions[0]).toMatchObject({
      stage: "R",
      fromLayer: "summary",
      toLayer: "pointer",
      reason: "optional_summary",
    });
    expect(first.truncationDecisions).toEqual(second.truncationDecisions);
    expect(first.dependencies.find((item) => item.stage === "S")!.layer).toBe("full");
  });
});
