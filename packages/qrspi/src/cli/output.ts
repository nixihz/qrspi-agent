import type {
  WorkflowState,
  EngineState,
  SliceExecutionState,
  SliceExecutionStatus,
  SliceStatusCommandData,
  SliceStatusTextOptions,
  StageCode,
} from "../workflow/types.js";
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
  sliceState?: SliceExecutionState | null,
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

  appendSliceSummary(lines, sliceState);

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

export function formatSliceStatusOutput(
  data: SliceStatusCommandData,
  options: SliceStatusTextOptions,
): string {
  const lines: string[] = [
    `[QRSPI] Slice Status (Feature: ${options.featureId})`,
    "",
  ];

  if (typeof options.currentSliceOrder === "number") {
    lines.push(`Current Slice Order: ${options.currentSliceOrder}`);
  }

  if (data.slices.length === 0) {
    lines.push("[QRSPI] No slice execution state recorded");
    return lines.join("\n");
  }

  if (typeof options.currentSliceOrder === "number") {
    lines.push("");
  }

  for (const slice of data.slices) {
    lines.push(`- [${slice.slice_order}] ${slice.slice_name}`);
    lines.push(`  status: ${slice.status}`);
    lines.push(`  start_time: ${slice.started_at ?? "-"}`);
    lines.push(`  attempts: ${slice.attempts}`);
  }

  return lines.join("\n");
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
      const message = r.message ?? "Unknown error";
      if (message === "blocked" || message === "needs_context") {
        lines.push(`- ${r.stage} reported ${message} and stayed on ${currentStage}`);
      } else {
        lines.push(`- ${r.stage} execution failed: ${message}`);
      }
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

export function formatFeatureList(features: Array<{ featureId: string; currentStage: string; status: string }>): string {
  if (features.length === 0) return "No workflows found.";

  const lines: string[] = [
    "============================================================",
    "QRSPI Workflows",
    "============================================================",
  ];

  for (const f of features) {
    const statusIcon = f.status === "completed"
      ? "✓"
      : f.status === "waiting_approval"
        ? "⏸"
        : f.status === "blocked" || f.status === "needs_context"
          ? "!"
          : "○";
    lines.push(`  ${statusIcon} ${f.featureId}: ${f.currentStage} (${f.status})`);
  }

  lines.push("============================================================");
  return lines.join("\n");
}

export function print(msg: string): void {
  process.stdout.write(msg + "\n");
}

export function printErr(msg: string): void {
  process.stderr.write(msg + "\n");
}

function appendSliceSummary(lines: string[], sliceState?: SliceExecutionState | null): void {
  if (!sliceState || sliceState.slices.length === 0) {
    return;
  }

  lines.push("");
  lines.push(
    typeof sliceState.current_slice_order === "number"
      ? `Slice Summary (current: ${sliceState.current_slice_order})`
      : "Slice Summary",
  );

  for (const slice of sliceState.slices) {
    lines.push(
      `  ${getSliceStatusMarker(slice.status)} [${slice.slice_order}] ${slice.slice_name} | `
      + `status=${slice.status} | start=${slice.started_at ?? "-"}`,
    );
  }
}

function getSliceStatusMarker(status: SliceExecutionStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "running":
      return ">>>";
    case "failed":
      return "!";
    case "blocked":
      return "x";
    case "needs_context":
      return "?";
    case "pending":
    default:
      return "○";
  }
}
