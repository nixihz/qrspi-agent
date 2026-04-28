export type StageCode = "Q" | "R" | "D" | "S" | "P" | "W" | "I" | "PR";

export type GateStageCode = "D" | "S" | "PR";

export type StageKind = "alignment" | "execution";

export type RunnerName = "claude" | "codex" | "mock";

export type OutputFormat = "text" | "json";

export type CliOutputFormat = OutputFormat;

export type GateDecision = "approved" | "rejected";

export type ReviewInputSource = "inline" | "file" | "none";

export type ModelTier = "low" | "standard" | "powerful";

export type SessionStatus =
  | "idle"
  | "ready"
  | "running"
  | "failed"
  | "blocked"
  | "needs_context"
  | "waiting_approval"
  | "completed";

export type ImplementationStatus =
  | "DONE"
  | "DONE_WITH_CONCERNS"
  | "BLOCKED"
  | "NEEDS_CONTEXT";

export type ValidationSeverity = "error" | "warning" | "info";

export interface CliResponseEnvelope<TData = unknown> {
  schema_version: "1";
  ok: boolean;
  command: string;
  feature_id?: string;
  timestamp: string;
  data?: TData;
  error?: CliErrorEnvelope;
}

export interface CliErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FeatureRef {
  feature_id: string;
  project_root: string;
  output_dir: string;
}

export interface NextActionSummary {
  kind: string;
  message: string;
}

export interface WorkflowStatusSummary {
  feature_id: string;
  current_stage: StageCode;
  engine_status: SessionStatus;
  waiting_for_gate: boolean;
  current_gate?: GateStageCode;
  last_error?: string;
  updated_at?: string;
}

export interface StageSummary {
  code: StageCode;
  name: string;
  description: string;
  is_gate: boolean;
  status: SessionStatus;
  attempts: number;
}

export interface ArtifactPointer {
  stage: StageCode;
  kind: "markdown" | "structured" | "run_parsed";
  path: string;
  exists: boolean;
  updated_at?: string;
}

export interface ValidationSummary {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GateReviewItem {
  id: string;
  label: string;
  status: "confirmed" | "pending" | "unknown";
  source: "structured" | "markdown" | "derived";
  text: string;
}

export interface CurrentGateContext {
  stage: GateStageCode;
  markdown_artifact: ArtifactPointer;
  structured_artifact?: ArtifactPointer;
  review_items: GateReviewItem[];
  validation?: ValidationSummary;
}

export interface ApprovalRecord {
  stage: GateStageCode;
  approved_at: string;
  approved_by?: string;
  comment?: string;
}

export interface GateReviewRecord {
  id: string;
  feature_id: string;
  stage: GateStageCode;
  decision: GateDecision;
  reviewed_at: string;
  reviewed_by?: string;
  note?: string;
  feedback?: string;
  input_source: ReviewInputSource;
  artifact: ArtifactPointer;
  structured_artifact?: ArtifactPointer;
  review_path?: string;
  source_file?: string;
}

export interface FeatureListItem {
  feature_id: string;
  current_stage: StageCode;
  status: SessionStatus;
}

export interface StatusCommandData {
  workflow: WorkflowStatusSummary;
  stages: StageSummary[];
  approvals: ApprovalRecord[];
  latest_gate_review?: GateReviewRecord;
  current_gate_context?: CurrentGateContext;
  artifacts: ArtifactPointer[];
  next_action: NextActionSummary;
}

export interface StageCommandData {
  stage: StageSummary;
  workflow: WorkflowStatusSummary;
  next_action: NextActionSummary;
  artifacts: ArtifactPointer[];
}

export interface ListCommandData {
  features: FeatureListItem[];
}

export interface ContextCommandData {
  current_stage: StageCode;
  dependencies: ArtifactPointer[];
  context_budget: {
    target_max_percent: number;
    switch_threshold_percent: number;
  };
}

export interface StageRunSummary {
  stage: StageCode;
  attempt: number;
  validation: ValidationSummary;
  artifact: ArtifactPointer;
  structured_artifact?: ArtifactPointer;
  runner_output?: {
    stdout_file: string;
    stderr_file: string;
    stdout?: string;
    stderr?: string;
  };
}

export interface RunCommandData {
  workflow: WorkflowStatusSummary;
  executed_stages: StageRunSummary[];
  stopped_at_gate?: GateStageCode;
  next_action: NextActionSummary;
}

export interface GateDecisionCommandData {
  workflow: WorkflowStatusSummary;
  review_record: GateReviewRecord;
}

export interface GateDecisionInput {
  stage?: GateStageCode;
  reviewer?: string;
  note?: string;
  noteFile?: string;
  feedback?: string;
  feedbackFile?: string;
  comment?: string;
}

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
  gate_reviews: GateReviewRecord[];
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
  output?: CliOutputFormat;
  json?: boolean;
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
  includeRunnerOutput?: boolean;
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
  reviewer?: string;
  feedbackFile?: string;
  noteFile?: string;
}

export interface ApproveCommandOptions extends FeatureScopedCommandOptions {
  comment?: string;
  reviewer?: string;
  noteFile?: string;
  feedbackFile?: string;
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
  model_tier?: ModelTier;
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
  gateReviewsDir: string;
}
