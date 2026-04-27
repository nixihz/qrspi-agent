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

export interface ProjectConfig {
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
  model?: string;
  codexProfile?: string;
  codexConfig?: string;
  liveStdoutPath?: string;
  liveStderrPath?: string;
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
  feature?: string;
  featureId?: string;
  runner?: RunnerName;
  model?: string;
  codexProfile?: string;
  codexConfig?: string;
  lang?: Lang;
}

export interface FeatureScopedCommandOptions extends CliGlobalOptions {
  featureId?: string;
}

export interface InitCommandOptions extends CliGlobalOptions {
  featureId: string;
}

export interface RunCommandOptions extends FeatureScopedCommandOptions {
  input?: string;
  maxStages?: number;
  noStopAtGate?: boolean;
}

export interface PromptCommandOptions extends FeatureScopedCommandOptions {
  stage: StageCode;
  input?: string;
}

export interface PromptExportCommandOptions extends CliGlobalOptions {
  out?: string;
  split?: boolean;
}

export interface RejectCommandOptions extends FeatureScopedCommandOptions {
  comment?: string;
}

export interface RewindCommandOptions extends FeatureScopedCommandOptions {
  reason?: string;
}

export interface AdvanceCommandOptions extends FeatureScopedCommandOptions {
  force?: boolean;
}

export interface SliceAddCommandOptions extends FeatureScopedCommandOptions {
  desc?: string;
  order?: number;
  checkpoint?: string;
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
