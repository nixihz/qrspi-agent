import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildBudgetedContextPack,
  buildContextPack,
  summarizeArtifact,
} from "../../src/context/context-builder.js";
import { initializeSessionDirectories, writeArtifact } from "../../src/storage/file-repository.js";
import type { SessionConfig } from "../../src/workflow/types.js";

function createTempConfig(featureId = "context-feature"): SessionConfig {
  const tmpDir = mkdtempSync(join(tmpdir(), "qrspi-context-test-"));
  return {
    featureId,
    projectRoot: tmpDir,
    outputDir: ".qrspi",
  };
}

describe("context builder", () => {
  let config: SessionConfig;

  beforeEach(async () => {
    config = createTempConfig();
    await initializeSessionDirectories(config);
  });

  afterEach(() => {
    rmSync(config.projectRoot, { recursive: true, force: true });
  });

  it("keeps full artifact content by default", async () => {
    const content = Array.from({ length: 80 }, (_, i) => `### Q${i + 1}: Question`).join("\n");
    await writeArtifact(config, {
      stage: "Q",
      title: "Q - Questions",
      content,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });

    const context = await buildContextPack("R", config);

    expect(context.maxLinesPerArtifact).toBe(0);
    expect(context.utilizationTarget).toBe(0.4);
    expect(context.dependencies).toHaveLength(1);
    expect(context.dependencies[0].summary).toBe(content);
    expect(context.dependencies[0].summary).not.toContain("truncated");
    expect(context.dependencies[0].summary).toContain("### Q80: Question");
  });

  it("can still truncate when a positive line limit is requested explicitly", () => {
    const content = ["line 1", "line 2", "line 3"].join("\n");

    expect(summarizeArtifact(content, 2)).toBe("line 1\nline 2\n\n...(truncated, original 3 lines)...");
  });

  it("keeps full artifact content in full budget mode", async () => {
    const content = Array.from({ length: 80 }, (_, i) => `### Q${i + 1}: Question`).join("\n");
    await writeArtifact(config, {
      stage: "Q",
      title: "Q - Questions",
      content,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });

    const context = await buildBudgetedContextPack("R", config, {
      budgetConfig: { mode: "full" },
    });

    expect(context.dependencies).toHaveLength(1);
    expect(context.dependencies[0].includedContent).toBe(content);
    expect(context.dependencies[0].layer).toBe("full");
  });

  it("uses layered context for P and does not embed large Q/R history wholesale", async () => {
    const largeQ = Array.from({ length: 160 }, (_, i) => `### Q${i + 1}: Question ${i + 1}`).join("\n");
    const largeR = Array.from({ length: 160 }, (_, i) => `## Q${i + 1}: Finding ${i + 1}`).join("\n");
    await writeArtifact(config, {
      stage: "Q",
      title: "Q - Questions",
      content: largeQ,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "R",
      title: "R - Research",
      content: largeR,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "D",
      title: "D - Design",
      content: "## Design Decisions\n- Use budgeted context\n## Risks\n- Missing evidence",
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "S",
      title: "S - Structure",
      content: "export interface ContextBudgetConfig {}\nexport function buildBudgetedContextPack() {}",
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });

    const context = await buildBudgetedContextPack("P", config);
    const qDep = context.dependencies.find((dep) => dep.stage === "Q")!;
    const rDep = context.dependencies.find((dep) => dep.stage === "R")!;
    const sDep = context.dependencies.find((dep) => dep.stage === "S")!;

    expect(qDep.layer).toBe("summary");
    expect(rDep.layer).toBe("summary");
    expect(sDep.layer).toBe("full");
    expect(qDep.includedContent).not.toBe(largeQ);
    expect(rDep.includedContent).not.toBe(largeR);
    expect(context.budget.dependencies.map((dep) => dep.stage)).toEqual(["Q", "R", "D", "S"]);
  });

  it("falls back to Q summary and R full for D when full Q/R is over budget", async () => {
    const largeQ = [
      "# Questions",
      "## Risks",
      "- Keep the gate context concise",
      ...Array.from({ length: 80 }, (_, i) => `Q detail ${i + 1} ${"x".repeat(20)}`),
    ].join("\n");
    const research = [
      "# Research Report",
      "## Codebase Technical Map",
      "- Engine owns workflow state",
      "- Runner metadata records model selection",
    ].join("\n");

    await writeArtifact(config, {
      stage: "Q",
      title: "Q - Questions",
      content: largeQ,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });
    await writeArtifact(config, {
      stage: "R",
      title: "R - Research",
      content: research,
      generatedAt: new Date().toISOString(),
      artifactPath: "",
    });

    const context = await buildBudgetedContextPack("D", config, {
      budgetConfig: { maxContextSize: 1_500 },
    });
    const qDep = context.dependencies.find((dep) => dep.stage === "Q")!;
    const rDep = context.dependencies.find((dep) => dep.stage === "R")!;

    expect(qDep.layer).toBe("summary");
    expect(qDep.includedContent).not.toBe(largeQ);
    expect(qDep.includedContent).toContain("Keep the gate context concise");
    expect(rDep.layer).toBe("full");
    expect(rDep.includedContent).toBe(research);
    expect(context.budget.status).toBe("within_target");
  });
});
