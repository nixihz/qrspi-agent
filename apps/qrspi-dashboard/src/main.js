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
  sourceMode: "Demo workspace",
  projectRootLabel: "qrspi-agent",
  workflows: [
    {
      featureId: "plugin-preview",
      currentStage: "D",
      engineStatus: "waiting_approval",
      createdAt: "2026-04-27T10:00:00.000Z",
      updatedAt: "2026-04-28T08:36:00.000Z",
      approvals: [
        { stage: "Q", approvedAt: "2026-04-27T10:08:00.000Z" },
        { stage: "R", approvedAt: "2026-04-27T10:22:00.000Z" },
      ],
      history: [
        {
          stage: "Q",
          attempt: 1,
          startedAt: "2026-04-27T10:01:00.000Z",
          finishedAt: "2026-04-27T10:08:00.000Z",
          runDir: ".qrspi/plugin-preview/runs/Q_2026-04-27T100100_attempt1",
          success: true,
        },
        {
          stage: "R",
          attempt: 1,
          startedAt: "2026-04-27T10:12:00.000Z",
          finishedAt: "2026-04-27T10:22:00.000Z",
          runDir: ".qrspi/plugin-preview/runs/R_2026-04-27T101200_attempt1",
          success: true,
        },
        {
          stage: "D",
          attempt: 1,
          startedAt: "2026-04-28T08:20:00.000Z",
          finishedAt: "2026-04-28T08:36:00.000Z",
          runDir: ".qrspi/plugin-preview/runs/D_2026-04-28T082000_attempt1",
          success: true,
        },
      ],
      lastError: "",
      artifacts: [
        {
          stage: "D",
          path: ".qrspi/plugin-preview/artifacts/D_2026-04-28.md",
          content: [
            "# Design",
            "",
            "## Goal",
            "Ship a Codex plugin preview that wraps the QRSPI CLI without creating a second state machine.",
            "",
            "## Decisions",
            "- Keep `packages/qrspi` as the authority for workflow state.",
            "- Add a thin MCP server that shells out to `qrspi` commands.",
            "- Add a dashboard app that reads real `.qrspi` state and surfaces gate actions.",
            "- Pause for human approval on `D`, `S`, and `PR` without auto-bypassing gates.",
            "",
            "## Risks",
            "- App hosting environments may not expose MCP directly to the dashboard.",
            "- The preview must still feel complete even when it is read-only.",
          ].join("\n"),
        },
      ],
      latestArtifactPath: ".qrspi/plugin-preview/artifacts/D_2026-04-28.md",
      latestRunLogPath: ".qrspi/plugin-preview/runs/D_2026-04-28T082000_attempt1/live_stdout.txt",
      latestStdout: [
        "[QRSPI] Resumed workflow: Design Discussion (Feature: plugin-preview)",
        "[QRSPI] Artifact saved: .qrspi/plugin-preview/artifacts/D_2026-04-28.md",
        "",
        "Auto-execution Results",
        "- D completed and validated, awaiting human approval",
        "- Stage D is waiting for human confirmation",
        "",
        "Current Stage: D - Design Discussion",
        "Engine Status: waiting_approval",
      ].join("\n"),
      latestStderr: "",
      workTree: {
        slices: [
          {
            name: "plugin-shell",
            description: "Manifest, app registration, hooks, and assets.",
            order: 1,
            checkpoint: "Codex recognizes the plugin metadata.",
          },
          {
            name: "mcp-thin-wrapper",
            description: "Expose list, status, init, run, approve, and reject via MCP.",
            order: 2,
            checkpoint: "Client can list tools and call the happy path commands.",
          },
          {
            name: "dashboard-preview",
            description: "Render stage flow, artifact context, and command handoff.",
            order: 3,
            checkpoint: "Team can inspect the cockpit in Codex.",
          },
        ],
      },
    },
    {
      featureId: "runner-hardening",
      currentStage: "I",
      engineStatus: "blocked",
      createdAt: "2026-04-26T09:00:00.000Z",
      updatedAt: "2026-04-28T07:12:00.000Z",
      approvals: [
        { stage: "D", approvedAt: "2026-04-26T12:30:00.000Z" },
        { stage: "S", approvedAt: "2026-04-26T14:00:00.000Z" },
      ],
      history: [
        {
          stage: "W",
          attempt: 1,
          startedAt: "2026-04-27T18:00:00.000Z",
          finishedAt: "2026-04-27T18:18:00.000Z",
          runDir: ".qrspi/runner-hardening/runs/W_2026-04-27T180000_attempt1",
          success: true,
        },
        {
          stage: "I",
          attempt: 2,
          startedAt: "2026-04-28T06:48:00.000Z",
          finishedAt: "2026-04-28T07:12:00.000Z",
          runDir: ".qrspi/runner-hardening/runs/I_2026-04-28T064800_attempt2",
          success: false,
        },
      ],
      lastError: "Codex runner returned NEEDS_CONTEXT for live log rotation on Windows shells.",
      artifacts: [
        {
          stage: "I",
          path: ".qrspi/runner-hardening/artifacts/I_2026-04-28.md",
          content: [
            "# Implement",
            "",
            "Status: BLOCKED",
            "",
            "## Blocker",
            "Need a tested strategy for live stdout paths on non-posix systems before shipping the runner hardening patch.",
          ].join("\n"),
        },
      ],
      latestArtifactPath: ".qrspi/runner-hardening/artifacts/I_2026-04-28.md",
      latestRunLogPath: ".qrspi/runner-hardening/runs/I_2026-04-28T064800_attempt2/live_stderr.txt",
      latestStdout: "",
      latestStderr: [
        "Runner exited with status 1.",
        "BLOCKED: missing testable reproduction for Windows shell log streaming.",
      ].join("\n"),
      workTree: {
        slices: [
          {
            name: "log-rotation",
            description: "Normalize stdout and stderr file creation across runners.",
            order: 1,
            checkpoint: "Live files append correctly during long runs.",
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
      approvals: [
        { stage: "D", approvedAt: "2026-04-20T16:00:00.000Z" },
        { stage: "S", approvedAt: "2026-04-20T17:00:00.000Z" },
        { stage: "PR", approvedAt: "2026-04-27T16:20:00.000Z" },
      ],
      history: [
        {
          stage: "PR",
          attempt: 1,
          startedAt: "2026-04-27T15:40:00.000Z",
          finishedAt: "2026-04-27T16:05:00.000Z",
          runDir: ".qrspi/auth-revamp/runs/PR_2026-04-27T154000_attempt1",
          success: true,
        },
      ],
      lastError: "",
      artifacts: [
        {
          stage: "PR",
          path: ".qrspi/auth-revamp/artifacts/PR_2026-04-27.md",
          content: [
            "# Pull Request",
            "",
            "## Summary",
            "Refactored auth middleware, token refresh handling, and session invalidation rules.",
            "",
            "## Tests",
            "- vitest auth suite",
            "- session refresh smoke tests",
          ].join("\n"),
        },
      ],
      latestArtifactPath: ".qrspi/auth-revamp/artifacts/PR_2026-04-27.md",
      latestRunLogPath: ".qrspi/auth-revamp/runs/PR_2026-04-27T154000_attempt1/live_stdout.txt",
      latestStdout: "PR artifact generated successfully and approved by human reviewer.",
      latestStderr: "",
      workTree: {
        slices: [],
      },
    },
  ],
};

const state = {
  sourceMode: DEMO_DATA.sourceMode,
  projectRootLabel: DEMO_DATA.projectRootLabel,
  workflows: DEMO_DATA.workflows,
  selectedFeatureId: DEMO_DATA.workflows[0].featureId,
  selectedCommand: "qrspi status --root . --feature plugin-preview",
  importedFiles: null,
  lastRefreshAt: new Date(),
};

const ui = {
  sourceMode: document.querySelector("#source-mode"),
  projectRootLabel: document.querySelector("#project-root-label"),
  featureCountLabel: document.querySelector("#feature-count-label"),
  lastRefreshLabel: document.querySelector("#last-refresh-label"),
  workflowSummary: document.querySelector("#workflow-summary"),
  workflowList: document.querySelector("#workflow-list"),
  statusGrid: document.querySelector("#status-grid"),
  stageBoardTitle: document.querySelector("#stage-board-title"),
  stageBoardMeta: document.querySelector("#stage-board-meta"),
  stageTrack: document.querySelector("#stage-track"),
  artifactTitle: document.querySelector("#artifact-title"),
  artifactMeta: document.querySelector("#artifact-meta"),
  artifactPath: document.querySelector("#artifact-path"),
  runLogPath: document.querySelector("#run-log-path"),
  artifactPreview: document.querySelector("#artifact-preview"),
  historyMeta: document.querySelector("#history-meta"),
  historyList: document.querySelector("#history-list"),
  commandList: document.querySelector("#command-list"),
  commandPreview: document.querySelector("#command-preview"),
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

function getSelectedWorkflow() {
  return state.workflows.find((workflow) => workflow.featureId === state.selectedFeatureId) ?? null;
}

function formatRelativeTime(date) {
  if (!date) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) return "Just now";
  if (Math.abs(diffMinutes) < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function deriveLatestArtifact(workflow) {
  if (!workflow.artifacts || workflow.artifacts.length === 0) return null;

  const currentStageArtifact = workflow.artifacts.find((artifact) => artifact.stage === workflow.currentStage);
  if (currentStageArtifact) return currentStageArtifact;

  return [...workflow.artifacts].sort((left, right) => right.path.localeCompare(left.path))[0];
}

function deriveLatestHistoryEntry(workflow) {
  const entries = [...(workflow.history ?? [])];
  entries.sort((left, right) => {
    const leftTime = new Date(left.startedAt ?? 0).getTime();
    const rightTime = new Date(right.startedAt ?? 0).getTime();
    return rightTime - leftTime;
  });
  return entries[0] ?? null;
}

function getFeatureCommands(workflow) {
  const base = `--root . --feature ${workflow.featureId}`;
  const commands = [
    {
      label: "Status",
      hint: "Inspect the current stage and engine state.",
      command: `qrspi status ${base}`,
      tone: "neutral",
    },
    {
      label: "Run next stage",
      hint: "Continue from the current stage and stop at gates.",
      command: `qrspi run ${base}`,
      tone: "accent",
    },
    {
      label: "Context",
      hint: "Check what artifacts the next run will load.",
      command: `qrspi context ${base}`,
      tone: "neutral",
    },
  ];

  if (workflow.engineStatus === "waiting_approval") {
    commands.splice(1, 0, {
      label: "Approve gate",
      hint: "Advance past the current human approval gate.",
      command: `qrspi approve ${workflow.currentStage} ${base}`,
      tone: "success",
    });
    commands.splice(2, 0, {
      label: "Reject gate",
      hint: "Regenerate the current gate artifact.",
      command: `qrspi reject ${workflow.currentStage} ${base} --comment "needs changes"`,
      tone: "warning",
    });
  }

  commands.push({
    label: "Rewind",
    hint: "Return to an earlier stage when assumptions drift.",
    command: `qrspi rewind ${workflow.currentStage === "Q" ? "Q" : "R"} ${base} --reason "revisit upstream assumptions"`,
    tone: "danger",
  });

  return commands;
}

function renderWorkflowList() {
  ui.workflowSummary.textContent = `${state.workflows.length} loaded`;

  ui.workflowList.innerHTML = state.workflows
    .map((workflow) => {
      const selected = workflow.featureId === state.selectedFeatureId;
      const stage = STAGE_MAP[workflow.currentStage] ?? { name: "Unknown" };
      const tone = STATUS_TONE[workflow.engineStatus] ?? "muted";
      const updated = formatRelativeTime(new Date(workflow.updatedAt ?? Date.now()));

      return `
        <button class="workflow-card ${selected ? "is-selected" : ""}" type="button" data-feature-id="${workflow.featureId}">
          <span class="workflow-card-head">
            <strong>${escapeHtml(workflow.featureId)}</strong>
            <span class="status-pill tone-${tone}">${escapeHtml(STATUS_LABELS[workflow.engineStatus] ?? workflow.engineStatus)}</span>
          </span>
          <span class="workflow-card-meta">${escapeHtml(workflow.currentStage)} · ${escapeHtml(stage.name)}</span>
          <span class="workflow-card-foot">Updated ${escapeHtml(updated)}</span>
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
  const stage = STAGE_MAP[workflow.currentStage] ?? { name: "Unknown", kind: "alignment" };
  const latestEntry = deriveLatestHistoryEntry(workflow);
  const attemptCount = (workflow.history ?? []).length;
  const gateCount = (workflow.approvals ?? []).length;
  const lastUpdated = formatTimestamp(workflow.updatedAt);

  const cards = [
    {
      label: "Feature",
      value: workflow.featureId,
      tone: "muted",
    },
    {
      label: "Current stage",
      value: `${workflow.currentStage} · ${stage.name}`,
      tone: stage.kind === "execution" ? "live" : "accent",
    },
    {
      label: "Engine status",
      value: STATUS_LABELS[workflow.engineStatus] ?? workflow.engineStatus,
      tone: STATUS_TONE[workflow.engineStatus] ?? "muted",
    },
    {
      label: "Gate approvals",
      value: `${gateCount} confirmed`,
      tone: gateCount > 0 ? "success" : "muted",
    },
    {
      label: "Run attempts",
      value: `${attemptCount} total`,
      tone: attemptCount > 0 ? "accent" : "muted",
    },
    {
      label: "Last activity",
      value: latestEntry ? `${latestEntry.stage} · ${formatTimestamp(latestEntry.finishedAt ?? latestEntry.startedAt)}` : lastUpdated,
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
        <p>${escapeHtml(stage.description)}</p>
      </article>
    `;
  }).join("");
}

function renderArtifactPanel(workflow) {
  const artifact = deriveLatestArtifact(workflow);
  const latestRun = deriveLatestHistoryEntry(workflow);
  const stage = STAGE_MAP[workflow.currentStage];

  if (!artifact) {
    ui.artifactTitle.textContent = "No artifact available";
    ui.artifactMeta.textContent = "Run a stage to populate artifacts";
    ui.artifactPath.textContent = "-";
    ui.runLogPath.textContent = latestRun?.runDir ?? "-";
    ui.artifactPreview.textContent = "This workflow has not produced an artifact yet.";
    return;
  }

  ui.artifactTitle.textContent = `${artifact.stage} artifact`;
  ui.artifactMeta.textContent = stage?.gate
    ? "Human gate review"
    : `${stage?.kind === "execution" ? "Execution" : "Alignment"} output`;
  ui.artifactPath.textContent = artifact.path ?? workflow.latestArtifactPath ?? "-";
  ui.runLogPath.textContent = workflow.latestRunLogPath ?? latestRun?.runDir ?? "-";
  ui.artifactPreview.textContent = artifact.content?.trim() || "Artifact exists but content was empty.";
}

function renderHistory(workflow) {
  const history = [...(workflow.history ?? [])].sort((left, right) => {
    const leftTime = new Date(left.startedAt ?? 0).getTime();
    const rightTime = new Date(right.startedAt ?? 0).getTime();
    return rightTime - leftTime;
  });

  ui.historyMeta.textContent = `${history.length} entries`;

  if (history.length === 0) {
    ui.historyList.innerHTML = `<p class="placeholder-text">No run history recorded yet.</p>`;
    return;
  }

  ui.historyList.innerHTML = history.map((entry) => {
    const stage = STAGE_MAP[entry.stage];
    const tone = entry.success ? "success" : "danger";
    const stamp = formatTimestamp(entry.finishedAt ?? entry.startedAt);

    return `
      <article class="history-entry tone-${tone}">
        <div class="history-main">
          <strong>${escapeHtml(entry.stage)} · ${escapeHtml(stage?.name ?? "Unknown")}</strong>
          <span>${escapeHtml(stamp)} · attempt ${escapeHtml(String(entry.attempt ?? 1))}</span>
        </div>
        <code>${escapeHtml(entry.runDir ?? "-")}</code>
      </article>
    `;
  }).join("");
}

function renderCommands(workflow) {
  const commands = getFeatureCommands(workflow);
  if (!commands.some((item) => item.command === state.selectedCommand)) {
    state.selectedCommand = commands[0]?.command ?? "qrspi status --root .";
  }

  ui.commandList.innerHTML = commands.map((item) => `
    <button class="command-card ${state.selectedCommand === item.command ? "is-selected" : ""} tone-${item.tone}" type="button" data-command="${escapeHtml(item.command)}">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.hint)}</span>
      <code>${escapeHtml(item.command)}</code>
    </button>
  `).join("");

  ui.commandPreview.textContent = state.selectedCommand;

  for (const button of ui.commandList.querySelectorAll("[data-command]")) {
    button.addEventListener("click", () => {
      state.selectedCommand = button.getAttribute("data-command") ?? "qrspi status --root .";
      renderCommands(workflow);
    });
  }
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
    ui.logPreview.textContent = "No run log loaded.";
  }
}

function renderSlices(workflow) {
  const slices = [...(workflow.workTree?.slices ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  ui.sliceTitle.textContent = workflow.workTree ? "Work tree" : "No work tree";
  ui.sliceMeta.textContent = `${slices.length} slices`;

  if (slices.length === 0) {
    ui.sliceList.innerHTML = `<p class="placeholder-text">This workflow has not produced slice definitions yet.</p>`;
    return;
  }

  ui.sliceList.innerHTML = slices.map((slice) => `
    <article class="slice-card">
      <span class="slice-order">${escapeHtml(String(slice.order ?? 0))}</span>
      <div>
        <strong>${escapeHtml(slice.name ?? "Unnamed slice")}</strong>
        <p>${escapeHtml(slice.description ?? "No description")}</p>
        <code>${escapeHtml(slice.checkpoint ?? "No checkpoint")}</code>
      </div>
    </article>
  `).join("");
}

function renderCapabilities(workflow) {
  const items = [
    {
      label: "qrspi workflow stage management",
      tone: "success",
      enabled: state.sourceMode !== "Demo workspace" || state.workflows.length > 0,
    },
    {
      label: "project folder import",
      tone: "success",
      enabled: true,
    },
    {
      label: "gate-safe command handoff",
      tone: workflow.engineStatus === "waiting_approval" ? "warning" : "success",
      enabled: true,
    },
    {
      label: "modu worktree actions",
      tone: "muted",
      enabled: false,
    },
    {
      label: "gh pull request actions",
      tone: "muted",
      enabled: false,
    },
  ];

  ui.capabilityList.innerHTML = items.map((item) => `
    <li class="${item.enabled ? "" : "is-disabled"}">
      <span class="cap-dot tone-${item.tone}"></span>
      <span>${escapeHtml(item.label)}${item.enabled ? "" : " not configured"}</span>
    </li>
  `).join("");
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
  document.querySelector(".dashboard-grid").hidden = isEmpty;
}

function render() {
  renderTopline();
  renderEmptyState();

  if (state.workflows.length === 0) return;
  if (!state.workflows.some((workflow) => workflow.featureId === state.selectedFeatureId)) {
    state.selectedFeatureId = state.workflows[0].featureId;
  }

  const workflow = getSelectedWorkflow();
  if (!workflow) return;

  renderWorkflowList();
  renderSummary(workflow);
  renderStageTrack(workflow);
  renderArtifactPanel(workflow);
  renderHistory(workflow);
  renderCommands(workflow);
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
  const artifactContent = artifactPath ? await readTextFile(fileMap, artifactPath) : "";
  const structuredContent = structuredPath ? await readTextFile(fileMap, structuredPath) : "";

  return normalizeWorkflow({
    featureId: payload.feature,
    currentStage: payload.stage.code,
    engineStatus: payload.stage.status,
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
    approvals: [],
    history: [],
    gateReviews: payload.gate_reviews?.history ?? [],
    lastError: payload.next_action?.kind === "inspect_failure" ? payload.next_action.message ?? "" : "",
    validation: payload.validation ?? null,
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
    latestRunLogPath: workflow.latestRunLogPath ?? "",
    latestStdout: workflow.latestStdout ?? "",
    latestStderr: workflow.latestStderr ?? "",
    latestStructuredPath: workflow.latestStructuredPath ?? "",
    latestStructuredJson: workflow.latestStructuredJson ?? "",
    gateReviews: workflow.gateReviews ?? [],
    validation: workflow.validation ?? null,
    workTree: workflow.workTree ?? { slices: [] },
  };
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
  const file = fileMap.get(path);
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

  const artifactPaths = featureFiles.filter((path) => path.includes(`/artifacts/`) && path.endsWith(".md"));
  const artifacts = [];

  for (const path of artifactPaths) {
    const stageMatch = path.match(/artifacts\/([A-Z]+)_/);
    artifacts.push({
      stage: stageMatch?.[1] ?? "Q",
      path,
      content: await readTextFile(fileMap, path),
    });
  }

  const history = Array.isArray(engineJson?.history) ? engineJson.history : [];
  const latestHistory = [...history].sort((left, right) => {
    const leftTime = new Date(left.startedAt ?? 0).getTime();
    const rightTime = new Date(right.startedAt ?? 0).getTime();
    return rightTime - leftTime;
  })[0] ?? null;

  let latestStdout = "";
  let latestStderr = "";
  let latestRunLogPath = "";

  if (latestHistory?.runDir) {
    const runRoot = latestHistory.runDir.replace(/^\.\//, "");
    latestRunLogPath = `${runRoot}/live_stdout.txt`;
    latestStdout = await readTextFile(fileMap, `${runRoot}/live_stdout.txt`);
    latestStderr = await readTextFile(fileMap, `${runRoot}/live_stderr.txt`);
    if (!latestStdout && latestStderr) {
      latestRunLogPath = `${runRoot}/live_stderr.txt`;
    }
  }

  if (!latestRunLogPath) {
    const stdoutCandidates = featureFiles.filter((path) => path.endsWith("live_stdout.txt"));
    const stderrCandidates = featureFiles.filter((path) => path.endsWith("live_stderr.txt"));
    latestRunLogPath = pickLatestPath(stdoutCandidates) || pickLatestPath(stderrCandidates);
    latestStdout = latestStdout || await readTextFile(fileMap, latestRunLogPath);
    if (!latestStdout) {
      latestStderr = latestStderr || await readTextFile(fileMap, pickLatestPath(stderrCandidates));
    }
  }

  const currentStage = stateJson.current_stage ?? "Q";
  const currentArtifact = artifacts.find((artifact) => artifact.stage === currentStage);

  return normalizeWorkflow({
    featureId: stateJson.feature_id ?? featureId,
    currentStage,
    engineStatus: engineJson?.status ?? "ready",
    createdAt: stateJson.timestamp ?? engineJson?.updatedAt ?? engineJson?.updated_at,
    updatedAt: engineJson?.updatedAt ?? engineJson?.updated_at ?? stateJson.timestamp,
    approvals: engineJson?.approvals ?? [],
    history,
    lastError: engineJson?.lastError ?? "",
    artifacts,
    latestArtifactPath: currentArtifact?.path ?? pickLatestPath(artifactPaths),
    latestRunLogPath,
    latestStdout,
    latestStderr,
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

  const featureIds = collectFeatureIds(fileMap);
  let workflows = await parseCliStatusWorkflows(fileMap);

  if (workflows.length === 0) {
    for (const featureId of featureIds) {
      const workflow = await parseWorkflowFromFiles(fileMap, featureId);
      if (workflow) workflows.push(workflow);
    }
  }

  state.sourceMode = workflows.length > 0 && featureIds.length === 0
    ? "Imported CLI JSON"
    : "Imported project folder";
  state.projectRootLabel = [...relativeRoots][0] ?? "Imported workspace";
  state.workflows = workflows;
  state.importedFiles = list;
  state.lastRefreshAt = new Date();
  state.selectedFeatureId = workflows[0]?.featureId ?? "";
  state.selectedCommand = workflows[0]
    ? `qrspi status --root . --feature ${workflows[0].featureId}`
    : "qrspi status --root .";
  render();
}

function restoreDemoWorkspace() {
  state.sourceMode = DEMO_DATA.sourceMode;
  state.projectRootLabel = DEMO_DATA.projectRootLabel;
  state.workflows = DEMO_DATA.workflows.map((workflow) => normalizeWorkflow(workflow));
  state.selectedFeatureId = state.workflows[0]?.featureId ?? "";
  state.selectedCommand = state.workflows[0]
    ? `qrspi status --root . --feature ${state.workflows[0].featureId}`
    : "qrspi status --root .";
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
    await navigator.clipboard.writeText(command);
    ui.copyCommandButton.textContent = "Copied";
    window.setTimeout(() => {
      ui.copyCommandButton.textContent = "Copy highlighted";
    }, 1400);
    return;
  }

  ui.copyCommandButton.textContent = "Clipboard unavailable";
}

ui.openFolderButton.addEventListener("click", () => {
  ui.projectFolderInput.click();
});

ui.projectFolderInput.addEventListener("change", async (event) => {
  const files = event.target.files;
  await loadProjectFolder(files);
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
