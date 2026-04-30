export type StageCode = "Q" | "R" | "D" | "S" | "P" | "W" | "I" | "PR";

export type GateStageCode = "D" | "S" | "PR";

export type StageKind = "alignment" | "execution";

export type RunnerName = "claude" | "codex" | "mock";

export type OutputFormat = "text" | "json";

export type CliOutputFormat = OutputFormat;

export type GateDecision = "approved" | "rejected";

export type ReviewInputSource = "inline" | "file" | "none";

export type WorkflowInputSource = "inline" | "file" | "none";

export type WorkflowInputFileKind = "markdown" | "text";

export type WorkflowInputErrorCode =
  | "INPUT_CONFLICT"
  | "INPUT_FILE_NOT_FOUND"
  | "INPUT_FILE_IS_DIRECTORY"
  | "INPUT_FILE_UNSUPPORTED_TYPE"
  | "INPUT_FILE_UNREADABLE";

export type ModelTier = "low" | "standard" | "powerful";

export type ModelResolutionSource =
  | "cli"
  | "runner_tier_env"
  | "tier_env"
  | "runner_env"
  | "global_env"
  | "tier_default"
  | "runner_default";

export interface ModelResolution {
  runner: RunnerName;
  model: string;
  source: ModelResolutionSource;
  model_tier?: ModelTier;
  env_var?: string;
}

export type SliceExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "needs_context";

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
  slices?: SliceExecutionRecord[];
  next_action: NextActionSummary;
}

export interface SliceStatusCommandData {
  current_slice_order?: number;
  slices: SliceExecutionRecord[];
}

