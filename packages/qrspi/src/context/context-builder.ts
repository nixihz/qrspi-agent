import { readFile } from "fs/promises";
import { join } from "path";
import type {
  StageCode,
  ContextPack,
  ContextArtifactSummary,
  SessionConfig,
  Lang,
} from "../workflow/types.js";
import { getStageDependencies } from "../workflow/stage-schema.js";
import { resolveFileStoreLayout, buildArtifactFilename } from "../storage/path-resolver.js";

const DEFAULT_MAX_LINES = 40;
const DEFAULT_UTILIZATION = 0.8;

export function summarizeArtifact(content: string, maxLines: number = DEFAULT_MAX_LINES): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const header = lines.slice(0, maxLines).join("\n");
  return `${header}\n\n...(truncated, original ${lines.length} lines)...`;
}

export async function buildContextPack(
  stage: StageCode,
  config: SessionConfig,
  maxLinesPerArtifact: number = DEFAULT_MAX_LINES,
  utilizationTarget: number = DEFAULT_UTILIZATION,
): Promise<ContextPack> {
  const layout = resolveFileStoreLayout(config);
  const deps = getStageDependencies(stage);
  const summaries: ContextArtifactSummary[] = [];

  for (const dep of deps) {
    const filename = buildArtifactFilename(dep.stage);
    const artifactPath = join(layout.artifactsDir, filename);

    try {
      const content = await readFile(artifactPath, "utf-8");
      const summary = summarizeArtifact(content, maxLinesPerArtifact);
      summaries.push({
        stage: dep.stage,
        artifactPath,
        summary,
      });
    } catch {
      if (dep.required) {
        // skip missing required artifacts silently
      }
    }
  }

  return {
    currentStage: stage,
    dependencies: summaries,
    maxLinesPerArtifact,
    utilizationTarget,
  };
}

export function formatContextForPrompt(context: ContextPack, lang: Lang = "en"): string {
  if (context.dependencies.length === 0) return "";

  const title = lang === "zh" ? "前置阶段上下文" : "Previous Stage Context";
  const summaryLabel = lang === "zh" ? "产物摘要" : "Artifact Summary";

  const parts: string[] = [`## ${title}\n`];
  for (const dep of context.dependencies) {
    parts.push(`### Stage ${dep.stage} ${summaryLabel}\n\n${dep.summary}\n`);
  }
  return parts.join("\n");
}
