const STAGES = [
  {
    code: "Q",
    name: "Questions",
    kind: "alignment",
    description: "Turn ambiguous asks into concrete technical questions.",
    gate: false,
  },
  {
    code: "R",
    name: "Research",
    kind: "alignment",
    description: "Map code facts and constraints before planning.",
    gate: false,
  },
  {
    code: "D",
    name: "Design Discussion",
    kind: "alignment",
    description: "Align on the design and pause for human review.",
    gate: true,
  },
  {
    code: "S",
    name: "Structure Outline",
    kind: "alignment",
    description: "Lock interfaces, slices, and contracts.",
    gate: true,
  },
  {
    code: "P",
    name: "Plan",
    kind: "alignment",
    description: "Prepare the implementation path with less guesswork.",
    gate: false,
  },
  {
    code: "W",
    name: "Work Tree",
    kind: "execution",
    description: "Organize the slice graph and execution order.",
    gate: false,
  },
  {
    code: "I",
    name: "Implement",
    kind: "execution",
    description: "Build and verify code while tracking blockers.",
    gate: false,
  },
  {
    code: "PR",
    name: "Pull Request",
    kind: "execution",
    description: "Review the release shape before landing the change.",
    gate: true,
  },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((stage) => [stage.code, stage]));

const STATUS_TONE = {
  idle: "muted",
  ready: "accent",
  running: "live",
  failed: "danger",
  blocked: "danger",
  needs_context: "warning",
  waiting_approval: "warning",
  completed: "success",
};

const STATUS_LABELS = {
  idle: "Idle",
  ready: "Ready",
  running: "Running",
  failed: "Failed",
  blocked: "Blocked",
  needs_context: "Needs Context",
  waiting_approval: "Waiting Approval",
  completed: "Completed",
};

const DEMO_DATA = {
  sourceMode: "Demo CLI JSON",
  projectRootLabel: "qrspi-agent",
  workflows: [
    {
      featureId: "qrspi-plugin-sop-json-gate-review",
      currentStage: "D",
      engineStatus: "waiting_approval",
      createdAt: "2026-04-28T07:10:00.000Z",
      updatedAt: "2026-04-28T07:33:01.000Z",
      validation: { passed: true, warnings: [] },
      nextAction: {
        kind: "human_gate_review",
        message: "Review and approve or reject the D artifact.",
      },
      gateReviews: [],
      approvals: [],
      history: [
        {
          stage: "Q",
          attempt: 6,
          startedAt: "2026-04-28T07:18:11.000Z",
          finishedAt: "2026-04-28T07:18:47.000Z",
          runDir: ".qrspi/qrspi-plugin-sop-json-gate-review/runs/Q_20260428_071811_attempt6",
          success: true,
        },
        {
          stage: "R",
          attempt: 1,
          startedAt: "2026-04-28T07:21:51.000Z",
          finishedAt: "2026-04-28T07:27:18.000Z",
          runDir: ".qrspi/qrspi-plugin-sop-json-gate-review/runs/R_20260428_072151_attempt1",
          success: true,
        },
        {
          stage: "D",
          attempt: 2,
          startedAt: "2026-04-28T07:31:32.000Z",
          finishedAt: "2026-04-28T07:33:01.000Z",
          runDir: ".qrspi/qrspi-plugin-sop-json-gate-review/runs/D_20260428_073132_attempt2",
          success: true,
        },
      ],
      artifacts: [
        {
          stage: "D",
          path: ".qrspi/qrspi-plugin-sop-json-gate-review/artifacts/D_2026-04-28.md",
          content: [
            "# Design Discussion",
            "",
            "## Target State",
            "The Codex plugin operates through QRSPI CLI JSON contracts and keeps the CLI as the state authority.",
            "",
            "## Design Decisions",
            "- Machine-readable CLI output is opt-in and command scoped.",
            "- Engine state is the primary AI-facing status source.",
            "- Gate review records are persisted for approval and rejection.",
            "- Dashboard remains a reviewer queue and command handoff surface.",
            "",
            "## Architecture Constraints",
            "- Do not bypass D, S, or PR gates.",
            "- Do not write `.qrspi` state files directly.",
          ].join("\n"),
        },
      ],
      latestArtifactPath: ".qrspi/qrspi-plugin-sop-json-gate-review/artifacts/D_2026-04-28.md",
      latestStructuredPath: ".qrspi/qrspi-plugin-sop-json-gate-review/structured/D_2026-04-28.json",
      latestStructuredJson: JSON.stringify(
        {
          stage: "D",
          summary: "Design gate ready for human approval.",
          structured_data: {
            decisions: [
              "Use CLI JSON as the dashboard authority.",
              "Persist approval and rejection notes.",
            ],
            pending_confirmations: [
              "Approve the D artifact or reject it with feedback.",
            ],
            risks: [
              "Dashboard must not look like it can mutate workflow state directly.",
            ],
          },
        },
        null,
        2,
      ),
      latestRunLogPath: ".qrspi/qrspi-plugin-sop-json-gate-review/runs/D_20260428_073132_attempt2/runner_stdout.txt",
      latestStdout: [
        "[QRSPI] D completed and validated.",
        "[QRSPI] Stage D is waiting for human confirmation.",
      ].join("\n"),
      latestStderr: "",
      workTree: { slices: [] },
    },
    {
      featureId: "runner-hardening",
      currentStage: "I",
      engineStatus: "blocked",
      createdAt: "2026-04-26T09:00:00.000Z",
      updatedAt: "2026-04-28T07:12:00.000Z",
      validation: { passed: false, warnings: ["Runner returned NEEDS_CONTEXT."] },
      nextAction: {
        kind: "blocked",
        message: "Resolve live stdout paths on non-posix shells before rerunning.",
      },
      approvals: [
        { stage: "D", approvedAt: "2026-04-26T12:30:00.000Z" },
        { stage: "S", approvedAt: "2026-04-26T14:00:00.000Z" },
      ],
      gateReviews: [
        {
          stage: "S",
          decision: "approved",
          recordedAt: "2026-04-26T14:00:00.000Z",
          reviewPath: ".qrspi/runner-hardening/gate_reviews/S_20260426_140000_approved.md",
        },
      ],
      history: [
        {
          stage: "I",
          attempt: 2,
          startedAt: "2026-04-28T06:48:00.000Z",
          finishedAt: "2026-04-28T07:12:00.000Z",
          runDir: ".qrspi/runner-hardening/runs/I_20260428_064800_attempt2",
          success: false,
        },
      ],
      lastError: "Codex runner returned NEEDS_CONTEXT for live log rotation on Windows shells.",
      artifacts: [
        {
          stage: "I",
          path: ".qrspi/runner-hardening/artifacts/I_2026-04-28.md",
          content: "# Implement\n\nStatus: BLOCKED\n\nNeed a tested strategy for live stdout paths on non-posix systems.",
        },
      ],
      latestArtifactPath: ".qrspi/runner-hardening/artifacts/I_2026-04-28.md",
      latestStructuredPath: "",
      latestStructuredJson: "",
      latestRunLogPath: ".qrspi/runner-hardening/runs/I_20260428_064800_attempt2/runner_stderr.txt",
      latestStdout: "",
      latestStderr: "BLOCKED: missing testable reproduction for Windows shell log streaming.",
      workTree: {
        slices: [
          {
            name: "log-rotation",
            description: "Normalize stdout and stderr file creation across runners.",
            order: 1,
            checkpoint: "Live files append correctly during long runs.",
            model_tier: "standard",
          },
        ],
      },
    },
    {
      featureId: "auth-revamp",
      currentStage: "PR",
      engineStatus: "completed",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-27T16:22:00.000Z",
      validation: { passed: true, warnings: [] },
      nextAction: { kind: "complete", message: "Workflow is complete." },
      approvals: [
        { stage: "D", approvedAt: "2026-04-20T16:00:00.000Z" },
        { stage: "S", approvedAt: "2026-04-20T17:00:00.000Z" },
        { stage: "PR", approvedAt: "2026-04-27T16:20:00.000Z" },
      ],
      gateReviews: [
        {
          stage: "PR",
          decision: "approved",
          recordedAt: "2026-04-27T16:20:00.000Z",
          reviewPath: ".qrspi/auth-revamp/gate_reviews/PR_20260427_162000_approved.md",
        },
      ],
      history: [
        {
          stage: "PR",
          attempt: 1,
          startedAt: "2026-04-27T15:40:00.000Z",
          finishedAt: "2026-04-27T16:05:00.000Z",
          runDir: ".qrspi/auth-revamp/runs/PR_20260427_154000_attempt1",
          success: true,
        },
      ],
      artifacts: [
        {
          stage: "PR",
          path: ".qrspi/auth-revamp/artifacts/PR_2026-04-27.md",
          content: "# Pull Request\n\n## Summary\nRefactored auth middleware and session invalidation rules.\n\n## Tests\n- vitest auth suite\n- session refresh smoke tests",
        },
      ],
      latestArtifactPath: ".qrspi/auth-revamp/artifacts/PR_2026-04-27.md",
      latestStructuredPath: "",
      latestStructuredJson: "",
      latestRunLogPath: ".qrspi/auth-revamp/runs/PR_20260427_154000_attempt1/runner_stdout.txt",
      latestStdout: "PR artifact generated successfully and approved by human reviewer.",
      latestStderr: "",
      workTree: { slices: [] },
    },
  ],
};

