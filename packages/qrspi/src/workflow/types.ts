export type StageCode = "Q" | "R" | "D" | "S" | "P" | "W" | "I" | "PR";

export type StageKind = "alignment" | "execution";

export type RunnerName = "claude" | "codex" | "mock";

export type SessionStatus =
  | "idle"
  | "ready"
  | "running"
  | "failed"
  | "waiting_approval"
  | "completed";

export type ValidationSeverity = "error" | "warning" | "info";

export interface StageDefinition {
  code: StageCode;
  name: string;
  kind: StageKind;
  gateRequired: boolean;
  promptKey: string;
  dependencies: StageCode[];
  next?: StageCode;
}

export interface SessionConfig {
  featureId: string;
  projectRoot: string;
  outputDir: string;
}

export interface WorkflowState {
  featureId: string;
  currentStage: StageCode;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StageArtifact {
  stage: StageCode;
  title: string;
  content: string;
  generatedAt: string;
  artifactPath: string;
}

export interface ApprovalRecord {
  stage: StageCode;
  approvedAt: string;
  approvedBy?: string;
  comment?: string;
}

export interface EngineRunRecord {
  stage: StageCode;
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  runDir: string;
  success: boolean;
}

export interface EngineState {
  featureId: string;
  currentStage: StageCode;
  status: SessionStatus;
  approvals: ApprovalRecord[];
  stage_attempts: Partial<Record<StageCode, number>>;
  history: EngineRunRecord[];
  lastError?: string;
  updatedAt: string;
}

export interface ContextDependency {
  stage: StageCode;
  required: boolean;
  summaryOnly: boolean;
}

export interface ContextArtifactSummary {
  stage: StageCode;
  artifactPath: string;
  summary: string;
}

export interface ContextPack {
  currentStage: StageCode;
  dependencies: ContextArtifactSummary[];
  maxLinesPerArtifact: number;
  utilizationTarget: number;
}

export type Lang = "en" | "zh";

export interface PromptTemplateInput {
  featureId: string;
  stage: StageCode;
  userInput?: string;
  context: ContextPack;
  lang?: Lang;
}

export interface PromptTemplate {
  stage: StageCode;
  render(input: PromptTemplateInput): string;
}

export interface PromptRegistry {
  get(stage: StageCode): PromptTemplate;
  list(): PromptTemplate[];
}

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  line?: number;
}

export interface ValidationResult {
  stage: StageCode;
  valid: boolean;
  issues: ValidationIssue[];
  summary: string;
}

export interface StageValidator {
  stage: StageCode;
  validate(content: string): ValidationResult;
}

export interface RunnerOptions {
  timeoutMs?: number;
  model?: string;
  codexProfile?: string;
  codexConfig?: string;
}

export interface RunnerExecInput {
  prompt: string;
  cwd: string;
  stage: StageCode;
  options: RunnerOptions;
}

export interface RunnerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  meta: Record<string, unknown>;
}

export interface Runner {
  name: RunnerName;
  run(input: RunnerExecInput): Promise<RunnerExecResult>;
}

export interface CliGlobalOptions {
  root?: string;
  runner?: RunnerName;
  model?: string;
  timeout?: number;
  codexProfile?: string;
  codexConfig?: string;
  lang?: Lang;
}

export interface InitCommandOptions extends CliGlobalOptions {
  featureId: string;
}

export interface RunCommandOptions extends CliGlobalOptions {
  input?: string;
  featureId?: string;
  maxStages?: number;
  noStopAtGate?: boolean;
}

export interface PromptCommandOptions extends CliGlobalOptions {
  stage: StageCode;
  render: boolean;
  input?: string;
}

export interface SliceDefinition {
  name: string;
  description: string;
  order: number;
  tasks: SliceTask[];
  checkpoint: string;
  status?: string;
  dependencies?: string[];
  testable?: boolean;
}

export interface SliceTask {
  id: string;
  description: string;
  estimated_minutes: number;
  context_budget: string;
  dependencies: string[];
}

export interface WorkTree {
  slices: SliceDefinition[];
}

export interface FileStoreLayout {
  sessionDir: string;
  stateFile: string;
  engineStateFile: string;
  artifactsDir: string;
  runsDir: string;
  slicesDir: string;
  sessionsDir: string;
  structuredDir: string;
  promptsDir: string;
}
