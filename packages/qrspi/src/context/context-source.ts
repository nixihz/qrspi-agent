import { stat } from "fs/promises";

import {
  readArtifact,
  readStructuredArtifact,
  resolveArtifactPointer,
} from "../storage/file-repository.js";
import type {
  ContextBudgetWarning,
  ContextSourceArtifact,
  SessionConfig,
  StageCode,
} from "../workflow/types.js";
import { estimateContextSize } from "./context-budget.js";

export async function loadContextSourceArtifact(
  config: SessionConfig,
  stage: StageCode,
): Promise<ContextSourceArtifact> {
  const artifact = await readArtifact(config, stage);
  const markdownPointer = await resolveArtifactPointer(config, stage, "markdown");
  const structuredPointer = await resolveArtifactPointer(config, stage, "structured");
  const warnings: ContextBudgetWarning[] = [];

  if (!artifact) {
    warnings.push({
      code: "dependency_missing",
      severity: "warning",
      message: `Missing required context artifact for stage ${stage}.`,
      stage,
      artifactPath: markdownPointer.path,
    });
    return {
      stage,
      artifactPath: markdownPointer.path,
      structuredPath: structuredPointer.path,
      rawContent: "",
      estimate: estimateContextSize(""),
      missing: true,
      warnings,
    };
  }

  const structuredData = await readStructuredArtifact(config, stage);
  if (!structuredPointer.exists) {
    warnings.push({
      code: "structured_artifact_missing",
      severity: "info",
      message: `Structured context artifact for stage ${stage} is missing; markdown fallback will be used.`,
      stage,
      artifactPath: artifact.artifactPath,
    });
  } else if (await isStructuredArtifactStale(artifact.artifactPath, structuredPointer.path)) {
    warnings.push({
      code: "structured_artifact_stale",
      severity: "warning",
      message: `Structured context artifact for stage ${stage} appears older than markdown; markdown fallback may be used.`,
      stage,
      artifactPath: artifact.artifactPath,
    });
  }

  return {
    stage,
    artifactPath: artifact.artifactPath,
    structuredPath: structuredPointer.exists ? structuredPointer.path : undefined,
    rawContent: artifact.content,
    structuredData,
    estimate: estimateContextSize(artifact.content),
    missing: false,
    warnings,
  };
}

export async function loadContextSourceArtifacts(
  config: SessionConfig,
  stages: StageCode[],
): Promise<ContextSourceArtifact[]> {
  return Promise.all(stages.map((stage) => loadContextSourceArtifact(config, stage)));
}

async function isStructuredArtifactStale(markdownPath: string, structuredPath: string): Promise<boolean> {
  try {
    const [markdown, structured] = await Promise.all([
      stat(markdownPath),
      stat(structuredPath),
    ]);
    return structured.mtimeMs < markdown.mtimeMs;
  } catch {
    return false;
  }
}