const state = {
  sourceMode: DEMO_DATA.sourceMode,
  projectRootLabel: DEMO_DATA.projectRootLabel,
  workflows: DEMO_DATA.workflows.map((workflow) => normalizeWorkflow(workflow)),
  selectedFeatureId: DEMO_DATA.workflows[0].featureId,
  selectedCommand: "",
  importedFiles: null,
  lastRefreshAt: new Date(),
};

const ui = {
  sourceMode: document.querySelector("#source-mode"),
  projectRootLabel: document.querySelector("#project-root-label"),
  featureCountLabel: document.querySelector("#feature-count-label"),
  lastRefreshLabel: document.querySelector("#last-refresh-label"),
  workflowSummary: document.querySelector("#workflow-summary"),
  queueSummary: document.querySelector("#queue-summary"),
  workflowList: document.querySelector("#workflow-list"),
  decisionTitle: document.querySelector("#decision-title"),
  decisionStatus: document.querySelector("#decision-status"),
  requiredActionLabel: document.querySelector("#required-action-label"),
  requiredActionDetail: document.querySelector("#required-action-detail"),
  statusGrid: document.querySelector("#status-grid"),
  stageBoardTitle: document.querySelector("#stage-board-title"),
  stageBoardMeta: document.querySelector("#stage-board-meta"),
  stageTrack: document.querySelector("#stage-track"),
  artifactTitle: document.querySelector("#artifact-title"),
  artifactMeta: document.querySelector("#artifact-meta"),
  artifactPath: document.querySelector("#artifact-path"),
  structuredPath: document.querySelector("#structured-path"),
  runLogPath: document.querySelector("#run-log-path"),
  artifactPreview: document.querySelector("#artifact-preview"),
  factsMeta: document.querySelector("#facts-meta"),
  factsList: document.querySelector("#facts-list"),
  historyMeta: document.querySelector("#history-meta"),
  historyList: document.querySelector("#history-list"),
  commandList: document.querySelector("#command-list"),
  commandPreview: document.querySelector("#command-preview"),
  reviewDraftPreview: document.querySelector("#review-draft-preview"),
  logTitle: document.querySelector("#log-title"),
  logPreview: document.querySelector("#log-preview"),
  sliceTitle: document.querySelector("#slice-title"),
  sliceMeta: document.querySelector("#slice-meta"),
  sliceList: document.querySelector("#slice-list"),
  capabilityList: document.querySelector("#capability-list"),
  emptyState: document.querySelector("#empty-state"),
  copyCommandButton: document.querySelector("#copy-command-button"),
  openFolderButton: document.querySelector("#open-folder-button"),
  useDemoButton: document.querySelector("#use-demo-button"),
  refreshButton: document.querySelector("#refresh-button"),
  projectFolderInput: document.querySelector("#project-folder-input"),
};

