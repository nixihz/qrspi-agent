import type {
  ImplementationStatus,
  StageCode,
  ValidationResult,
  ValidationIssue,
  StageValidator,
} from "../workflow/types.js";
import { extractImplementationReportMetadata, parseStageOutput } from "../parsers/artifact-parser.js";

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

  const metadata = extractImplementationReportMetadata(content);
  const status = metadata.status;

  if (!status) {
    issues.push({
      severity: "error",
      message: "Missing status report (DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT)",
    });
    return makeResult("I", issues);
  }

  if (metadata.selfReview.length === 0) {
    const severity = isImplementationSuccessStatus(status) ? "error" : "warning";
    issues.push({ severity, message: "Missing self-review section" });
  }

  if (isImplementationSuccessStatus(status)) {
    if (metadata.modifiedItems.length === 0) {
      issues.push({ severity: "error", message: "Successful I stage must include implementation content" });
    }
    if (metadata.tests.length === 0) {
      issues.push({ severity: "error", message: "Successful I stage must include verification results" });
    }
    if (metadata.filesChanged.length === 0) {
      issues.push({ severity: "error", message: "Successful I stage must include files changed list" });
    }
  } else if (metadata.remainingIssues.length === 0) {
    issues.push({ severity: "error", message: "Blocked I stage must explain remaining issues or missing context" });
  }

  return makeResult("I", issues);
}

function validatePR(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 5, "PR");
  if (lenIssue) issues.push(lenIssue);

  const requiredSections: Array<[string, RegExp]> = [
    ["Change Summary", /^#{2,6}\s+(Change Summary|变更摘要)\b/im],
    ["Test Coverage", /^#{2,6}\s+(Test Coverage|测试覆盖)\b/im],
    ["Release Criteria", /^#{2,6}\s+(Release Criteria|上线条件)\b/im],
    ["Review Checklist", /^#{2,6}\s+(Review Checklist|审查清单)\b/im],
  ];

  for (const [name, pattern] of requiredSections) {
    if (!pattern.test(content)) {
      issues.push({
        severity: "warning",
        message: `Missing recommended PR section: ${name}`,
      });
    }
  }

  const parsed = parseStageOutput("PR", content).structured_data;
  const changeCount = Array.isArray(parsed.changes) ? parsed.changes.length : 0;
  const testCount = Array.isArray(parsed.tests) ? parsed.tests.length : 0;
  const releaseCriteriaCount = Array.isArray(parsed.release_criteria) ? parsed.release_criteria.length : 0;
  const checklistCount = Array.isArray(parsed.review_checklist) ? parsed.review_checklist.length : 0;

  if (changeCount === 0) {
    issues.push({ severity: "warning", message: "PR artifact should summarize code changes" });
  }
  if (testCount === 0) {
    issues.push({ severity: "warning", message: "PR artifact should include test coverage details" });
  }
  if (releaseCriteriaCount === 0) {
    issues.push({ severity: "warning", message: "PR artifact should include release criteria" });
  }
  if (checklistCount === 0) {
    issues.push({ severity: "warning", message: "PR artifact should include review checklist items" });
  }
  return makeResult("PR", issues);
}

function isImplementationSuccessStatus(status: ImplementationStatus): boolean {
  return status === "DONE" || status === "DONE_WITH_CONCERNS";
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