export interface SliceRetryCommandData {
  target_slice_order: number;
  triggered: boolean;
  current_slice_order?: number;
  retried_slice: SliceExecutionRecord;
  slices: SliceExecutionRecord[];
  workflow?: WorkflowStatusSummary;
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
  dependencies: Array<ArtifactPointer | ContextCommandDependencyData>;
  context_budget: ContextCommandBudgetData | {
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
  slices?: SliceExecutionRecord[];
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
  workflow_input?: WorkflowInputJson;
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
  contextBudgetStatus?: ContextBudgetStatus;
  contextBudgetWarnings?: number;
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
  lastContextError?: ContextOverBudgetError;
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
  workflow_input?: WorkflowInputMetadata;
}

export type ContextBudgetMode = "layered" | "full";

export type ContextBudgetUnit = "character" | "line";

export type ContextLayer = "full" | "focused" | "summary" | "pointer";

export type ContextBudgetStatus = "within_target" | "over_target" | "over_threshold";

export type ContextWarningSeverity = "info" | "warning" | "error";

export interface ContextBudgetConfig {
  mode: ContextBudgetMode;
  unit: ContextBudgetUnit;
  targetUtilization: number;
  switchThresholdUtilization: number;
  maxContextSize: number;
  includeBudgetNoteInPrompt: boolean;
}

export interface ContextSizeEstimate {
  characters: number;
  lines: number;
  estimatedTokens?: number;
}

export interface ContextBudgetLimit {
  targetSize: number;
  switchThresholdSize: number;
  maxContextSize: number;
  targetPercent: number;
  switchThresholdPercent: number;
}

export interface ContextBudgetWarning {
  code:
    | "context_over_target"
    | "context_over_threshold"
    | "dependency_missing"
    | "structured_artifact_missing"
    | "structured_artifact_stale"
    | "content_truncated";
  severity: ContextWarningSeverity;
  message: string;
  stage?: StageCode;
  artifactPath?: string;
}

export interface ContextPointer {
  stage: StageCode;
  artifactPath: string;
  structuredPath?: string;
  sectionTitle?: string;
  reason: string;
}

export interface ContextSection {
  id: string;
  title: string;
  content: string;
  estimate: ContextSizeEstimate;
  source: ContextPointer;
  priority: number;
  required: boolean;
}

export interface FocusedContextData {
  decisions?: string[];
  constraints?: string[];
  risks?: string[];
  evidence?: string[];
  files?: string[];
  interfaces?: string[];
  functions?: string[];
  slices?: string[];
  tests?: string[];
  changes?: string[];
  rollback?: string[];
}

export interface ContextSourceArtifact {
  stage: StageCode;
  artifactPath: string;
  structuredPath?: string;
  rawContent: string;
  structuredData?: unknown;
  estimate: ContextSizeEstimate;
  missing: boolean;
  warnings: ContextBudgetWarning[];
}

export interface StageLayerRule {
  stage: StageCode;
  layer: ContextLayer;
  required: boolean;
  priority: number;
  focusedFields?: Array<keyof FocusedContextData>;
  maxSize?: number;
}

export interface StageContextProfile {
  currentStage: StageCode;
  rules: StageLayerRule[];
}

export interface DependencyContextPlan {
  dependency: ContextDependency;
  layer: ContextLayer;
  required: boolean;
  priority: number;
  focusedFields: Array<keyof FocusedContextData>;
}

export interface IncludedContextDependency extends ContextArtifactSummary {
  layer: ContextLayer;
  required: boolean;
  priority: number;
  includedContent: string;
  originalEstimate: ContextSizeEstimate;
  includedEstimate: ContextSizeEstimate;
  pointer: ContextPointer;
  sections: ContextSection[];
}

export interface ContextTruncationDecision {
  id: string;
  stage: StageCode;
  artifactPath: string;
  sectionTitle?: string;
  fromLayer: ContextLayer;
  toLayer: ContextLayer;
  reason:
    | "budget_target"
    | "budget_threshold"
    | "lower_priority"
    | "optional_summary"
    | "old_stage"
    | "large_section"
    | "focused_fallback";
  before: ContextSizeEstimate;
  after: ContextSizeEstimate;
  pointer: ContextPointer;
}

export interface ContextBudgetAudit {
  status: ContextBudgetStatus;
  config: ContextBudgetConfig;
  limits: ContextBudgetLimit;
  promptEstimate: ContextSizeEstimate;
  contextEstimate: ContextSizeEstimate;
  dependencies: IncludedContextDependency[];
  truncationDecisions: ContextTruncationDecision[];
  warnings: ContextBudgetWarning[];
}

export interface BudgetedContextPack extends ContextPack {
  dependencies: IncludedContextDependency[];
  budget: ContextBudgetAudit;
}

export interface ContextBuildOptions {
  maxLinesPerArtifact?: number;
  budgetConfig?: Partial<ContextBudgetConfig>;
  workflowInput?: WorkflowInputMetadata;
}

export interface PromptRenderBudgetResult {
  prompt: string;
  contextPack: BudgetedContextPack;
  budget: ContextBudgetAudit;
}

export interface ContextCommandBudgetData {
  target_max_percent: number;
  switch_threshold_percent: number;
  mode: ContextBudgetMode;
  unit: ContextBudgetUnit;
  max_context_size: number;
  target_size: number;
  switch_threshold_size: number;
  prompt_estimate: ContextSizeEstimate;
  context_estimate: ContextSizeEstimate;
  status: ContextBudgetStatus;
  warnings: ContextBudgetWarning[];
  truncation_decisions: ContextTruncationDecision[];
}

export interface ContextCommandDependencyData {
  stage: StageCode;
  required: boolean;
  layer: ContextLayer;
  artifact_path?: string;
  structured_path?: string;
  original_estimate: ContextSizeEstimate;
  included_estimate: ContextSizeEstimate;
  truncated: boolean;
  pointer?: ContextPointer;
}

export interface ContextOverBudgetError {
  code: "context_over_budget";
  stage: StageCode;
  status: ContextBudgetStatus;
  message: string;
  budget: ContextBudgetAudit;
}

export interface RunnerContextBudgetMeta {
  status: ContextBudgetStatus;
  promptEstimate: ContextSizeEstimate;
  contextEstimate: ContextSizeEstimate;
  warningCount: number;
  truncationCount: number;
}

export type Lang = "en" | "zh";

export interface WorkflowInputMetadata {
  input_source: WorkflowInputSource;
  source_file?: string;
  file_kind?: WorkflowInputFileKind;
}

export interface ResolvedWorkflowInput extends WorkflowInputMetadata {
  content?: string;
  resolved_path?: string;
}

export interface WorkflowInputRequest {
  inline?: string;
  file?: string;
  projectRoot: string;
}

export interface WorkflowInputJson extends WorkflowInputMetadata {
  source_file?: string;
}

export interface WorkflowInputFileValidation {
  path: string;
  resolved_path: string;
  file_kind: WorkflowInputFileKind;
}

export interface PromptTemplateInput {
  featureId: string;
  stage: StageCode;
  userInput?: string;
  workflowInput?: WorkflowInputMetadata;
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
  modelTier?: ModelTier;
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
  contextMode?: ContextBudgetMode;
}

export interface InitCommandOptions extends CliGlobalOptions {
  featureId: string;
}

export interface RunCommandOptions extends FeatureScopedCommandOptions {
  input?: string;
  inputFile?: string;
  maxStages?: number;
  noStopAtGate?: boolean;
  includeRunnerOutput?: boolean;
  contextMode?: ContextBudgetMode;
}

export interface RunWorkflowOptions extends RunCommandOptions {
  workflowInput?: ResolvedWorkflowInput;
}

export interface PromptCommandOptions extends FeatureScopedCommandOptions {
  stage: StageCode;
  input?: string;
  inputFile?: string;
  contextMode?: ContextBudgetMode;
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

export interface SliceStatusCommandOptions extends FeatureScopedCommandOptions {
}

export interface SliceRetryCommandOptions extends FeatureScopedCommandOptions {
  slice: number;
  trigger?: boolean;
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

export interface SliceExecutionRecord {
  slice_name: string;
  slice_order: number;
  status: SliceExecutionStatus;
  attempts: number;
  model_tier: ModelTier;
  runner?: RunnerName;
  model?: string;
  model_resolution?: ModelResolution;
  run_dir?: string;
  started_at?: string;
  finished_at?: string;
  validation?: ValidationResult;
  reported_status?: ImplementationStatus;
  last_error?: string;
}

export interface SliceExecutionState {
  featureId: string;
  current_slice_order?: number;
  slices: SliceExecutionRecord[];
  updatedAt: string;
}

export interface SliceStatusTextOptions {
  featureId: string;
  currentSliceOrder?: number;
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