function normalizeWorkflow(workflow) {
  return {
    featureId: workflow.featureId,
    currentStage: workflow.currentStage,
    engineStatus: workflow.engineStatus ?? workflow.status ?? "idle",
    createdAt: workflow.createdAt ?? workflow.updatedAt ?? new Date().toISOString(),
    updatedAt: workflow.updatedAt ?? workflow.createdAt ?? new Date().toISOString(),
    approvals: workflow.approvals ?? [],
    history: workflow.history ?? [],
    lastError: workflow.lastError ?? "",
    artifacts: workflow.artifacts ?? [],
    latestArtifactPath: workflow.latestArtifactPath ?? workflow.artifacts?.[0]?.path ?? "",
    latestStructuredPath: workflow.latestStructuredPath ?? "",
    latestStructuredJson: workflow.latestStructuredJson ?? "",
    latestRunLogPath: workflow.latestRunLogPath ?? "",
    latestStdout: workflow.latestStdout ?? "",
    latestStderr: workflow.latestStderr ?? "",
    gateReviews: workflow.gateReviews ?? [],
    validation: workflow.validation ?? null,
    nextAction: workflow.nextAction ?? null,
    dataAuthority: workflow.dataAuthority ?? "CLI JSON",
    diagnostics: workflow.diagnostics ?? [],
    workTree: workflow.workTree ?? { slices: [] },
  };
}

function getSelectedWorkflow() {
  return state.workflows.find((workflow) => workflow.featureId === state.selectedFeatureId) ?? null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatRelativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) return "Just now";
  if (Math.abs(diffMinutes) < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${diffHours}h ago`;

  return `${Math.round(diffHours / 24)}d ago`;
}

function formatTimestamp(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateFor(value) {
  const date = new Date(value ?? 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function stageLabel(code) {
  const stage = STAGE_MAP[code];
  return stage ? `${code} · ${stage.name}` : `${code ?? "?"} · Unknown`;
}

function statusTone(status) {
  return STATUS_TONE[status] ?? "muted";
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status ?? "Unknown";
}

function deriveLatestArtifact(workflow) {
  if (!workflow.artifacts || workflow.artifacts.length === 0) return null;
  return (
    workflow.artifacts.find((artifact) => artifact.stage === workflow.currentStage) ??
    [...workflow.artifacts].sort((left, right) => String(right.path).localeCompare(String(left.path)))[0]
  );
}

function deriveLatestHistoryEntry(workflow) {
  return [...(workflow.history ?? [])].sort((left, right) => {
    return dateFor(right.startedAt).getTime() - dateFor(left.startedAt).getTime();
  })[0] ?? null;
}

function deriveCompletedStages(workflow) {
  const completed = new Set();
  for (const item of workflow.history ?? []) {
    if (item.success) completed.add(item.stage);
  }
  if (workflow.engineStatus === "completed" && workflow.currentStage) {
    completed.add(workflow.currentStage);
  }
  return completed;
}

function getRequiredAction(workflow) {
  if (workflow.engineStatus === "waiting_approval") {
    return {
      label: `Review ${workflow.currentStage} gate`,
      detail: "Read the artifact and structured facts, then approve with a note or reject with feedback.",
    };
  }

  if (workflow.engineStatus === "failed") {
    return {
      label: "Inspect validation failure",
      detail: workflow.lastError || workflow.nextAction?.message || "Open the latest run output before rerunning.",
    };
  }

  if (workflow.engineStatus === "blocked" || workflow.engineStatus === "needs_context") {
    return {
      label: statusLabel(workflow.engineStatus),
      detail: workflow.lastError || workflow.nextAction?.message || "Resolve the blocker before continuing.",
    };
  }

  if (workflow.engineStatus === "completed") {
    return {
      label: "No action required",
      detail: "Workflow is complete. Review history remains available for audit.",
    };
  }

  return {
    label: `Run ${workflow.currentStage} stage`,
    detail: workflow.nextAction?.message || "Run the next QRSPI stage and refresh the workbench.",
  };
}

function getQueueRank(workflow) {
  const statusRank = {
    waiting_approval: 0,
    failed: 1,
    blocked: 2,
    needs_context: 3,
    running: 4,
    ready: 5,
    completed: 6,
    idle: 7,
  };
  const gatePenalty = STAGE_MAP[workflow.currentStage]?.gate ? 0 : 1;
  return (statusRank[workflow.engineStatus] ?? 8) * 10 + gatePenalty;
}

function getSortedWorkflows() {
  return [...state.workflows].sort((left, right) => {
    const rankDiff = getQueueRank(left) - getQueueRank(right);
    if (rankDiff !== 0) return rankDiff;
    return dateFor(right.updatedAt).getTime() - dateFor(left.updatedAt).getTime();
  });
}

function getPendingCount() {
  return state.workflows.filter((workflow) =>
    ["waiting_approval", "failed", "blocked", "needs_context"].includes(workflow.engineStatus),
  ).length;
}

function reviewDraftPath(workflow, decision) {
  const suffix = decision === "approve" ? "approval-note-draft" : "rejection-feedback-draft";
  return `.qrspi/${workflow.featureId}/gate_reviews/${workflow.currentStage}_${suffix}.md`;
}

function buildReviewDraft(workflow, decision) {
  const artifact = deriveLatestArtifact(workflow);
  const label = decision === "approve" ? "approved with notes" : "rejected with feedback";
  const prompt = decision === "approve"
    ? "Decision rationale: artifact is sufficient to advance."
    : "Required changes: describe what must change before rerun.";

  return [
    `# QRSPI Gate Review`,
    ``,
    `Feature: ${workflow.featureId}`,
    `Stage: ${workflow.currentStage}`,
    `Decision: ${label}`,
    `Recorded: ${new Date().toISOString()}`,
    ``,
    `## Reviewed Sources`,
    `- Artifact: ${(artifact?.path ?? workflow.latestArtifactPath) || "Unavailable"}`,
    `- Structured facts: ${workflow.latestStructuredPath || "Unavailable"}`,
    ``,
    `## Review Note`,
    prompt,
  ].join("\n");
}

