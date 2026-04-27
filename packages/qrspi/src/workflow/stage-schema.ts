import type { StageCode, StageDefinition, ContextDependency } from "./types.js";

const STAGE_ORDER: StageCode[] = ["Q", "R", "D", "S", "P", "W", "I", "PR"];

const GATE_STAGES: Set<StageCode> = new Set(["D", "S", "PR"]);

const STAGE_DEFINITIONS: Record<StageCode, StageDefinition> = {
  Q: {
    code: "Q",
    name: "Questions",
    kind: "alignment",
    gateRequired: false,
    promptKey: "Q",
    dependencies: [],
    next: "R",
  },
  R: {
    code: "R",
    name: "Research",
    kind: "alignment",
    gateRequired: false,
    promptKey: "R",
    dependencies: ["Q"],
    next: "D",
  },
  D: {
    code: "D",
    name: "Design Discussion",
    kind: "alignment",
    gateRequired: true,
    promptKey: "D",
    dependencies: ["Q", "R"],
    next: "S",
  },
  S: {
    code: "S",
    name: "Structure Outline",
    kind: "alignment",
    gateRequired: true,
    promptKey: "S",
    dependencies: ["Q", "R", "D"],
    next: "P",
  },
  P: {
    code: "P",
    name: "Plan",
    kind: "alignment",
    gateRequired: false,
    promptKey: "P",
    dependencies: ["Q", "R", "D", "S"],
    next: "W",
  },
  W: {
    code: "W",
    name: "Work Tree",
    kind: "execution",
    gateRequired: false,
    promptKey: "W",
    dependencies: ["Q", "R", "D", "S", "P"],
    next: "I",
  },
  I: {
    code: "I",
    name: "Implement",
    kind: "execution",
    gateRequired: false,
    promptKey: "I",
    dependencies: ["Q", "R", "D", "S", "P", "W"],
    next: "PR",
  },
  PR: {
    code: "PR",
    name: "Pull Request",
    kind: "execution",
    gateRequired: true,
    promptKey: "PR",
    dependencies: ["Q", "R", "D", "S", "P", "W", "I"],
    next: undefined,
  },
};

const STAGE_NAMES: Record<StageCode, string> = {
  Q: "Questions",
  R: "Research",
  D: "Design Discussion",
  S: "Structure Outline",
  P: "Plan",
  W: "Work Tree",
  I: "Implement",
  PR: "Pull Request",
};

const STAGE_DESCRIPTIONS: Record<StageCode, string> = {
  Q: "Identify what the agent does not know, turning vague requirements into concrete technical questions",
  R: "Collect objective facts from the codebase, producing a technical map rather than a plan",
  D: "Brain-dump understanding, produce ~200 lines of markdown design doc, align with humans",
  S: "Define function signatures, new types and high-level stages, enforce vertical slicing",
  P: "Tactical implementation document, constrained by Design and Structure",
  W: "Organize task tree by vertical slices, each slice testable",
  I: "Write code, each vertical slice in an independent Session",
  PR: "Human review of code, own the code, do not let garbage into production",
};

export function createStageDefinitions(): Record<StageCode, StageDefinition> {
  return { ...STAGE_DEFINITIONS };
}

export function getStageDefinition(stage: StageCode): StageDefinition {
  return STAGE_DEFINITIONS[stage];
}

export function getNextStage(stage: StageCode): StageCode | undefined {
  return STAGE_DEFINITIONS[stage].next;
}

export function isGateStage(stage: StageCode): boolean {
  return GATE_STAGES.has(stage);
}

export function getStageName(stage: StageCode): string {
  return STAGE_NAMES[stage];
}

export function getStageDescription(stage: StageCode): string {
  return STAGE_DESCRIPTIONS[stage];
}

export function getStageOrder(): StageCode[] {
  return [...STAGE_ORDER];
}

export function getStageIndex(stage: StageCode): number {
  return STAGE_ORDER.indexOf(stage);
}

export function isValidStageCode(code: string): code is StageCode {
  return STAGE_ORDER.includes(code as StageCode);
}

export function getStageDependencies(stage: StageCode): ContextDependency[] {
  return STAGE_DEFINITIONS[stage].dependencies.map((dep) => ({
    stage: dep,
    required: true,
    summaryOnly: false,
  }));
}
