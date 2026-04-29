import type {
  ContextSourceArtifact,
  FocusedContextData,
  StageCode,
} from "../workflow/types.js";

export function extractFocusedContextData(source: ContextSourceArtifact): FocusedContextData {
  const structured = extractFromStructured(source.stage, source.structuredData);
  const markdown = extractFromMarkdown(source.rawContent);
  return mergeFocusedData(markdown, structured);
}

function extractFromStructured(stage: StageCode, value: unknown): FocusedContextData {
  if (!value || typeof value !== "object") return {};
  const artifact = value as { structured_data?: unknown; summary?: unknown };
  const data = (artifact.structured_data && typeof artifact.structured_data === "object")
    ? artifact.structured_data as Record<string, unknown>
    : value as Record<string, unknown>;

  if (stage === "Q") {
    return {
      evidence: questionTitles(data.questions),
      risks: stringArray(data.risks),
    };
  }

  if (stage === "R") {
    return {
      evidence: questionTitles(data.findings),
      risks: stringArray(data.unresolved),
    };
  }

  if (stage === "D") {
    return {
      decisions: stringArray(data.decisions),
      risks: stringArray(data.risks),
      evidence: stringArray(data.rejected_alternatives),
    };
  }

  if (stage === "S") {
    return {
      interfaces: stringArray(data.interfaces),
      functions: stringArray(data.functions),
      constraints: stringArray(data.constraints),
    };
  }

  if (stage === "P") {
    return {
      rollback: stringArray(data.rollback_items),
      constraints: sectionish(data.checkpoints),
    };
  }

  if (stage === "W") {
    return {
      slices: sliceSummaries(data.slices),
    };
  }

  if (stage === "I") {
    return {
      changes: stringArray(data.modified_items),
      tests: stringArray(data.tests),
      files: stringArray(data.files_changed),
      risks: stringArray(data.remaining_issues),
    };
  }

  if (stage === "PR") {
    return {
      changes: stringArray(data.changes),
      tests: stringArray(data.tests),
      evidence: stringArray(data.release_criteria),
    };
  }

  return {};
}

function extractFromMarkdown(content: string): FocusedContextData {
  return {
    decisions: extractSections(content, ["Design Decisions", "设计决策", "Decision", "决策"]),
    constraints: extractSections(content, ["Architecture Constraints", "架构约束", "Constraints", "约束", "Boundaries", "边界"]),
    risks: extractSections(content, ["Risks", "风险", "Risks and Mitigations", "风险与缓解", "Remaining Issues", "遗留问题"]),
    evidence: extractSections(content, ["Codebase Technical Map", "代码库技术地图", "Research Report", "研究报告", "Question List", "问题列表"]),
    files: extractFilePointers(content),
    interfaces: extractCodeSymbols(content, /^\s*export\s+interface\s+([A-Za-z0-9_]+)/gm),
    functions: extractCodeSymbols(content, /^\s*export\s+function\s+([A-Za-z0-9_]+)/gm),
    slices: extractSections(content, ["Vertical Slices", "垂直切片", "slices"]),
    tests: extractSections(content, ["Tests", "Test Coverage", "验证结果", "测试", "测试覆盖"]),
    changes: extractSections(content, ["Change Summary", "变更摘要", "Implementation Content", "实现内容"]),
    rollback: extractSections(content, ["Rollback", "回滚策略"]),
  };
}

function mergeFocusedData(fallback: FocusedContextData, preferred: FocusedContextData): FocusedContextData {
  const result: FocusedContextData = {};
  const keys: Array<keyof FocusedContextData> = [
    "decisions",
    "constraints",
    "risks",
    "evidence",
    "files",
    "interfaces",
    "functions",
    "slices",
    "tests",
    "changes",
    "rollback",
  ];

  for (const key of keys) {
    const preferredItems = preferred[key];
    const fallbackItems = fallback[key];
    result[key] = preferredItems && preferredItems.length > 0 ? preferredItems : fallbackItems;
  }

  return result;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : JSON.stringify(item))
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function sectionish(value: unknown): string[] {
  return stringArray(value);
}

function questionTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? `${record.id}: ` : "";
      const title = typeof record.title === "string" ? record.title : JSON.stringify(record);
      return `${id}${title}`;
    }
    return String(item);
  });
}

function sliceSummaries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== "object") return String(item);
    const record = item as Record<string, unknown>;
    const order = record.order ?? index + 1;
    const name = record.name ?? `slice-${index + 1}`;
    const checkpoint = record.checkpoint ? ` checkpoint=${record.checkpoint}` : "";
    return `${order}. ${name}${checkpoint}`;
  });
}

function extractSections(content: string, headings: string[]): string[] {
  const items: string[] = [];
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^#{2,6}\\s+.*${escaped}.*$`, "gim");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const bodyStart = match.index + match[0].length;
      const remainder = content.slice(bodyStart);
      const nextHeading = /^#{1,6}\s+/m.exec(remainder);
      const body = nextHeading ? remainder.slice(0, nextHeading.index).trim() : remainder.trim();
      if (body) items.push(...normalizeSectionItems(body));
    }
  }
  return unique(items).slice(0, 20);
}

function normalizeSectionItems(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function extractFilePointers(content: string): string[] {
  const matches = content.match(/\b(?:packages|src|docs|tests|skills)\/[^\s):]+/g) ?? [];
  return unique(matches).slice(0, 20);
}

function extractCodeSymbols(content: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    matches.push(match[1]);
  }
  return unique(matches);
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}