function getFeatureCommands(workflow) {
  const base = `--root . --feature ${workflow.featureId}`;
  const commands = [
    {
      label: "Status JSON",
      hint: "Inspect the CLI-owned state contract for this workflow.",
      command: `qrspi status ${base} --json`,
      tone: "neutral",
      draft: "",
    },
    {
      label: "Context",
      hint: "Check which artifacts the next stage will load.",
      command: `qrspi context ${base} --json`,
      tone: "neutral",
      draft: "",
    },
  ];

  if (workflow.engineStatus === "waiting_approval") {
    const approvePath = reviewDraftPath(workflow, "approve");
    const rejectPath = reviewDraftPath(workflow, "reject");
    commands.unshift(
      {
        label: "Approve with note",
        hint: `Primary handoff. Save the draft to ${approvePath}, then run this command.`,
        command: `qrspi approve ${workflow.currentStage} ${base} --note-file ${approvePath}`,
        tone: "success",
        draft: buildReviewDraft(workflow, "approve"),
      },
      {
        label: "Reject with feedback",
        hint: `Primary handoff. Save the draft to ${rejectPath}, then run this command.`,
        command: `qrspi reject ${workflow.currentStage} ${base} --feedback-file ${rejectPath}`,
        tone: "warning",
        draft: buildReviewDraft(workflow, "reject"),
      },
    );
    commands.push({
      label: "Fallback approve",
      hint: "Fallback only. This advances the gate without a persisted review note.",
      command: `qrspi approve ${workflow.currentStage} ${base}`,
      tone: "muted",
      draft: "",
    });
  } else if (workflow.engineStatus !== "completed") {
    commands.unshift({
      label: "Run next stage",
      hint: "Continue from the current stage and stop at human gates.",
      command: `qrspi run ${base} --json`,
      tone: "accent",
      draft: "",
    });
  }

  commands.push({
    label: "Rewind",
    hint: "Return to an earlier stage when upstream assumptions are wrong.",
    command: `qrspi rewind ${workflow.currentStage === "Q" ? "Q" : "R"} ${base}`,
    tone: "danger",
    draft: "",
  });

  return commands;
}

function renderTopline() {
  ui.sourceMode.textContent = state.sourceMode;
  ui.projectRootLabel.textContent = state.projectRootLabel;
  ui.featureCountLabel.textContent = `${state.workflows.length} workflow${state.workflows.length === 1 ? "" : "s"}`;
  ui.lastRefreshLabel.textContent = formatRelativeTime(state.lastRefreshAt);
}

function renderEmptyState() {
  const isEmpty = state.workflows.length === 0;
  ui.emptyState.hidden = !isEmpty;
  document.querySelector(".queue-panel").hidden = isEmpty;
  document.querySelector(".detail-column").hidden = isEmpty;
}

function renderWorkflowList() {
  const pendingCount = getPendingCount();
  ui.workflowSummary.textContent = `${pendingCount} need action`;
  ui.queueSummary.textContent = pendingCount > 0
    ? "Waiting gates, failed stages, and blocked runs are sorted before completed workflows."
    : "No pending gates. Recent completed and ready workflows remain visible for audit.";

  ui.workflowList.innerHTML = getSortedWorkflows()
    .map((workflow) => {
      const selected = workflow.featureId === state.selectedFeatureId;
      const action = getRequiredAction(workflow);
      const tone = statusTone(workflow.engineStatus);
      const age = formatRelativeTime(dateFor(workflow.updatedAt));
      const validationLabel = workflow.validation?.passed === false ? "Validation failed" : "Validation passed";
      const warningText = workflow.diagnostics?.length
        ? workflow.diagnostics.join(" ")
        : workflow.dataAuthority === "Diagnostic .qrspi"
          ? "Diagnostic import. Prefer CLI JSON for reviewer authority."
          : "";

      return `
        <button class="workflow-card ${selected ? "is-selected" : ""}" type="button" data-feature-id="${escapeHtml(workflow.featureId)}">
          <span class="workflow-card-head">
            <strong>${escapeHtml(workflow.featureId)}</strong>
            <span class="status-pill tone-${tone}">${escapeHtml(statusLabel(workflow.engineStatus))}</span>
          </span>
          <span class="workflow-card-meta">${escapeHtml(stageLabel(workflow.currentStage))}</span>
          <span class="queue-facts">
            <span>${escapeHtml(age)}</span>
            <span>${escapeHtml(validationLabel)}</span>
            <span>${escapeHtml(action.label)}</span>
          </span>
          ${warningText ? `<span class="row-warning">${escapeHtml(warningText)}</span>` : ""}
        </button>
      `;
    })
    .join("");

  for (const button of ui.workflowList.querySelectorAll("[data-feature-id]")) {
    button.addEventListener("click", () => {
      state.selectedFeatureId = button.getAttribute("data-feature-id");
      render();
    });
  }
}

