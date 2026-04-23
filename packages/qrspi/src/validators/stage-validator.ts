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

function checkHeadings(content: string, required: string[]): ValidationIssue[] {
  return required
    .filter((h) => !content.includes(h))
    .map((h) => ({ severity: "error" as const, message: `Missing required section: ${h}` }));
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

  const headingIssues = checkHeadings(content, ["## 1.", "## 2.", "## 3."]);
  issues.push(...headingIssues);

  const alternativeCount = (content.match(/alternative/gi) ?? []).length;
  if (alternativeCount < 2) {
    issues.push({ severity: "warning", message: "Too few alternatives presented" });
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
  }

  return makeResult("W", issues);
}

function validateI(content: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const lenIssue = checkMinLength(content, 5, "I");
  if (lenIssue) issues.push(lenIssue);
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
