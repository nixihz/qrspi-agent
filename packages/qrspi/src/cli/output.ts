import type { WorkflowState, EngineState, StageCode } from "../workflow/types.js";
import {
  getStageOrder,
  getStageName,
  getStageDescription,
  isGateStage,
  getStageDefinition,
} from "../workflow/stage-schema.js";

const STAGE_ICONS: Record<string, string> = {
  done: "✓",
  current: ">>>",
  pending: "   ",
};

export function formatStatusOutput(
  state: WorkflowState,
  engineState: EngineState,
): string {
  const order = getStageOrder();
  const currentIdx = order.indexOf(state.currentStage);
  const lines: string[] = [
    `[QRSPI] Workflow: ${getStageName(state.currentStage)} (Feature: ${state.featureId})`,
    "",
    "============================================================",
    "QRSPI Workflow Status",
    "============================================================",
  ];

  for (let i = 0; i < order.length; i++) {
    const stage = order[i];
    const def = getStageDefinition(stage);
    const kindLabel = def.kind === "alignment" ? "Alignment" : "Execution";
    const isDone = engineState.history.some((h) => h.stage === stage && h.success);
    const isCurrent = i === currentIdx;

    let prefix: string;
    if (isDone && !isCurrent) {
      prefix = `    ✓ ${stage}`;
    } else if (isCurrent) {
      prefix = `>>>   ${stage}`;
    } else {
      prefix = `      ${stage}`;
    }

    lines.push(`${prefix}: ${getStageName(stage)} [${kindLabel}]`);
  }

  lines.push("============================================================");
  lines.push(`[QRSPI] Workflow: ${getStageName(state.currentStage)} (Feature: ${state.featureId})`);
  lines.push("");
  lines.push(`Engine Status: ${engineState.status}`);
  lines.push(`Runner: claude`);
  lines.push(`Model: kimi-for-coding`);

  return lines.join("\n");
}

export function formatStageOutput(state: WorkflowState): string {
  const stage = state.currentStage;
  const def = getStageDefinition(stage);
  const kindLabel = def.kind === "alignment" ? "Alignment" : "Execution";

  return [
    `[QRSPI] Workflow: ${getStageName(stage)} (Feature: ${state.featureId})`,
    "",
    `📍 Current Stage: ${getStageName(stage)}`,
    `   Description: ${getStageDescription(stage)}`,
    `   Kind: ${kindLabel}`,
    `   Output Directory: .qrspi/${state.featureId}`,
  ].join("\n");
}

export function formatRunResults(
  results: Array<{ stage: StageCode; success: boolean; message?: string }>,
  currentStage: StageCode,
  engineStatus: string,
): string {
  const lines: string[] = [
    "",
    "🤖 Auto-execution Results",
    "==================================================",
  ];

  for (const r of results) {
    if (r.success) {
      const next = getStageOrder()[getStageOrder().indexOf(r.stage) + 1];
      if (next) {
        lines.push(`- ${r.stage} completed and advanced to ${next}`);
      } else {
        lines.push(`- ${r.stage} completed`);
      }
      if (isGateStage(r.stage)) {
        lines.push(`- ${r.stage} completed and validated, awaiting human approval`);
        lines.push(`- Stage ${r.stage} is waiting for human confirmation`);
      }
    } else {
      lines.push(`- ${r.stage} execution failed: ${r.message ?? "Unknown error"}`);
    }
  }

  lines.push("==================================================");
  lines.push(`Current Stage: ${currentStage} - ${getStageName(currentStage)}`);
  lines.push(`Engine Status: ${engineStatus}`);

  return lines.join("\n");
}

export function formatApproveResult(stage: StageCode, nextStage: StageCode): string {
  return [
    `[QRSPI] Workflow: ${getStageName(stage)} (Feature: ...)`,
    `[QRSPI] Entering Stage: ${getStageName(nextStage)}`,
    `  ${getStageDescription(nextStage)}`,
    "",
    `✅ ${stage} approved, advanced to ${nextStage}`,
  ].join("\n");
}

export function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

export function printErr(msg: string): void {
  process.stderr.write(msg + "\n");
}
