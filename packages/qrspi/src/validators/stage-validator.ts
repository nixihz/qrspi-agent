import type {
  StageCode,
  ValidationResult,
  ValidationIssue,
  StageValidator,
} from "../workflow/types.js";

function makeResult(
  stage: StageCode,
  issues: ValidationIssue[],
): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  return {
    stage,
    valid: errors.length === 0,
    issues,
    summary: errors.length === 0
      ? `${stage} validation passed`
      : `${stage} validation failed: ${errors.map((e) => e.message).join("; ")}`,
  };
}

function checkMinLength(content: string, minLines: number, stage: StageCode): ValidationIssue | null {
  const lines = content.trim().split("\n").length;
  if (lines < minLines) {
    return {
      severity: "error",
      message: `Content too short (${lines} lines, at least ${minLines} required)`,
    };
  }
  return null;
}

function hasHeading(content: string, pattern: RegExp): boolean {
  return content
    .split("\n")
    .some((line) => /^#{1,6}\s+/.test(line.trim()) && pattern.test(line.trim()));
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function validateQ(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 10, "Q");
  if (lenIssue) issues.push(lenIssue);

  const questionMatches = content.match(/### Q\d+:/g) ?? [];
  if (questionMatches.length < 5) {
    issues.push({ severity: "error", message: `Too few questions (${questionMatches.length}, at least 5 required)` });
  }
  if (questionMatches.length > 15) {
    issues.push({ severity: "warning", message: `Too many questions (${questionMatches.length}, recommended max 15)` });
  }

  const blockingCount = (content.match(/blocking/g) ?? []).length;
  if (blockingCount > 3) {
    issues.push({ severity: "warning", message: `More than 3 blocking issues` });
  }

  return makeResult("Q", issues);
}

function validateR(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 15, "R");
  if (lenIssue) issues.push(lenIssue);
  return makeResult("R", issues);
}

function validateD(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 20, "D");
  if (lenIssue) issues.push(lenIssue);

  if (!hasHeading(content, /^#\s+(Design Discussion|设计讨论)\b/i)) {
    issues.push({
      severity: "error",
      message: "D stage output must be a Design Discussion document",
    });
  }

  const requiredSections: Array<[string, RegExp]> = [
    ["Current State", /^#{2,6}\s+(?:\d+\.\s*)?(Current State|Current System|As-Is|现状|当前状态)\b/i],
    ["Target State", /^#{2,6}\s+(?:\d+\.\s*)?(Target State|Desired State|To-Be|目标状态|目标)\b/i],
    ["Design Decisions", /^#{2,6}\s+(?:\d+\.\s*)?(Design Decisions?|Decisions?|设计决策|决策)\b/i],
  ];

  for (const [name, pattern] of requiredSections) {
    if (!hasHeading(content, pattern)) {
      issues.push({
        severity: "error",
        message: `Missing required design section: ${name}`,
      });
    }
  }

  const decisionCount = countMatches(content, /^###\s+(?:Decision|决策)\s+\d+\s*:/gim);
  if (decisionCount < 1) {
    issues.push({ severity: "error", message: "Missing design decision entries" });
  }

  const recommendedCount = countMatches(content, /\*\*(?:Recommended|Recommendation|推荐方案|推荐)\*\*\s*:/gi);
  if (recommendedCount < 1) {
    issues.push({ severity: "error", message: "Missing recommended option in design decisions" });
  }

  const alternativeCount = countMatches(content, /\*\*(?:Alternative(?:\s+[A-Z])?|备选方案|替代方案)\*\*\s*:/gi);
  if (alternativeCount < 1) {
    issues.push({ severity: "warning", message: "Too few alternatives presented" });
  }

  const confirmationCount = countMatches(content, /\*\*(?:Needs? Confirmation|Open Questions?|需要确认|待确认)\*\*\s*:/gi);
  if (confirmationCount < 1) {
    issues.push({ severity: "warning", message: "Missing confirmation questions in design decisions" });
  }

  if (!hasHeading(content, /^#{2,6}\s+(?:\d+\.\s*)?(Architecture Constraints?|Constraints?|架构约束|约束)\b/i)) {
    issues.push({ severity: "warning", message: "Missing architecture constraints section" });
  }

  if (!hasHeading(content, /^#{2,6}\s+(?:\d+\.\s*)?(Risks?(?: and Mitigations)?|Mitigations?|风险|风险与缓解)\b/i)) {
    issues.push({ severity: "warning", message: "Missing risks and mitigations section" });
  }

  return makeResult("D", issues);
}

function validateS(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 20, "S");
  if (lenIssue) issues.push(lenIssue);

  if (!content.includes("interface") && !content.includes("type ") && !content.includes("function ")) {
    issues.push({ severity: "warning", message: "No type definitions or function signatures detected" });
  }

  return makeResult("S", issues);
}

function validateP(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 15, "P");
  if (lenIssue) issues.push(lenIssue);
  return makeResult("P", issues);
}

function validateW(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    issues.push({ severity: "error", message: "W stage output must be valid JSON" });
    return makeResult("W", issues);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { slices?: unknown }).slices) ||
    (parsed as { slices: unknown[] }).slices.length === 0
  ) {
    issues.push({ severity: "error", message: "W stage JSON must contain at least one slice" });
    return makeResult("W", issues);
  }

  const slices = (parsed as { slices: Array<unknown> }).slices;
  const validTiers = new Set(["low", "standard", "powerful"]);

  for (const slice of slices) {
    if (typeof slice !== "object" || slice === null) continue;
    const tasks = (slice as { tasks?: unknown[] }).tasks ?? [];
    for (const task of tasks) {
      if (typeof task !== "object" || task === null) continue;
      const taskObj = task as { model_tier?: unknown };
      if (!("model_tier" in taskObj)) {
        issues.push({
          severity: "warning",
          message: `Task missing model_tier field (expected one of: low, standard, powerful)`,
        });
      } else if (typeof taskObj.model_tier !== "string" || !validTiers.has(taskObj.model_tier)) {
        issues.push({
          severity: "warning",
          message: `Task has invalid model_tier "${taskObj.model_tier}" (expected one of: low, standard, powerful)`,
        });
      }
    }
  }

  return makeResult("W", issues);
}

function validateI(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 5, "I");
  if (lenIssue) issues.push(lenIssue);

  const lower = content.toLowerCase();
  const hasSelfReview =
    lower.includes("self-review") ||
    lower.includes("self review") ||
    content.includes("自检") ||
    content.includes("自查");
  if (!hasSelfReview) {
    issues.push({ severity: "warning", message: "Missing self-review section" });
  }

  const hasStatusReport =
    lower.includes("done") ||
    lower.includes("blocked") ||
    lower.includes("needs_context") ||
    lower.includes("needs context") ||
    lower.includes("done_with_concerns") ||
    lower.includes("done with concerns") ||
    content.includes("状态") ||
    content.includes("BLOCKED") ||
    content.includes("NEEDS_CONTEXT") ||
    content.includes("DONE_WITH_CONCERNS");
  if (!hasStatusReport) {
    issues.push({ severity: "warning", message: "Missing status report (DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT)" });
  }

  const hasFilesChanged =
    lower.includes("files changed") ||
    lower.includes("files:") ||
    content.includes("变更文件") ||
    content.includes("文件变更");
  if (!hasFilesChanged) {
    issues.push({ severity: "warning", message: "Missing files changed list" });
  }

  return makeResult("I", issues);
}

function validatePR(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 5, "PR");
  if (lenIssue) issues.push(lenIssue);
  return makeResult("PR", issues);
}

const VALIDATORS: Record<StageCode, (content: string) => ValidationResult> = {
  Q: validateQ,
  R: validateR,
  D: validateD,
  S: validateS,
  P: validateP,
  W: validateW,
  I: validateI,
  PR: validatePR,
};

export function validateStageArtifact(
  stage: StageCode,
  content: string,
): ValidationResult {
  const validator = VALIDATORS[stage];
  return validator(content);
}

export function createStageValidators(): Record<StageCode, StageValidator> {
  const result = {} as Record<StageCode, StageValidator>;
  for (const [stage, fn] of Object.entries(VALIDATORS)) {
    const code = stage as StageCode;
    result[code] = {
      stage: code,
      validate: fn,
    };
  }
  return result;
}