function renderSummary(workflow) {
  const action = getRequiredAction(workflow);
  const latestEntry = deriveLatestHistoryEntry(workflow);
  const attemptCount = workflow.history?.length ?? 0;
  const gateCount = workflow.gateReviews?.length ?? workflow.approvals?.length ?? 0;
  const artifact = deriveLatestArtifact(workflow);

  ui.decisionTitle.textContent = workflow.featureId;
  ui.decisionStatus.textContent = statusLabel(workflow.engineStatus);
  ui.decisionStatus.className = `status-pill tone-${statusTone(workflow.engineStatus)}`;
  ui.requiredActionLabel.textContent = action.label;
  ui.requiredActionDetail.textContent = action.detail;

  const cards = [
    {
      label: "Stage",
      value: stageLabel(workflow.currentStage),
      tone: STAGE_MAP[workflow.currentStage]?.kind === "execution" ? "live" : "accent",
    },
    {
      label: "Validation",
      value: workflow.validation?.passed === false ? "Failed" : "Passed",
      tone: workflow.validation?.passed === false ? "danger" : "success",
    },
    {
      label: "Artifact",
      value: artifact?.path ? "Available" : "Missing",
      tone: artifact?.path ? "success" : "warning",
    },
    {
      label: "Gate reviews",
      value: `${gateCount} recorded`,
      tone: gateCount > 0 ? "success" : "muted",
    },
    {
      label: "Attempts",
      value: `${attemptCount} total`,
      tone: attemptCount > 0 ? "accent" : "muted",
    },
    {
      label: "Latest run",
      value: latestEntry ? `${latestEntry.stage} at ${formatTimestamp(latestEntry.finishedAt ?? latestEntry.startedAt)}` : "None",
      tone: latestEntry?.success === false ? "danger" : "muted",
    },
  ];

  ui.statusGrid.innerHTML = cards
    .map((card) => `
      <article class="metric tone-${card.tone}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
      </article>
    `)
    .join("");
}

function renderStageTrack(workflow) {
  const currentIndex = STAGES.findIndex((stage) => stage.code === workflow.currentStage);
  const completed = deriveCompletedStages(workflow);
  const currentStage = STAGE_MAP[workflow.currentStage];

  ui.stageBoardTitle.textContent = currentStage?.name ?? "Unknown stage";
  ui.stageBoardMeta.textContent = currentStage?.kind === "execution" ? "Execution" : "Alignment";

  ui.stageTrack.innerHTML = STAGES.map((stage, index) => {
    let stateClass = "pending";
    if (completed.has(stage.code) && index < currentIndex) stateClass = "done";
    if (stage.code === workflow.currentStage) stateClass = "active";
    if (workflow.engineStatus === "completed" && stage.code === workflow.currentStage) stateClass = "done";

    return `
      <article class="stage-card ${stateClass} ${stage.gate ? "is-gate" : ""}">
        <span class="stage-code">${stage.code}</span>
        <strong>${escapeHtml(stage.name)}</strong>
        <p>${escapeHtml(stage.gate ? "Gate review" : stage.kind)}</p>
      </article>
    `;
  }).join("");
}

function renderArtifactPanel(workflow) {
  const artifact = deriveLatestArtifact(workflow);
  const latestRun = deriveLatestHistoryEntry(workflow);
  const currentStage = STAGE_MAP[workflow.currentStage];

  if (!artifact) {
    ui.artifactTitle.textContent = "Artifact unavailable";
    ui.artifactMeta.textContent = "Run status";
    ui.artifactPath.textContent = workflow.latestArtifactPath || "-";
    ui.structuredPath.textContent = workflow.latestStructuredPath || "-";
    ui.runLogPath.textContent = workflow.latestRunLogPath || latestRun?.runDir || "-";
    ui.artifactPreview.textContent = `No artifact was imported for ${workflow.featureId}. Run or import:\nqrspi status --root . --feature ${workflow.featureId} --json`;
    return;
  }

  ui.artifactTitle.textContent = `${artifact.stage} artifact`;
  ui.artifactMeta.textContent = currentStage?.gate ? "Human gate review" : "Stage output";
  ui.artifactPath.textContent = artifact.path ?? workflow.latestArtifactPath ?? "-";
  ui.structuredPath.textContent = workflow.latestStructuredPath || "-";
  ui.runLogPath.textContent = workflow.latestRunLogPath || latestRun?.runDir || "-";
  ui.artifactPreview.textContent = artifact.content?.trim() || "Artifact exists, but its content was not imported.";
}

function parseStructuredFacts(workflow) {
  if (!workflow.latestStructuredJson?.trim()) return { status: "missing", facts: [] };

  try {
    const parsed = JSON.parse(workflow.latestStructuredJson);
    const data = parsed.structured_data ?? parsed;
    const facts = [];

    if (parsed.summary) facts.push({ label: "Summary", value: parsed.summary });
    if (Array.isArray(data.decisions)) facts.push({ label: "Decisions", value: data.decisions });
    if (Array.isArray(data.rejected_options)) facts.push({ label: "Rejected options", value: data.rejected_options });
    if (Array.isArray(data.risks)) facts.push({ label: "Risks", value: data.risks });
    if (Array.isArray(data.pending_confirmations)) facts.push({ label: "Pending confirmations", value: data.pending_confirmations });
    if (Array.isArray(data.confirmations)) facts.push({ label: "Confirmations", value: data.confirmations });
    if (Array.isArray(data.tasks)) facts.push({ label: "Tasks", value: data.tasks });
    if (Array.isArray(data.slices)) facts.push({ label: "Slices", value: data.slices.map((item) => item.name ?? JSON.stringify(item)) });

    if (facts.length === 0) {
      facts.push({ label: "Parsed JSON", value: "Structured artifact loaded, but no known review fields were found." });
    }

    return { status: "loaded", facts };
  } catch (error) {
    return {
      status: "error",
      facts: [{ label: "Parse error", value: error.message }],
    };
  }
}

