import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { buildContextPack, summarizeArtifact } from "../../src/context/context-builder.js";
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
});
