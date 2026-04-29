import { describe, expect, it } from "vitest";

import { extractFocusedContextData } from "../../src/context/focused-extraction.js";
import { estimateContextSize } from "../../src/context/context-budget.js";
import type { ContextSourceArtifact } from "../../src/workflow/types.js";

function source(overrides: Partial<ContextSourceArtifact>): ContextSourceArtifact {
  const rawContent = overrides.rawContent ?? "";
  return {
    stage: overrides.stage ?? "D",
    artifactPath: "artifact.md",
    rawContent,
    structuredData: overrides.structuredData,
    estimate: estimateContextSize(rawContent),
    missing: false,
    warnings: [],
  };
}

describe("focused extraction", () => {
  it("prefers structured data when available", () => {
    const result = extractFocusedContextData(source({
      stage: "D",
      rawContent: "## Risks\n- markdown risk",
      structuredData: {
        structured_data: {
          decisions: ["Use layered context"],
          risks: ["structured risk"],
        },
      },
    }));

    expect(result.decisions).toEqual(["Use layered context"]);
    expect(result.risks).toEqual(["structured risk"]);
  });

  it("falls back to markdown headings", () => {
    const result = extractFocusedContextData(source({
      stage: "S",
      rawContent: [
        "## Architecture Constraints",
        "- Keep markdown as source of truth",
        "",
        "```ts",
        "export interface ContextBudgetConfig {}",
        "export function buildBudgetedContextPack() {}",
        "```",
      ].join("\n"),
    }));

    expect(result.constraints).toContain("Keep markdown as source of truth");
    expect(result.interfaces).toContain("ContextBudgetConfig");
    expect(result.functions).toContain("buildBudgetedContextPack");
  });
});
