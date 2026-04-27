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

const NO_ARTIFACT_LINE_LIMIT = 0;
const DEFAULT_UTILIZATION = 0.4;

export function summarizeArtifact(content: string, maxLines: number = NO_ARTIFACT_LINE_LIMIT): string {
  if (maxLines <= 0) return content;

  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const header = lines.slice(0, maxLines).join("\n");
  return `${header}\n\n...(truncated, original ${lines.length} lines)...`;
}

export async function buildContextPack(
  stage: StageCode,
  config: SessionConfig,
  maxLinesPerArtifact: number = NO_ARTIFACT_LINE_LIMIT,
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
  const summaryLabel = lang === "zh" ? "产物内容" : "Artifact Content";

  const parts: string[] = [`## ${title}\n`];
  for (const dep of context.dependencies) {
    parts.push(`### Stage ${dep.stage} ${summaryLabel}\n\n${dep.summary}\n`);
  }
  return parts.join("\n");
}
