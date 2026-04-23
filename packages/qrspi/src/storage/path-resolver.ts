import { join } from "path";
import type { SessionConfig, FileStoreLayout, StageCode } from "../workflow/types.js";

export function resolveFileStoreLayout(config: SessionConfig): FileStoreLayout {
  const sessionDir = join(config.projectRoot, config.outputDir, config.featureId);
  return {
    sessionDir,
    stateFile: join(sessionDir, "state.json"),
    engineStateFile: join(sessionDir, "engine_state.json"),
    artifactsDir: join(sessionDir, "artifacts"),
    runsDir: join(sessionDir, "runs"),
    slicesDir: join(sessionDir, "slices"),
    sessionsDir: join(sessionDir, "sessions"),
    structuredDir: join(sessionDir, "structured"),
    promptsDir: join(sessionDir, "prompts"),
  };
}

export function buildArtifactFilename(stage: StageCode, date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `${stage}_${d}.md`;
}

export function buildStructuredFilename(stage: StageCode, date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `${stage}_${d}.json`;
}

export function buildRunDirName(stage: StageCode, attempt: number): string {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 15)
    .replace(/(\d{8})(\d{6}).*/, "$1_$2");
  return `${stage}_${ts}_attempt${attempt}`;
}
