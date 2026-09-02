import { pgEngine } from '@/db/pglite-engine';
import { workspaceStore } from './store';
import {
  computeResultFingerprint,
  verifyResultEquivalence,
} from '@/engine/result-equivalence';
import { validateReadOnlySql } from '@/lib/sql-validator';
import {
  Attempt,
  BenchmarkResult,
  BenchmarkSettings,
  ComparisonResult,
  ConstraintCheckResult,
  ExecutionSource,
  IndexInfo,
  NormalizedPlan,
  OptimizationConstraints,
  ResultPreview,
  WorkspaceState,
} from '@/types';
import {
  INITIAL_BASELINE_SQL,
  INITIAL_CONSTRAINTS,
} from '@/db/ecommerce-fixture';

function getConfigurationId(query: string, indexes: IndexInfo[]): string {
  const normalizedIndexes = indexes
    .filter((index) => !index.isProtected)
    .map((index) => ({
      name: index.name,
      table: index.table,
      columns: index.columns,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify({ query: query.trim(), indexes: normalizedIndexes });
}

function getStateConfigurationId(state: WorkspaceState): string {
  return getConfigurationId(state.query, state.schema.indexes);
}

const clearedEvidence = {
  lastResult: undefined,
  lastPlan: undefined,
  lastBenchmark: undefined,
  lastComparison: undefined,
  currentAttempt: undefined,
};

export class WorkspaceCommands {
  /**
   * Initializes or re-initializes the PostgreSQL engine and workspace state.
   */
  static async initWorkspace(
    onProgress?: (msg: string) => void,
  ): Promise<void> {
    if (typeof window !== 'undefined') {
      return (await import('./manager')).WorkspaceManager.bootstrap(onProgress);
    }
    workspaceStore.setState({
      status: 'initializing',
      errorMessage: undefined,
    });

    try {
      await pgEngine.initialize(onProgress);
      const schema = await pgEngine.getSchema();

      workspaceStore.setState({
        status: 'ready',
        schema,
      });

      workspaceStore.logActivity(
        'system',
        'Database initialized',
        'Seeded Ecommerce demo dataset with 60k orders.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.setState({ status: 'error', errorMessage: msg });
      workspaceStore.logActivity('system', 'Initialization failed', msg);
      throw err;
    }
  }

  /**
   * Resets workspace to initial baseline state.
   */
  static async resetWorkspace(): Promise<void> {
    if (typeof window !== 'undefined') {
      return (await import('./manager')).WorkspaceManager.resetActive();
    }
    workspaceStore.setState(
      {
        status: 'initializing',
        query: INITIAL_BASELINE_SQL,
        baseline: undefined,
        attempts: [],
        lastResult: undefined,
        lastPlan: undefined,
        lastBenchmark: undefined,
        lastComparison: undefined,
        constraints: INITIAL_CONSTRAINTS,
        currentAttempt: undefined,
        activity: [],
      },
      { bumpRevision: true },
    );

    await this.initWorkspace();
    workspaceStore.logActivity(
      'human',
      'Reset workspace',
      'Restored pristine initial baseline state.',
    );
  }

  /**
   * Updates the active SQL query.
   */
  static updateQueryDraft(sql: string): { revision: number } {
    workspaceStore.setState(
      { query: sql, ...clearedEvidence },
      { bumpRevision: true },
    );
    return { revision: workspaceStore.getState().revision };
  }

  static setActiveQuery(
    sql: string,
    source: ExecutionSource = 'human',
    expectedRevision?: number,
  ): { revision: number } {
    const state = workspaceStore.getState();

    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error(
        `STALE_WORKSPACE: Expected revision ${expectedRevision}, but current revision is ${state.revision}. Please re-read workspace state.`,
      );
    }

    if (
      !state.constraints.allowQueryRewrite &&
      sql.trim() !== state.query.trim()
    ) {
      throw new Error(
        'POLICY_VIOLATION: Query rewriting is disabled by current workspace constraints.',
      );
    }

    const validation = validateReadOnlySql(sql);
    if (!validation.isValid) {
      throw new Error(`QUERY_INVALID: ${validation.error}`);
    }

    workspaceStore.setState(
      { query: sql, ...clearedEvidence },
      { bumpRevision: true },
    );
    workspaceStore.logActivity(
      source,
      'Updated SQL query',
      `${sql.slice(0, 60)}...`,
    );

    return { revision: workspaceStore.getState().revision };
  }

  /**
   * Runs the active SELECT query and previews the output.
   */
  static async runQuery(
    source: ExecutionSource = 'human',
  ): Promise<ResultPreview> {
    const state = workspaceStore.getState();
    workspaceStore.setState({ status: 'running', errorMessage: undefined });

    try {
      const configurationId = getStateConfigurationId(state);
      const result = await pgEngine.executeReadOnly(state.query);
      result.configurationId = configurationId;
      if (
        getStateConfigurationId(workspaceStore.getState()) !== configurationId
      ) {
        throw new Error(
          'STALE_RESULT: Workspace changed while the query was running. Run it again on the current state.',
        );
      }
      workspaceStore.setState({
        status: 'ready',
        lastResult: result,
      });

      workspaceStore.logActivity(
        source,
        'Executed query',
        `Returned ${result.totalRowCount.toLocaleString()} rows in ${result.durationMs} ms.`,
      );
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.setState({ status: 'error', errorMessage: msg });
      workspaceStore.logActivity(source, 'Query failed', msg);
      throw err;
    }
  }

  /**
   * Explains the query and computes plan findings.
   */
  static async explainQuery(
    mode: 'estimate' | 'analyze' = 'analyze',
    source: ExecutionSource = 'human',
    signal?: AbortSignal,
  ): Promise<NormalizedPlan> {
    const state = workspaceStore.getState();
    workspaceStore.setState({ status: 'running', errorMessage: undefined });

    try {
      const configurationId = getStateConfigurationId(state);
      const plan = await pgEngine.explainQuery(
        state.query,
        mode === 'analyze',
        signal,
      );
      plan.configurationId = configurationId;
      if (
        getStateConfigurationId(workspaceStore.getState()) !== configurationId
      ) {
        throw new Error(
          'STALE_RESULT: Workspace changed while EXPLAIN was running. Run it again on the current state.',
        );
      }
      workspaceStore.setState({
        status: 'ready',
        lastPlan: plan,
      });

      workspaceStore.logActivity(
        source,
        'Analyzed execution plan',
        `Root: ${plan.rootNode.nodeType}, time: ${plan.totalTimeMs?.toFixed(1) || '?'} ms, findings: ${plan.findings.length}.`,
      );
      return plan;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.setState({ status: 'error', errorMessage: msg });
      workspaceStore.logActivity(source, 'Explain failed', msg);
      throw err;
    }
  }

  /**
   * Runs controlled local benchmark for the active query.
   */
  static async benchmarkQuery(
    runs?: number,
    warmupRuns?: number,
    source: ExecutionSource = 'human',
    signal?: AbortSignal,
  ): Promise<BenchmarkResult> {
    const state = workspaceStore.getState();
    runs ??= state.benchmarkSettings.measuredRuns;
    warmupRuns ??= state.benchmarkSettings.warmupRuns;
    const configurationId = getStateConfigurationId(state);
    workspaceStore.setState({
      status: 'benchmarking',
      errorMessage: undefined,
    });

    try {
      const benchmark = await pgEngine.runBenchmark(
        state.query,
        runs,
        warmupRuns,
        signal,
      );
      benchmark.configurationId = configurationId;

      // Record this benchmark as an Attempt
      const userIndexes = state.schema.indexes.filter((i) => !i.isProtected);
      const plan = await pgEngine.explainQuery(state.query, true, signal);
      plan.configurationId = configurationId;
      const fullResult = await pgEngine.fetchAllResult(
        state.query,
        signal,
        state.benchmarkSettings.equivalenceRowLimit,
      );
      const fingerprint = computeResultFingerprint(fullResult);

      if (
        getStateConfigurationId(workspaceStore.getState()) !== configurationId
      ) {
        throw new Error(
          'STALE_RESULT: Workspace changed while benchmarking. Benchmark the current state again.',
        );
      }

      const attemptId = `attempt-${state.attempts.length + 1}`;
      const newAttempt: Attempt = {
        id: attemptId,
        sequence: state.attempts.length + 1,
        source,
        query: state.query,
        userIndexes,
        benchmark,
        plan,
        resultFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        configurationId,
      };

      const updatedAttempts = [newAttempt, ...state.attempts];

      workspaceStore.setState({
        status: 'ready',
        lastBenchmark: benchmark,
        lastPlan: plan,
        attempts: updatedAttempts,
        currentAttempt: newAttempt,
      });

      workspaceStore.logActivity(
        source,
        'Benchmarked query',
        `Median: ${benchmark.medianMs} ms (${benchmark.runs.length} runs, warmup ${benchmark.warmupRuns}).`,
      );

      // Automatically compute comparison if a baseline exists
      if (workspaceStore.getState().baseline) {
        await this.compareToBaseline(
          state.benchmarkSettings.equivalenceMode,
          source,
          signal,
        ).catch(() => {});
      }

      return benchmark;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.setState({ status: 'error', errorMessage: msg });
      workspaceStore.logActivity(source, 'Benchmark failed', msg);
      throw err;
    }
  }

  /**
   * Designates current query state & benchmark as the Baseline.
   */
  static async setBaseline(
    source: ExecutionSource = 'human',
    signal?: AbortSignal,
  ): Promise<Attempt> {
    let state = workspaceStore.getState();
    const configurationId = getStateConfigurationId(state);

    // Ensure we have a benchmark for the baseline
    let benchmark = state.lastBenchmark;
    if (!benchmark || benchmark.configurationId !== configurationId) {
      benchmark = await this.benchmarkQuery(
        undefined,
        undefined,
        source,
        signal,
      );
      state = workspaceStore.getState();
    }

    const plan =
      state.lastPlan?.configurationId === configurationId
        ? state.lastPlan
        : await pgEngine.explainQuery(state.query, true, signal);
    plan.configurationId = configurationId;
    const fullResult = await pgEngine.fetchAllResult(
      state.query,
      signal,
      state.benchmarkSettings.equivalenceRowLimit,
    );
    const fingerprint = computeResultFingerprint(fullResult);
    const userIndexes = state.schema.indexes.filter((i) => !i.isProtected);

    if (
      getStateConfigurationId(workspaceStore.getState()) !== configurationId
    ) {
      throw new Error(
        'STALE_RESULT: Workspace changed while setting the baseline. Try again on the current state.',
      );
    }

    const baselineAttempt: Attempt = {
      id: `baseline-${Date.now()}`,
      sequence: 0,
      source,
      query: state.query,
      userIndexes,
      benchmark,
      plan,
      resultFingerprint: fingerprint,
      createdAt: new Date().toISOString(),
      note: 'Primary Optimization Baseline',
      configurationId,
    };

    workspaceStore.setState(
      {
        baseline: baselineAttempt,
        lastPlan: plan,
        lastBenchmark: benchmark,
        lastComparison: undefined,
      },
      { bumpRevision: true },
    );

    workspaceStore.logActivity(
      source,
      'Set baseline',
      `Median runtime: ${benchmark.medianMs} ms (${fullResult.rows.length.toLocaleString()} rows).`,
    );

    return baselineAttempt;
  }

  /**
   * Compares active candidate query against baseline for speedup and result equivalence.
   */
  static async compareToBaseline(
    mode?: 'relational' | 'strict',
    source: ExecutionSource = 'human',
    signal?: AbortSignal,
  ): Promise<ComparisonResult> {
    let state = workspaceStore.getState();
    mode ??= state.benchmarkSettings.equivalenceMode;
    if (!state.baseline) {
      throw new Error(
        'BASELINE_REQUIRED: Please establish a baseline before comparing candidates.',
      );
    }
    const baseline = state.baseline;

    // Ensure candidate benchmark exists
    const candidateConfigurationId = getStateConfigurationId(state);
    let candidateBenchmark = state.lastBenchmark;
    if (
      !candidateBenchmark ||
      candidateBenchmark.configurationId !== candidateConfigurationId
    ) {
      candidateBenchmark = await this.benchmarkQuery(
        undefined,
        undefined,
        source,
        signal,
      );
      state = workspaceStore.getState();
      if (state.baseline?.id !== baseline.id) {
        throw new Error(
          'STALE_RESULT: Baseline changed while benchmarking. Compare again.',
        );
      }
    }

    // Fetch full results for equivalence check
    const baselineResult = await pgEngine.fetchAllResult(
      baseline.query,
      signal,
      state.benchmarkSettings.equivalenceRowLimit,
    );
    const candidateResult = await pgEngine.fetchAllResult(
      state.query,
      signal,
      state.benchmarkSettings.equivalenceRowLimit,
    );

    if (
      getStateConfigurationId(workspaceStore.getState()) !==
      candidateConfigurationId
    ) {
      throw new Error(
        'STALE_RESULT: Workspace changed while comparing. Compare the current state again.',
      );
    }

    const eqCheck = verifyResultEquivalence(
      baselineResult,
      candidateResult,
      mode,
    );

    const baselineMedian = baseline.benchmark?.medianMs;
    if (baselineMedian === undefined)
      throw new Error(
        'BASELINE_INVALID: Baseline benchmark is missing. Set the baseline again.',
      );
    const candidateMedian = candidateBenchmark.medianMs;
    const speedup = Number(
      (baselineMedian / Math.max(0.1, candidateMedian)).toFixed(2),
    );
    const improvementPercent = Number(
      (((baselineMedian - candidateMedian) / baselineMedian) * 100).toFixed(1),
    );

    // Evaluate constraints
    const constraintResults: ConstraintCheckResult[] = [];
    const constraints = state.constraints;

    if (constraints.requireEquivalentResults) {
      constraintResults.push({
        name: 'Result Equivalence',
        passed: eqCheck.equivalent,
        message: eqCheck.equivalent
          ? 'Candidate returns identical dataset.'
          : eqCheck.diffSummary || 'Results differ from baseline.',
      });
    }

    if (constraints.targetRuntimeMs) {
      const passed = candidateMedian <= constraints.targetRuntimeMs;
      constraintResults.push({
        name: 'Target Runtime',
        passed,
        message: passed
          ? `Median ${candidateMedian} ms is within target ${constraints.targetRuntimeMs} ms.`
          : `Median ${candidateMedian} ms exceeds target ${constraints.targetRuntimeMs} ms.`,
      });
    }

    const userIndexes = state.schema.indexes.filter((i) => !i.isProtected);
    if (!constraints.allowIndexes && userIndexes.length > 0) {
      constraintResults.push({
        name: 'Index Constraint',
        passed: false,
        message: 'Index additions are prohibited by constraints.',
      });
    } else {
      const passed = userIndexes.length <= constraints.maxNewIndexes;
      constraintResults.push({
        name: 'Max New Indexes',
        passed,
        message: passed
          ? `${userIndexes.length} of ${constraints.maxNewIndexes} allowed new indexes used.`
          : `Exceeded index limit: ${userIndexes.length} used, max allowed is ${constraints.maxNewIndexes}.`,
      });
    }

    const allPassed = constraintResults.every((c) => c.passed);

    const comparison: ComparisonResult = {
      equivalent: eqCheck.equivalent,
      equivalenceMode: mode,
      baselineMedianMs: baselineMedian,
      candidateMedianMs: candidateMedian,
      speedup,
      improvementPercent,
      diffSummary: eqCheck.diffSummary,
      constraintsPassed: allPassed,
      constraintResults,
      baselineConfigurationId: baseline.configurationId,
      candidateConfigurationId,
    };

    const currentAttemptId = state.currentAttempt?.id;
    const attempts = state.attempts.map((attempt) =>
      attempt.id === currentAttemptId &&
      attempt.configurationId === candidateConfigurationId
        ? { ...attempt, comparison }
        : attempt,
    );
    const currentAttempt =
      state.currentAttempt?.configurationId === candidateConfigurationId
        ? { ...state.currentAttempt, comparison }
        : state.currentAttempt;

    workspaceStore.setState({
      lastComparison: comparison,
      attempts,
      currentAttempt,
    });

    workspaceStore.logActivity(
      source,
      'Compared candidate to baseline',
      `Speedup: ${speedup}x (${candidateMedian} ms vs ${baselineMedian} ms). Equivalent: ${eqCheck.equivalent ? 'YES' : 'NO'}.`,
    );

    return comparison;
  }

  /**
   * Creates an index on a table and refreshes schema.
   */
  static async createIndex(
    table: string,
    columns: string[],
    name?: string,
    source: ExecutionSource = 'human',
    expectedRevision?: number,
  ): Promise<IndexInfo> {
    const state = workspaceStore.getState();

    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error(
        `STALE_WORKSPACE: Expected revision ${expectedRevision}, current revision is ${state.revision}.`,
      );
    }

    if (!state.constraints.allowIndexes) {
      throw new Error(
        'POLICY_VIOLATION: Index creation is disabled by current workspace constraints.',
      );
    }

    const currentUserIndexes = state.schema.indexes.filter(
      (i) => !i.isProtected,
    );
    if (currentUserIndexes.length >= state.constraints.maxNewIndexes) {
      throw new Error(
        `POLICY_VIOLATION: Cannot create index. Workspace limit is ${state.constraints.maxNewIndexes} new index(es).`,
      );
    }

    try {
      const indexInfo = await pgEngine.createIndex(table, columns, name);
      const updatedSchema = await pgEngine.getSchema();

      workspaceStore.setState(
        {
          schema: updatedSchema,
          ...clearedEvidence,
        },
        { bumpRevision: true },
      );

      workspaceStore.logActivity(
        source,
        'Created index',
        `Created index "${indexInfo.name}" on ${table} (${columns.join(', ')}).`,
      );

      return indexInfo;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.logActivity(source, 'Create index failed', msg);
      throw err;
    }
  }

  /**
   * Drops a user-created index.
   */
  static async dropIndex(
    name: string,
    source: ExecutionSource = 'human',
    expectedRevision?: number,
  ): Promise<void> {
    const state = workspaceStore.getState();

    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error(
        `STALE_WORKSPACE: Expected revision ${expectedRevision}, current revision is ${state.revision}.`,
      );
    }

    if (!state.constraints.allowIndexes) {
      throw new Error(
        'POLICY_VIOLATION: Index modification is disabled by current workspace constraints.',
      );
    }

    try {
      await pgEngine.dropIndex(name);
      const updatedSchema = await pgEngine.getSchema();

      workspaceStore.setState(
        {
          schema: updatedSchema,
          ...clearedEvidence,
        },
        { bumpRevision: true },
      );

      workspaceStore.logActivity(
        source,
        'Dropped index',
        `Removed index "${name}".`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      workspaceStore.logActivity(source, 'Drop index failed', msg);
      throw err;
    }
  }

  /**
   * Restores an attempt's query and index configuration.
   */
  static async restoreAttempt(
    attemptId: string,
    source: ExecutionSource = 'human',
    expectedRevision?: number,
  ): Promise<void> {
    const state = workspaceStore.getState();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error(
        `STALE_WORKSPACE: Expected revision ${expectedRevision}, current revision is ${state.revision}.`,
      );
    }
    const target =
      state.attempts.find((a) => a.id === attemptId) ||
      (state.baseline?.id === attemptId ? state.baseline : null);

    if (!target) {
      throw new Error(`Attempt with id "${attemptId}" not found.`);
    }

    await pgEngine.replaceUserIndexes(target.userIndexes);
    const updatedSchema = await pgEngine.getSchema();
    workspaceStore.setState(
      {
        query: target.query,
        schema: updatedSchema,
        lastBenchmark: target.benchmark,
        lastPlan: target.plan,
        lastComparison: target.comparison,
        lastResult: undefined,
        currentAttempt: target.sequence > 0 ? target : undefined,
      },
      { bumpRevision: true },
    );

    workspaceStore.logActivity(
      source,
      'Restored attempt',
      `Restored attempt #${target.sequence} (Query & ${target.userIndexes.length} index(es)).`,
    );
  }

  /**
   * Updates optimization constraints.
   */
  static updateConstraints(
    constraints: Partial<OptimizationConstraints>,
  ): void {
    const state = workspaceStore.getState();
    const updated = { ...state.constraints, ...constraints };
    workspaceStore.setState(
      { constraints: updated, lastComparison: undefined },
      { bumpRevision: true },
    );
    workspaceStore.logActivity(
      'human',
      'Updated constraints',
      `Max indexes: ${updated.maxNewIndexes}, Target: ${updated.targetRuntimeMs || 'none'} ms.`,
    );
  }

  static updateBenchmarkSettings(settings: Partial<BenchmarkSettings>): void {
    const state = workspaceStore.getState();
    const next = { ...state.benchmarkSettings, ...settings };
    if (next.measuredRuns < 3 || next.measuredRuns > 20)
      throw new Error('Measured runs must be between 3 and 20.');
    if (next.warmupRuns < 0 || next.warmupRuns > 5)
      throw new Error('Warm-ups must be between 0 and 5.');
    if (next.timeoutSeconds < 1 || next.timeoutSeconds > 60)
      throw new Error('Timeout must be between 1 and 60 seconds.');
    if (next.equivalenceRowLimit < 1 || next.equivalenceRowLimit > 100_000)
      throw new Error('Equivalence limit must be between 1 and 100,000 rows.');
    pgEngine.setTimeoutSeconds(next.timeoutSeconds);
    workspaceStore.setState(
      {
        benchmarkSettings: next,
        lastBenchmark: undefined,
        lastComparison: undefined,
      },
      { bumpRevision: true },
    );
    workspaceStore.logActivity(
      'human',
      'Updated benchmark settings',
      `${next.measuredRuns} measured runs, ${next.warmupRuns} warm-ups.`,
    );
  }

  /**
   * Retrieves summary for WebMCP agents.
   */
  static getWorkspaceSummary() {
    const state = workspaceStore.getState();
    return {
      workspaceId: state.id,
      workspaceRevision: state.revision,
      workspaceName: state.name,
      catalogRevision: state.catalogRevision,
      databaseReady:
        state.status !== 'initializing' && state.status !== 'error',
      activeQueryId: state.activeQueryId,
      hasBaseline: !!state.baseline,
      baselineMedianMs: state.baseline?.benchmark?.medianMs,
      baselineId: state.baseline?.id,
      attemptCount: state.attempts.length,
      userIndexesCount: state.schema.indexes.filter((i) => !i.isProtected)
        .length,
      constraints: state.constraints,
      benchmarkSettings: state.benchmarkSettings,
    };
  }
}
