import { describe, it, expect, beforeAll } from 'vitest';
import { WorkspaceCommands } from '../src/workspace/commands';
import { workspaceStore } from '../src/workspace/store';

describe('WebMCP & Workspace Commands Integration', () => {
  beforeAll(async () => {
    await WorkspaceCommands.initWorkspace();
  });

  it('provides a valid workspace summary', () => {
    const summary = WorkspaceCommands.getWorkspaceSummary();
    expect(summary.databaseReady).toBe(true);
    expect(summary.workspaceName).toBe('Ecommerce Analytics & Orders');
    expect(summary.workspaceRevision).toBeGreaterThan(0);
    expect(summary.constraints.requireEquivalentResults).toBe(true);
  });

  it('runs query and returns valid preview data', async () => {
    const res = await WorkspaceCommands.runQuery('human');
    expect(res.totalRowCount).toBe(5);
    expect(res.columns).toContain('region');
    expect(res.columns).toContain('total_revenue');
  });

  it('runs EXPLAIN ANALYZE and detects sequential scan finding', async () => {
    const plan = await WorkspaceCommands.explainQuery('analyze', 'human');
    expect(plan.rootNode).toBeDefined();
    expect(plan.findings.length).toBeGreaterThan(0);
  });

  it('establishes baseline with benchmark metrics', async () => {
    const baseline = await WorkspaceCommands.setBaseline('human');
    expect(baseline.id).toBeDefined();
    expect(baseline.benchmark?.medianMs).toBeGreaterThan(0);
  });

  it('creates candidate index and checks constraint enforcement', async () => {
    const idx = await WorkspaceCommands.createIndex(
      'orders',
      ['status', 'created_at'],
      'idx_test_orders',
      'agent',
    );
    expect(idx.name).toBe('idx_test_orders');

    // Attempting to create a second index when maxNewIndexes = 1 should fail
    await expect(
      WorkspaceCommands.createIndex(
        'orders',
        ['total_amount'],
        'idx_test_extra',
        'agent',
      ),
    ).rejects.toThrow('POLICY_VIOLATION');
  });

  it('benchmarks candidate and compares with baseline', async () => {
    const bench = await WorkspaceCommands.benchmarkQuery(3, 1, 'agent');
    expect(bench.runs.length).toBe(3);

    const comp = await WorkspaceCommands.compareToBaseline(
      'relational',
      'agent',
    );
    expect(comp.equivalent).toBe(true);
    expect(comp.speedup).toBeGreaterThan(0);
    expect(comp.constraintsPassed).toBe(true);
  });

  it('restores baseline state', async () => {
    const state = workspaceStore.getState();
    const baselineId = state.baseline!.id;

    await WorkspaceCommands.restoreAttempt(baselineId, 'agent');

    const restoredSchema = workspaceStore.getState().schema;
    const userIndexes = restoredSchema.indexes.filter((i) => !i.isProtected);
    expect(userIndexes.length).toBe(0); // candidate index removed on baseline restore
  });
});
