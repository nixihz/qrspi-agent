/**
 * Stage artifact parser
 *
 * Converts markdown / JSON artifacts into stable structured data,
 * so subsequent stages do not have to guess key fields from free text.
 */

import type { StageCode } from "../workflow/types.js";

export interface ParsedArtifact {
  stage: StageCode;
  summary: string;
  structured_data: Record<string, unknown>;
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
  const modified = extractBullets(content, "## Changes") ?? extractBullets(content, "## 完成的修改");
  const tests = extractBullets(content, "## Test Results") ?? extractBullets(content, "## 测试结果");
  const summary = `Implementation records ${modified.length} changes, ${tests.length} test results.`;
  return {
    stage: "I",
    summary,
    structured_data: {
      modified_items: modified,
      tests,
    },
  };
}

function parsePR(content: string): ParsedArtifact {
  const tests = extractBullets(content, "## Tests") ?? extractBullets(content, "## 测试");
  const summary = `PR artifact generated with ${tests.length} test entries.`;
  return {
    stage: "PR",
    summary,
    structured_data: { tests },
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

function shorten(content: string, limit = 200): string {
  const compact = content.split(/\s+/).join(" ");
  if (compact.length <= limit) return compact;
  return compact.slice(0, limit).trimEnd() + "...";
}