function renderFacts(workflow) {
  const result = parseStructuredFacts(workflow);

  if (result.status === "missing") {
    ui.factsMeta.textContent = "Missing";
    ui.factsList.innerHTML = `
      <article class="fact-row tone-warning">
        <strong>Structured facts unavailable</strong>
        <p>Use the markdown artifact as the review authority. Do not infer missing decisions.</p>
      </article>
    `;
    return;
  }

  ui.factsMeta.textContent = result.status === "error" ? "Parse failed" : `${result.facts.length} facts`;
  ui.factsList.innerHTML = result.facts
    .map((fact) => {
      const values = Array.isArray(fact.value) ? fact.value : [fact.value];
      return `
        <article class="fact-row tone-${result.status === "error" ? "danger" : "accent"}">
          <strong>${escapeHtml(fact.label)}</strong>
          <ul>
            ${values.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : JSON.stringify(item))}</li>`).join("")}
          </ul>
        </article>
      `;
    })
    .join("");
}

function renderCommands(workflow) {
  const commands = getFeatureCommands(workflow);
  if (!commands.some((item) => item.command === state.selectedCommand)) {
    state.selectedCommand = commands[0]?.command ?? "qrspi status --root . --json";
  }

  ui.commandList.innerHTML = commands.map((item) => `
    <button class="command-card ${state.selectedCommand === item.command ? "is-selected" : ""} tone-${item.tone}" type="button" data-command="${escapeHtml(item.command)}">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.hint)}</span>
      <code>${escapeHtml(item.command)}</code>
    </button>
  `).join("");

  const selected = commands.find((item) => item.command === state.selectedCommand);
  ui.commandPreview.textContent = state.selectedCommand;
  ui.reviewDraftPreview.textContent = selected?.draft || "No note or feedback draft is required for the highlighted command.";

  for (const button of ui.commandList.querySelectorAll("[data-command]")) {
    button.addEventListener("click", () => {
      state.selectedCommand = button.getAttribute("data-command") ?? "qrspi status --root . --json";
      renderCommands(workflow);
    });
  }
}

function renderHistory(workflow) {
  const reviews = [...(workflow.gateReviews ?? [])].map((review) => ({
    kind: "review",
    stage: review.stage,
    success: review.decision !== "rejected",
    title: `${review.stage} ${review.decision ?? "review"}`,
    meta: formatTimestamp(review.recordedAt ?? review.approvedAt),
    path: review.reviewPath ?? review.sourceFile ?? "Review record persisted in engine state",
  }));

  const runs = [...(workflow.history ?? [])].sort((left, right) => {
    return dateFor(right.startedAt).getTime() - dateFor(left.startedAt).getTime();
  }).map((entry) => ({
    kind: "run",
    stage: entry.stage,
    success: Boolean(entry.success),
    title: `${entry.stage} run attempt ${entry.attempt ?? 1}`,
    meta: formatTimestamp(entry.finishedAt ?? entry.startedAt),
    path: entry.runDir ?? "-",
  }));

  const entries = [...reviews, ...runs];
  ui.historyMeta.textContent = `${entries.length} entries`;

  if (entries.length === 0) {
    ui.historyList.innerHTML = `<p class="placeholder-text">No gate review history yet. The first approve/reject with note creates a persisted record.</p>`;
    return;
  }

  ui.historyList.innerHTML = entries.map((entry) => `
    <article class="history-entry tone-${entry.success ? "success" : "danger"}">
      <div class="history-main">
        <strong>${escapeHtml(entry.title)}</strong>
        <span>${escapeHtml(entry.meta)} · ${escapeHtml(entry.kind)}</span>
      </div>
      <code>${escapeHtml(entry.path)}</code>
    </article>
  `).join("");
}

function renderLogs(workflow) {
  const latestEntry = deriveLatestHistoryEntry(workflow);
  const hasStderr = Boolean(workflow.latestStderr?.trim());

  ui.logTitle.textContent = hasStderr ? "Latest stderr" : "Latest stdout";
  ui.logPreview.textContent = hasStderr
    ? workflow.latestStderr
    : workflow.latestStdout || "No captured log output for the selected workflow.";

  if (workflow.lastError?.trim()) {
    ui.logPreview.textContent = `${ui.logPreview.textContent}\n\nLast error:\n${workflow.lastError}`;
  }

  if (!latestEntry && !workflow.latestStdout && !workflow.latestStderr) {
    ui.logPreview.textContent = "No run log loaded. Import a CLI status snapshot with run metadata, or run the workflow and refresh.";
  }
}

function renderSlices(workflow) {
  const slices = [...(workflow.workTree?.slices ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  ui.sliceTitle.textContent = workflow.workTree ? "Work tree" : "No work tree";
  ui.sliceMeta.textContent = `${slices.length} slices`;

  if (slices.length === 0) {
    ui.sliceList.innerHTML = `<p class="placeholder-text">This workflow has not reached W stage or has no slice definitions.</p>`;
    return;
  }

  ui.sliceList.innerHTML = slices.map((slice) => `
    <article class="slice-card">
      <span class="slice-order">${escapeHtml(String(slice.order ?? 0))}</span>
      <div>
        <strong>${escapeHtml(slice.name ?? "Unnamed slice")}</strong>
        <p>${escapeHtml(slice.description ?? "No description")}</p>
        <code>${escapeHtml(slice.model_tier ? `${slice.model_tier} · ${slice.checkpoint ?? ""}` : slice.checkpoint ?? "Routing metadata unavailable")}</code>
      </div>
    </article>
  `).join("");
}

function renderCapabilities(workflow) {
  const items = [
    {
      label: workflow.dataAuthority === "CLI JSON" ? "CLI JSON authority" : "Diagnostic raw .qrspi import",
      tone: workflow.dataAuthority === "CLI JSON" ? "success" : "warning",
      enabled: true,
    },
    {
      label: "Project folder import",
      tone: "success",
      enabled: true,
    },
    {
      label: "Note/feedback handoff",
      tone: workflow.engineStatus === "waiting_approval" ? "success" : "muted",
      enabled: true,
    },
    {
      label: "GUI state mutation",
      tone: "danger",
      enabled: false,
    },
  ];

  ui.capabilityList.innerHTML = items.map((item) => `
    <li class="${item.enabled ? "" : "is-disabled"}">
      <span class="cap-dot tone-${item.tone}"></span>
      <span>${escapeHtml(item.label)}${item.enabled ? "" : " unavailable"}</span>
    </li>
  `).join("");
}

function render() {
  renderTopline();
  renderEmptyState();

  if (state.workflows.length === 0) return;
  if (!state.workflows.some((workflow) => workflow.featureId === state.selectedFeatureId)) {
    state.selectedFeatureId = getSortedWorkflows()[0]?.featureId ?? state.workflows[0].featureId;
  }

  const workflow = getSelectedWorkflow();
  if (!workflow) return;

  renderWorkflowList();
  renderSummary(workflow);
  renderStageTrack(workflow);
  renderArtifactPanel(workflow);
  renderFacts(workflow);
  renderCommands(workflow);
  renderHistory(workflow);
  renderLogs(workflow);
  renderSlices(workflow);
  renderCapabilities(workflow);
}

function isCliStatusPayload(value) {
  return Boolean(
    value &&
    value.ok === true &&
    value.command === "status" &&
    value.feature &&
    value.stage?.code,
  );
}

async function parseCliStatusWorkflow(fileMap, payload) {
  const artifactPath = payload.artifacts?.latest ?? "";
  const structuredPath = payload.artifacts?.structured ?? "";
  const stdoutPath = payload.latest_run?.stdout_file ?? "";
  const stderrPath = payload.latest_run?.stderr_file ?? "";
  const artifactContent = artifactPath ? await readTextFile(fileMap, artifactPath) : "";
  const structuredContent = structuredPath ? await readTextFile(fileMap, structuredPath) : "";
  const latestStdout = stdoutPath ? await readTextFile(fileMap, stdoutPath) : "";
  const latestStderr = stderrPath ? await readTextFile(fileMap, stderrPath) : "";

  return normalizeWorkflow({
    featureId: payload.feature,
    currentStage: payload.stage.code,
    engineStatus: payload.stage.status,
    updatedAt: payload.updatedAt ?? payload.updated_at ?? new Date().toISOString(),
    nextAction: payload.next_action ?? null,
    artifacts: artifactPath
      ? [
          {
            stage: payload.stage.code,
            path: artifactPath,
            content: artifactContent,
          },
        ]
      : [],
    latestArtifactPath: artifactPath,
    latestStructuredPath: structuredPath,
    latestStructuredJson: structuredContent,
    latestRunLogPath: stdoutPath || stderrPath,
    latestStdout: latestStdout || payload.latest_run?.stdout || "",
    latestStderr: latestStderr || payload.latest_run?.stderr || "",
    approvals: [],
    history: payload.history ?? [],
    gateReviews: payload.gate_reviews?.history ?? [],
    lastError: payload.next_action?.kind === "inspect_failure" ? payload.next_action.message ?? "" : "",
    validation: payload.validation ?? null,
    dataAuthority: "CLI JSON",
    workTree: payload.work_tree ? { slices: payload.work_tree.slices ?? [] } : { slices: [] },
  });
}

async function parseCliStatusWorkflows(fileMap) {
  const workflows = [];

  for (const path of fileMap.keys()) {
    if (!path.endsWith(".json")) continue;
    const payload = await readJsonFile(fileMap, path);
    if (!isCliStatusPayload(payload)) continue;
    workflows.push(await parseCliStatusWorkflow(fileMap, payload));
  }

  return workflows.sort((left, right) => left.featureId.localeCompare(right.featureId));
}

async function readJsonFile(fileMap, path) {
  const file = fileMap.get(path);
  if (!file) return null;
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

async function readTextFile(fileMap, path) {
  const normalized = path.replace(/^\.\//, "");
  const file = fileMap.get(path) ?? fileMap.get(normalized);
  if (!file) return "";
  try {
    return await file.text();
  } catch {
    return "";
  }
}

function collectFeatureIds(fileMap) {
  const features = new Set();
  for (const path of fileMap.keys()) {
    const match = path.match(/\.qrspi\/([^/]+)\/state\.json$/);
    if (match) features.add(match[1]);
  }
  return [...features].sort((left, right) => left.localeCompare(right));
}

function collectFeatureFiles(fileMap, featureId) {
  const prefix = `.qrspi/${featureId}/`;
  return [...fileMap.keys()].filter((path) => path.includes(prefix));
}

function pickLatestPath(paths) {
  return [...paths].sort((left, right) => right.localeCompare(left))[0] ?? "";
}

async function parseWorkflowFromFiles(fileMap, featureId) {
  const stateJson = await readJsonFile(fileMap, `.qrspi/${featureId}/state.json`);
  if (!stateJson) return null;

  const engineJson = await readJsonFile(fileMap, `.qrspi/${featureId}/engine_state.json`);
  const workTree = await readJsonFile(fileMap, `.qrspi/${featureId}/slices/work_tree.json`);
  const featureFiles = collectFeatureFiles(fileMap, featureId);

  const artifactPaths = featureFiles.filter((path) => path.includes("/artifacts/") && path.endsWith(".md"));
  const artifacts = [];
  for (const path of artifactPaths) {
    const stageMatch = path.match(/artifacts\/([A-Z]+)_/);
    artifacts.push({
      stage: stageMatch?.[1] ?? "Q",
      path,
      content: await readTextFile(fileMap, path),
    });
  }

  const structuredPaths = featureFiles.filter((path) => path.includes("/structured/") && path.endsWith(".json"));
  const history = Array.isArray(engineJson?.history) ? engineJson.history : [];
  const latestHistory = deriveLatestHistoryEntry({ history });
  const currentStage = stateJson.current_stage ?? engineJson?.currentStage ?? "Q";
  const currentArtifact = artifacts.find((artifact) => artifact.stage === currentStage);
  const currentStructuredPath = structuredPaths.find((path) => path.includes(`/structured/${currentStage}_`)) ?? pickLatestPath(structuredPaths);

  let latestStdout = "";
  let latestStderr = "";
  let latestRunLogPath = "";

  if (latestHistory?.runDir) {
    const runRoot = latestHistory.runDir.replace(/^\.\//, "");
    latestRunLogPath = `${runRoot}/runner_stdout.txt`;
    latestStdout = await readTextFile(fileMap, `${runRoot}/runner_stdout.txt`);
    latestStderr = await readTextFile(fileMap, `${runRoot}/runner_stderr.txt`);
    if (!latestStdout && latestStderr) latestRunLogPath = `${runRoot}/runner_stderr.txt`;
  }

  return normalizeWorkflow({
    featureId: stateJson.feature_id ?? featureId,
    currentStage,
    engineStatus: engineJson?.status ?? "ready",
    createdAt: stateJson.timestamp ?? engineJson?.updatedAt ?? engineJson?.updated_at,
    updatedAt: engineJson?.updatedAt ?? engineJson?.updated_at ?? stateJson.timestamp,
    approvals: engineJson?.approvals ?? [],
    history,
    gateReviews: engineJson?.gate_reviews ?? [],
    lastError: engineJson?.lastError ?? "",
    artifacts,
    latestArtifactPath: currentArtifact?.path ?? pickLatestPath(artifactPaths),
    latestStructuredPath: currentStructuredPath,
    latestStructuredJson: currentStructuredPath ? await readTextFile(fileMap, currentStructuredPath) : "",
    latestRunLogPath,
    latestStdout,
    latestStderr,
    validation: {
      passed: engineJson?.status !== "failed",
      warnings: engineJson?.lastError ? [engineJson.lastError] : [],
    },
    nextAction: null,
    dataAuthority: "Diagnostic .qrspi",
    diagnostics: ["Raw .qrspi import is diagnostic. Export `qrspi status --json` for authoritative review data."],
    workTree: workTree ?? { slices: [] },
  });
}

async function loadProjectFolder(files) {
  const list = Array.from(files ?? []);
  const relativeRoots = new Set();
  const fileMap = new Map();

  for (const file of list) {
    const relativePath = file.webkitRelativePath || file.name;
    const segments = relativePath.split("/");
    if (segments.length > 1) relativeRoots.add(segments[0]);

    const normalized = segments.length > 1 ? segments.slice(1).join("/") : relativePath;
    fileMap.set(normalized, file);
  }

  let workflows = await parseCliStatusWorkflows(fileMap);
  const featureIds = collectFeatureIds(fileMap);

  if (workflows.length === 0) {
    for (const featureId of featureIds) {
      const workflow = await parseWorkflowFromFiles(fileMap, featureId);
      if (workflow) workflows.push(workflow);
    }
  }

  state.sourceMode = workflows.length > 0 && workflows.every((workflow) => workflow.dataAuthority === "CLI JSON")
    ? "Imported CLI JSON"
    : workflows.length > 0
      ? "Imported diagnostic .qrspi"
      : "No workflow data";
  state.projectRootLabel = [...relativeRoots][0] ?? "Imported workspace";
  state.workflows = workflows;
  state.importedFiles = list;
  state.lastRefreshAt = new Date();
  state.selectedFeatureId = getSortedWorkflows()[0]?.featureId ?? workflows[0]?.featureId ?? "";
  state.selectedCommand = "";
  render();
}

function restoreDemoWorkspace() {
  state.sourceMode = DEMO_DATA.sourceMode;
  state.projectRootLabel = DEMO_DATA.projectRootLabel;
  state.workflows = DEMO_DATA.workflows.map((workflow) => normalizeWorkflow(workflow));
  state.selectedFeatureId = getSortedWorkflows()[0]?.featureId ?? state.workflows[0]?.featureId ?? "";
  state.selectedCommand = "";
  state.importedFiles = null;
  state.lastRefreshAt = new Date();
  render();
}

async function refreshCurrentSource() {
  if (state.importedFiles) {
    await loadProjectFolder(state.importedFiles);
    return;
  }
  restoreDemoWorkspace();
}

async function copySelectedCommand() {
  const command = state.selectedCommand;
  if (!command) return;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(command);
      ui.copyCommandButton.textContent = "Copied";
    } catch {
      ui.copyCommandButton.textContent = "Copy failed";
    }
  } else {
    ui.copyCommandButton.textContent = "Select text";
  }

  window.setTimeout(() => {
    ui.copyCommandButton.textContent = "Copy command";
  }, 1400);
}

ui.openFolderButton.addEventListener("click", () => {
  ui.projectFolderInput.click();
});

ui.projectFolderInput.addEventListener("change", async (event) => {
  await loadProjectFolder(event.target.files);
});

ui.useDemoButton.addEventListener("click", () => {
  restoreDemoWorkspace();
});

ui.refreshButton.addEventListener("click", async () => {
  await refreshCurrentSource();
});

ui.copyCommandButton.addEventListener("click", async () => {
  await copySelectedCommand();
});

restoreDemoWorkspace();
