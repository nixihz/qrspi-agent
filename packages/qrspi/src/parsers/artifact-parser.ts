/**
 * Stage artifact parser
 *
 * Converts markdown / JSON artifacts into stable structured data,
 * so subsequent stages do not have to guess key fields from free text.
 */

import type { ImplementationStatus, StageCode } from "../workflow/types.js";

export interface ParsedArtifact {
  stage: StageCode;
  summary: string;
  structured_data: Record<string, unknown>;
}

export interface ImplementationReportMetadata {
  status?: ImplementationStatus;
  modifiedItems: string[];
  tests: string[];
  remainingIssues: string[];
  filesChanged: string[];
  selfReview: string[];
}

export function parseStageOutput(stage: StageCode, content: string): ParsedArtifact {
  const handlers: Record<StageCode, (content: string) => ParsedArtifact> = {
    Q: parseQ,
    R: parseR,
    D: parseD,
    S: parseS,
    P: parseP,
    W: parseW,
    I: parseI,
    PR: parsePR,
  };
  const handler = handlers[stage] ?? parseGeneric;
  return handler(content);
}

function parseGeneric(content: string): ParsedArtifact {
  return { stage: "Q", summary: shorten(content), structured_data: {} };
}

function parseQ(content: string): ParsedArtifact {
  const questions = extractMatches(content, /^###\s+(Q\d+):\s+(.+)$/gm);
  const assumptions = extractBullets(content, "## Assumptions") ?? extractBullets(content, "## 假设清单");
  const risks = extractBullets(content, "## Risks") ?? extractBullets(content, "## 风险标记");
  const summary = `Identified ${questions.length} technical questions, ${assumptions.length} assumptions, ${risks.length} risks.`;
  return {
    stage: "Q",
    summary,
    structured_data: {
      questions: questions.map(([qid, title]) => ({ id: qid, title })),
      assumptions,
      risks,
    },
  };
}

function parseR(content: string): ParsedArtifact {
  const findings = extractMatches(content, /^##\s+(Q\d+):\s+(.+)$/gm);
  const unresolved = extractBullets(content, "## Unresolved") ?? extractBullets(content, "## 未解决问题");
  const summary = `Research covers ${findings.length} questions, ${unresolved.length} unresolved.`;
  return {
    stage: "R",
    summary,
    structured_data: {
      findings: findings.map(([qid, title]) => ({ id: qid, title })),
      unresolved,
    },
  };
}

function parseD(content: string): ParsedArtifact {
  const decisions = extractMatches(content, /^###\s+(Decision\s+\d+|决策\s+\d+):\s+(.+)$/gm).map((m) => m[1]);
  const pending = extractMatches(content, /(Needs? confirmation|需要确认)\*?\*?:\s*(.+)/g).map((m) => m[1]);
  const summary = `Design doc contains ${decisions.length} decisions, ${pending.length} pending confirmations.`;
  return {
    stage: "D",
    summary,
    structured_data: {
      decisions,
      pending_confirmations: pending,
    },
  };
}

function parseS(content: string): ParsedArtifact {
  const sliceRegex = /^###\s+(Slice|切片)\s+(\d+):\s+(.+)$/gm;
  const slices: Record<string, unknown>[] = [];
  let idx = 1;
  let match: RegExpExecArray | null;
  const matches: Array<{ order: number; title: string; start: number; end: number }> = [];

  while ((match = sliceRegex.exec(content)) !== null) {
    matches.push({
      order: parseInt(match[2], 10),
      title: match[3].trim(),
      start: match.index + match[0].length,
      end: content.length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const blockEnd = i + 1 < matches.length ? matches[i + 1].start - matches[i + 1].order.toString().length - 10 : content.length;
    const block = content.slice(m.start, blockEnd);
    const checkpoint = extractNamedLine(block, "Test") || extractNamedLine(block, "Checkpoint") || extractNamedLine(block, "测试") || extractNamedLine(block, "出口");
    slices.push({
      name: m.title,
      description: extractNamedLine(block, "Goal") || extractNamedLine(block, "目标") || m.title,
      order: m.order || idx,
      checkpoint,
    });
    idx++;
  }

  const summary = `Structure outline defines ${slices.length} vertical slices.`;
  return {
    stage: "S",
    summary,
    structured_data: { slices },
  };
}

function parseP(content: string): ParsedArtifact {
  const checkpoints = extractBullets(content, "## Rollback") ?? extractBullets(content, "## 回滚策略");
  const summary = checkpoints.length
    ? `Implementation plan generated with ${checkpoints.length} rollback strategies.`
    : "Implementation plan generated.";
  return {
    stage: "P",
    summary,
    structured_data: { rollback_items: checkpoints },
  };
}

function parseW(content: string): ParsedArtifact {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const rawSlices = (data.slices ?? []) as Array<Record<string, unknown>>;
    const normalizedSlices: Record<string, unknown>[] = [];

    for (let i = 0; i < rawSlices.length; i++) {
      const item = rawSlices[i];
      normalizedSlices.push({
        name: item.name ?? `slice-${i + 1}`,
        description: item.description ?? "",
        order: item.order ?? i + 1,
        dependencies: item.dependencies ?? [],
        testable: item.testable ?? true,
        status: item.status ?? "pending",
        checkpoint: item.checkpoint ?? "",
        tasks: item.tasks ?? [],
      });
    }

    const totalTasks = normalizedSlices.reduce(
      (sum, item) => sum + ((item.tasks as unknown[])?.length ?? 0),
      0,
    );
    const summary = `Work tree contains ${normalizedSlices.length} slices, ${totalTasks} tasks.`;
    return {
      stage: "W",
      summary,
      structured_data: {
        current_slice_idx: data.current_slice_idx ?? 0,
        slices: normalizedSlices,
      },
    };
  } catch {
    return { stage: "W", summary: "Work tree content is not valid JSON.", structured_data: {} };
  }
}

function parseI(content: string): ParsedArtifact {
  const metadata = extractImplementationReportMetadata(content);
  const statusLabel = metadata.status ?? "UNKNOWN";
  const summary = `Implementation status ${statusLabel} with ${metadata.modifiedItems.length} change entries and ${metadata.tests.length} verification entries.`;
  return {
    stage: "I",
    summary,
    structured_data: {
      status: metadata.status ?? null,
      modified_items: metadata.modifiedItems,
      tests: metadata.tests,
      remaining_issues: metadata.remainingIssues,
      files_changed: metadata.filesChanged,
      self_review: metadata.selfReview,
    },
  };
}

function parsePR(content: string): ParsedArtifact {
  const changes = extractSectionItems(content, ["Change Summary", "变更摘要"]);
  const tests = extractSectionItems(content, ["Tests", "Test Coverage", "测试", "测试覆盖"]);
  const releaseCriteria = extractSectionItems(content, ["Release Criteria", "上线条件"]);
  const reviewChecklist = extractSectionItems(content, ["Review Checklist", "Code Review Checklist", "审查清单"]);
  const summary = `PR artifact generated with ${changes.length} change entries, ${tests.length} test entries, and ${reviewChecklist.length} checklist items.`;
  return {
    stage: "PR",
    summary,
    structured_data: {
      changes,
      tests,
      release_criteria: releaseCriteria,
      review_checklist: reviewChecklist,
    },
  };
}

function extractMatches(content: string, regex: RegExp): string[][] {
  const results: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    results.push(match.slice(1));
  }
  return results;
}

function extractBullets(content: string, header: string): string[] {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped + "\\n?(?<body>.*?)(?:\\n## |$)", "s");
  const m = pattern.exec(content);
  if (!m?.groups?.body) return [];

  const bullets: string[] = [];
  for (const line of m.groups.body.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("- ") || stripped.startsWith("* ")) {
      bullets.push(stripped.slice(2).trim());
    }
  }
  return bullets;
}

function extractNamedLine(block: string, label: string): string {
  const match = block.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`));
  if (match) return match[1].trim();
  return "";
}

const IMPLEMENTATION_STATUSES: ImplementationStatus[] = [
  "DONE",
  "DONE_WITH_CONCERNS",
  "BLOCKED",
  "NEEDS_CONTEXT",
];

export function extractImplementationReportMetadata(content: string): ImplementationReportMetadata {
  return {
    status: extractImplementationStatus(content),
    modifiedItems: extractSectionItems(content, [
      "Changes",
      "Completed Changes",
      "完成的修改",
      "Implementation Content",
      "实现内容",
    ]),
    tests: extractSectionItems(content, [
      "Test Results",
      "Verification Result",
      "测试结果",
      "验证结果",
    ]),
    remainingIssues: extractSectionItems(content, [
      "Remaining Issues",
      "Open Questions",
      "遗留问题",
      "未解决问题",
    ]),
    filesChanged: extractSectionItems(content, [
      "Files Changed",
      "Changed Files",
      "变更文件",
      "文件变更",
    ]),
    selfReview: extractSectionItems(content, [
      "Self-Review",
      "Self Review",
      "自检",
      "自查",
    ]),
  };
}

export function extractImplementationStatus(content: string): ImplementationStatus | undefined {
  const patterns = [
    /\*\*(?:Status|状态)(?:\s*[:：]\s*)?\*\*\s*[:：]?\s*(DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED|DONE)\b/i,
    /^#{1,6}\s*(?:Status|状态)\s*[:：]\s*(DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED|DONE)\b/im,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;
    const normalized = match[1].toUpperCase() as ImplementationStatus;
    if (IMPLEMENTATION_STATUSES.includes(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function extractSectionItems(content: string, headings: string[]): string[] {
  for (const heading of headings) {
    const bodies = extractSectionBodies(content, heading);
    if (bodies.length === 0) continue;
    return bodies.flatMap((body) => normalizeSectionItems(body));
  }
  return [];
}

function extractSectionBodies(content: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, "gm");
  const sections: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const bodyStart = match.index + match[0].length;
    const remainder = content.slice(bodyStart);
    const nextHeading = /^#{1,6}\s+/m;
    const nextMatch = nextHeading.exec(remainder);
    const body = nextMatch
      ? remainder.slice(0, nextMatch.index).trim()
      : remainder.trim();

    if (body) {
      sections.push(body);
    }
  }

  return sections;
}

function normalizeSectionItems(body: string): string[] {
  const items: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      items.push(line.slice(2).trim());
      continue;
    }
    items.push(line);
  }
  return items;
}

function shorten(content: string, limit = 200): string {
  const compact = content.split(/\s+/).join(" ");
  if (compact.length <= limit) return compact;
  return compact.slice(0, limit).trimEnd() + "...";
}
