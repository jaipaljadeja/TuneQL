import { z } from 'zod';
import { buildOptimizationReport } from './report';
import { workspaceStore } from './store';
import { pgEngine } from '@/db/pglite-engine';
import { WorkspaceManager } from './manager';

const archiveSchema = z.object({
  format: z.literal('tuneql-workspace'),
  version: z.literal(1),
  workspace: z.object({
    name: z.string().min(1),
    query: z.string(),
    initialQuery: z.string(),
    constraints: z.object({
      targetRuntimeMs: z.number().positive().optional(),
      requireEquivalentResults: z.boolean(),
      allowQueryRewrite: z.boolean(),
      allowIndexes: z.boolean(),
      maxNewIndexes: z.number().int().min(0),
    }),
    benchmarkSettings: z.object({
      measuredRuns: z.number().int().min(3).max(20),
      warmupRuns: z.number().int().min(0).max(5),
      timeoutSeconds: z.number().min(1).max(60),
      equivalenceMode: z.enum(['relational', 'strict']),
      equivalenceRowLimit: z.number().int().min(1).max(100_000),
    }),
    baseline: z.unknown().optional(),
    attempts: z.array(z.unknown()).optional(),
  }),
});

function runArchiveWorker<T>(
  message: Record<string, unknown>,
  transfer: Transferable[] = [],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./archive.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tuneql-archive',
    });
    const id = crypto.randomUUID();
    worker.onmessage = (event) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data as T);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({ ...message, id }, transfer);
  });
}

export function workspaceMetadataJson() {
  const state = workspaceStore.getState();
  return JSON.stringify(
    {
      format: 'tuneql-workspace',
      version: 1,
      workspace: {
        name: state.name,
        query: state.query,
        initialQuery: state.initialQuery,
        constraints: state.constraints,
        benchmarkSettings: state.benchmarkSettings,
        baseline: state.baseline,
        attempts: state.attempts,
      },
    },
    null,
    2,
  );
}

export async function exportActiveWorkspace(): Promise<Blob> {
  const state = workspaceStore.getState();
  if (state.status === 'running' || state.status === 'benchmarking')
    throw new Error(
      'WORKSPACE_BUSY: Wait for the current operation to finish.',
    );
  await WorkspaceManager.flush();
  workspaceStore.setState({ status: 'initializing' });
  await pgEngine.close();
  try {
    const result = await runArchiveWorker<{ archive: ArrayBuffer }>({
      action: 'export',
      dataDir: `idb://tuneql-${state.id}`,
      metadata: workspaceMetadataJson(),
      report: buildOptimizationReport(state),
    });
    return new Blob([result.archive], { type: 'application/zip' });
  } finally {
    await pgEngine.openWorkspace(state.id);
    pgEngine.setProtectedIndexes(state.baseIndexNames);
    pgEngine.setTimeoutSeconds(state.benchmarkSettings.timeoutSeconds);
    workspaceStore.setState({
      status: 'ready',
      schema: await pgEngine.getSchema(),
    });
  }
}

export async function restoreWorkspaceArchive(file: File) {
  const buffer = await file.arrayBuffer();
  const result = await runArchiveWorker<{
    databaseSql: string;
    metadata: string;
  }>({ action: 'restore', archive: buffer }, [buffer]);
  const parsed = archiveSchema.parse(JSON.parse(result.metadata));
  const created = await WorkspaceManager.createWorkspace({
    name: `${parsed.workspace.name} (restored)`,
    kind: 'sql',
    setupSql: result.databaseSql,
    initialQuery: parsed.workspace.initialQuery,
  });
  const current = workspaceStore.getState();
  const workspaces = current.workspaces.map((item) =>
    item.id === current.id ? { ...item, kind: 'restored' as const } : item,
  );
  workspaceStore.setState(
    {
      kind: 'restored',
      workspaces,
      catalogRevision: current.catalogRevision + 1,
      query: parsed.workspace.query,
      constraints: { ...current.constraints, ...parsed.workspace.constraints },
      benchmarkSettings: {
        ...current.benchmarkSettings,
        ...parsed.workspace.benchmarkSettings,
      },
      baseline: parsed.workspace.baseline as typeof current.baseline,
      attempts: (parsed.workspace.attempts ?? []) as typeof current.attempts,
    },
    { bumpRevision: true },
  );
  await WorkspaceManager.flush();
  return created;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
