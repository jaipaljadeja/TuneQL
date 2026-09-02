export type ExecutionSource = 'human' | 'agent' | 'system';

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface IndexInfo {
  name: string;
  table: string;
  columns: string[];
  method: string;
  isUnique?: boolean;
  isPrimary?: boolean;
  isProtected?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  estimatedRows: number;
  indexes: IndexInfo[];
}

export interface SchemaSnapshot {
  tables: TableSchema[];
  indexes: IndexInfo[];
}

export interface PlanFinding {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  description: string;
  nodeType?: string;
  relation?: string;
}

export interface PlanNode {
  id: string;
  nodeType: string;
  relationName?: string;
  alias?: string;
  totalCost: number;
  startupCost: number;
  planRows: number;
  actualRows?: number;
  actualTotalTimeMs?: number;
  actualStartupTimeMs?: number;
  actualLoops?: number;
  filter?: string;
  rowsRemovedByFilter?: number;
  indexName?: string;
  indexCond?: string;
  hashCond?: string;
  joinType?: string;
  plans?: PlanNode[];
  raw?: Record<string, unknown>;
}

export interface NormalizedPlan {
  rootNode: PlanNode;
  totalTimeMs?: number;
  planningTimeMs?: number;
  executionTimeMs?: number;
  findings: PlanFinding[];
  rawJson: unknown;
  configurationId?: string;
}

export interface BenchmarkResult {
  runs: number[];
  warmupRuns: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  executedAt: string;
  configurationId?: string;
}

export interface ResultPreview {
  columns: string[];
  columnTypes?: string[];
  rows: Record<string, unknown>[];
  totalRowCount: number;
  isTruncated: boolean;
  durationMs: number;
  executedAt: string;
  configurationId?: string;
}

export interface ResultColumn {
  name: string;
  dataTypeId?: number;
}

export interface FullQueryResult {
  rows: Record<string, unknown>[];
  columns: ResultColumn[];
}

export interface ResultFingerprint {
  rowCount: number;
  columns: string[];
  hash?: string;
  sampleSignature?: string;
}

export interface OptimizationConstraints {
  targetRuntimeMs?: number;
  requireEquivalentResults: boolean;
  allowQueryRewrite: boolean;
  allowIndexes: boolean;
  maxNewIndexes: number;
}

export interface BenchmarkSettings {
  measuredRuns: number;
  warmupRuns: number;
  timeoutSeconds: number;
  equivalenceMode: 'relational' | 'strict';
  equivalenceRowLimit: number;
}

export const DEFAULT_BENCHMARK_SETTINGS: BenchmarkSettings = {
  measuredRuns: 5,
  warmupRuns: 1,
  timeoutSeconds: 10,
  equivalenceMode: 'relational',
  equivalenceRowLimit: 100_000,
};

export type WorkspaceKind = 'ecommerce' | 'empty' | 'sql' | 'restored';

export interface WorkspaceCatalogItem {
  id: string;
  name: string;
  kind: WorkspaceKind;
  createdAt: string;
  updatedAt: string;
}

export interface ConstraintCheckResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface ComparisonResult {
  equivalent: boolean;
  equivalenceMode: 'relational' | 'strict';
  baselineMedianMs: number;
  candidateMedianMs: number;
  speedup: number; // e.g. 5.4x
  improvementPercent: number;
  diffSummary?: string;
  constraintsPassed: boolean;
  constraintResults: ConstraintCheckResult[];
  baselineConfigurationId: string;
  candidateConfigurationId: string;
}

export interface Attempt {
  id: string;
  sequence: number;
  source: ExecutionSource;
  query: string;
  userIndexes: IndexInfo[];
  benchmark?: BenchmarkResult;
  plan?: NormalizedPlan;
  resultFingerprint?: ResultFingerprint;
  comparison?: ComparisonResult;
  createdAt: string;
  note?: string;
  configurationId: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  source: ExecutionSource;
  action: string;
  details?: string;
}

export interface WorkspaceState {
  id: string;
  name: string;
  revision: number;
  status: 'initializing' | 'ready' | 'running' | 'benchmarking' | 'error';
  errorMessage?: string;

  query: string;
  activeQueryId: string;

  schema: SchemaSnapshot;
  constraints: OptimizationConstraints;

  baseline?: Attempt;
  attempts: Attempt[];
  currentAttempt?: Attempt;

  lastResult?: ResultPreview;
  lastPlan?: NormalizedPlan;
  lastBenchmark?: BenchmarkResult;
  lastComparison?: ComparisonResult;

  activity: ActivityEvent[];
  webMcpAvailable: boolean;
  registeredToolsCount: number;
  kind: WorkspaceKind;
  setupSql?: string;
  initialQuery: string;
  baseIndexNames: string[];
  benchmarkSettings: BenchmarkSettings;
  workspaces: WorkspaceCatalogItem[];
  openWorkspaceIds: string[];
  activeWorkspaceId: string;
  catalogRevision: number;
  catalogReady: boolean;
  agentWorkspaceAdminEnabled: boolean;
}
