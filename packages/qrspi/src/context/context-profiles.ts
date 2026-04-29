import type {
  DependencyContextPlan,
  FocusedContextData,
  ContextDependency,
  StageCode,
  StageContextProfile,
  StageLayerRule,
} from "../workflow/types.js";

const DECISION_FIELDS: Array<keyof FocusedContextData> = [
  "decisions",
  "constraints",
  "risks",
  "evidence",
];

const STRUCTURE_FIELDS: Array<keyof FocusedContextData> = [
  "interfaces",
  "functions",
  "constraints",
  "files",
];

const PLAN_FIELDS: Array<keyof FocusedContextData> = [
  "rollback",
  "constraints",
  "files",
];

const WORK_FIELDS: Array<keyof FocusedContextData> = [
  "slices",
  "files",
  "tests",
];

const IMPLEMENTATION_FIELDS: Array<keyof FocusedContextData> = [
  "changes",
  "tests",
  "files",
];

const PROFILES: Partial<Record<StageCode, StageLayerRule[]>> = {
  P: [
    rule("Q", "summary", false, 10, ["evidence", "risks"]),
    rule("R", "summary", false, 20, ["evidence", "risks"]),
    rule("D", "focused", true, 70, DECISION_FIELDS),
    rule("S", "full", true, 100, STRUCTURE_FIELDS),
  ],
  W: [
    rule("Q", "pointer", false, 5),
    rule("R", "pointer", false, 10),
    rule("D", "summary", false, 30, DECISION_FIELDS),
    rule("S", "focused", true, 80, STRUCTURE_FIELDS),
    rule("P", "full", true, 100, PLAN_FIELDS),
  ],
  I: [
    rule("Q", "summary", false, 5, ["risks"]),
    rule("R", "summary", false, 10, ["evidence", "risks"]),
    rule("D", "summary", false, 30, DECISION_FIELDS),
    rule("S", "focused", true, 70, STRUCTURE_FIELDS),
    rule("P", "full", true, 90, PLAN_FIELDS),
    rule("W", "full", true, 100, WORK_FIELDS),
  ],
  PR: [
    rule("Q", "pointer", false, 5),
    rule("R", "pointer", false, 10),
    rule("D", "summary", false, 30, DECISION_FIELDS),
    rule("S", "summary", false, 40, STRUCTURE_FIELDS),
    rule("P", "focused", true, 70, PLAN_FIELDS),
    rule("W", "focused", true, 80, WORK_FIELDS),
    rule("I", "full", true, 100, IMPLEMENTATION_FIELDS),
  ],
};

export function getStageContextProfile(stage: StageCode): StageContextProfile {
  return {
    currentStage: stage,
    rules: PROFILES[stage] ?? [],
  };
}

export function buildDependencyContextPlans(
  stage: StageCode,
  dependencies: ContextDependency[],
  profile: StageContextProfile = getStageContextProfile(stage),
): DependencyContextPlan[] {
  return dependencies.map((dependency, index) => {
    const matchingRule = profile.rules.find((item) => item.stage === dependency.stage);
    return {
      dependency,
      layer: matchingRule?.layer ?? "full",
      required: matchingRule?.required ?? dependency.required,
      priority: matchingRule?.priority ?? ((index + 1) * 10),
      focusedFields: matchingRule?.focusedFields ?? [],
    };
  });
}

function rule(
  stage: StageCode,
  layer: StageLayerRule["layer"],
  required: boolean,
  priority: number,
  focusedFields: Array<keyof FocusedContextData> = [],
): StageLayerRule {
  return {
    stage,
    layer,
    required,
    priority,
    focusedFields,
  };
}
