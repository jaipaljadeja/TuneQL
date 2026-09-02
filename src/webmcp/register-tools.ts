import { z } from 'zod';
import { WorkspaceCommands } from '@/workspace/commands';
import { workspaceStore } from '@/workspace/store';
import { WorkspaceManager } from '@/workspace/manager';
import { buildOptimizationReport } from '@/workspace/report';

declare global {
  interface ModelContextToolExecuteOptions {
    signal?: AbortSignal;
  }

  interface ModelContext {
    registerTool(
      tool: {
        name: string;
        title?: string;
        description: string;
        inputSchema?: Record<string, unknown>;
        annotations?: {
          readOnlyHint?: boolean;
          untrustedContentHint?: boolean;
        };
        execute: (
          args: unknown,
          options: ModelContextToolExecuteOptions,
        ) => Promise<unknown> | unknown;
      },
      options?: { signal?: AbortSignal; exposedTo?: string[] },
    ): Promise<void>;
    getTools?(): Promise<unknown[]>;
  }

  interface Document {
    modelContext?: ModelContext;
  }
}

export function isWebMcpSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.modelContext?.registerTool === 'function'
  );
}

export interface WebMcpRegistration {
  success: boolean;
  registeredCount: number;
  cleanup: () => void;
}

const READ_ONLY_TOOLS = new Set([
  'get_workspace_summary',
  'get_schema',
  'get_indexes',
  'get_active_query',
  'get_constraints',
  'list_attempts',
  'list_workspaces',
  'get_optimization_report',
]);

function workspaceContext() {
  const state = workspaceStore.getState();
  return {
    workspaceId: state.id,
    workspaceName: state.name,
    workspaceRevision: state.revision,
    catalogRevision: state.catalogRevision,
  };
}

function requireAdministration() {
  if (!workspaceStore.getState().agentWorkspaceAdminEnabled) {
    throw new Error(
      'POLICY_VIOLATION: Agent workspace administration is disabled by the human.',
    );
  }
}

function requireActiveWorkspace(
  expectedWorkspaceId: string,
  expectedRevision: number,
) {
  const state = workspaceStore.getState();
  if (state.id !== expectedWorkspaceId)
    throw new Error(
      `STALE_WORKSPACE: Expected active workspace ${expectedWorkspaceId}, but ${state.id} is active.`,
    );
  if (state.revision !== expectedRevision)
    throw new Error(
      `STALE_WORKSPACE: Expected revision ${expectedRevision}, but current revision is ${state.revision}.`,
    );
}

function errorCode(message: string): string {
  return message.match(/^([A-Z][A-Z_]+):/)?.[1] ?? 'EXECUTION_FAILED';
}

export async function registerWebMcpTools(): Promise<WebMcpRegistration> {
  if (!isWebMcpSupported()) {
    workspaceStore.setState({
      webMcpAvailable: false,
      registeredToolsCount: 0,
    });
    return { success: false, registeredCount: 0, cleanup: () => {} };
  }

  const modelContext = document.modelContext!;
  const registrationController = new AbortController();
  const registrationPromises: Promise<void>[] = [];
  let count = 0;

  function register<T>(
    name: string,
    description: string,
    schema: z.ZodType<T>,
    jsonSchema: Record<string, unknown>,
    handler: (validatedArgs: T, signal: AbortSignal) => Promise<unknown>,
  ) {
    const registration = modelContext
      .registerTool(
        {
          name,
          title: name
            .split('_')
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join(' '),
          description,
          inputSchema: { ...jsonSchema, additionalProperties: false },
          annotations: {
            readOnlyHint: READ_ONLY_TOOLS.has(name),
            untrustedContentHint:
              name === 'get_active_query' ||
              name === 'get_schema' ||
              name === 'compare_to_baseline',
          },
          execute: async (
            rawArgs: unknown,
            options?: ModelContextToolExecuteOptions,
          ) => {
            try {
              const parsed = schema.safeParse(rawArgs || {});
              if (!parsed.success) {
                return {
                  error: 'INVALID_ARGUMENTS',
                  message: parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join(', '),
                };
              }
              const signal = options?.signal ?? registrationController.signal;
              signal.throwIfAborted();
              const res = await handler(parsed.data, signal);
              signal.throwIfAborted();
              return res && typeof res === 'object' && !Array.isArray(res)
                ? { ...res, ...workspaceContext() }
                : { result: res, ...workspaceContext() };
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                error: errorCode(msg),
                message: msg,
              };
            }
          },
        },
        { signal: registrationController.signal },
      )
      .then(() => {
        count++;
      });
    registrationPromises.push(registration);
  }

  register(
    'get_workspace_summary',
    'Returns a high-level summary of the current optimization workspace, revision number, active baseline, and constraints.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => WorkspaceCommands.getWorkspaceSummary(),
  );

  register(
    'list_workspaces',
    'Lists saved browser-local workspaces, open tabs, the active workspace, and catalog revision.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => {
      const state = workspaceStore.getState();
      return {
        workspaces: state.workspaces.map((workspace) => ({
          ...workspace,
          isOpen: state.openWorkspaceIds.includes(workspace.id),
          isActive: workspace.id === state.activeWorkspaceId,
        })),
      };
    },
  );

  register(
    'open_workspace',
    'Visibly switches TuneQL to a saved workspace. Requires human-enabled agent workspace administration.',
    z.object({
      workspaceId: z.string().min(1),
      expectedCatalogRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['workspaceId', 'expectedCatalogRevision'],
      properties: {
        workspaceId: { type: 'string' },
        expectedCatalogRevision: { type: 'integer' },
      },
    },
    async (args: { workspaceId: string; expectedCatalogRevision: number }) => {
      requireAdministration();
      await WorkspaceManager.switchWorkspace(
        args.workspaceId,
        args.expectedCatalogRevision,
        'agent',
      );
      return { success: true };
    },
  );

  register(
    'create_workspace',
    'Creates and visibly opens an Ecommerce, empty, or SQL-backed workspace. Setup SQL is limited to 1 MB and isolated from the current workspace.',
    z.object({
      name: z.string().min(1).max(80),
      kind: z.enum(['ecommerce', 'empty', 'sql']),
      setupSql: z.string().optional(),
      expectedCatalogRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['name', 'kind', 'expectedCatalogRevision'],
      properties: {
        name: { type: 'string' },
        kind: { type: 'string', enum: ['ecommerce', 'empty', 'sql'] },
        setupSql: { type: 'string' },
        expectedCatalogRevision: { type: 'integer' },
      },
    },
    async (args: {
      name: string;
      kind: 'ecommerce' | 'empty' | 'sql';
      setupSql?: string;
      expectedCatalogRevision: number;
    }) => {
      requireAdministration();
      if (new Blob([args.setupSql ?? '']).size > 1024 * 1024)
        throw new Error(
          'POLICY_VIOLATION: Agent setup SQL is limited to 1 MB.',
        );
      return WorkspaceManager.createWorkspace(
        args,
        args.expectedCatalogRevision,
        'agent',
      );
    },
  );

  register(
    'rename_workspace',
    'Renames a saved workspace. Requires human-enabled agent workspace administration.',
    z.object({
      workspaceId: z.string().min(1),
      name: z.string().min(1).max(80),
      expectedCatalogRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['workspaceId', 'name', 'expectedCatalogRevision'],
      properties: {
        workspaceId: { type: 'string' },
        name: { type: 'string' },
        expectedCatalogRevision: { type: 'integer' },
      },
    },
    async (args: {
      workspaceId: string;
      name: string;
      expectedCatalogRevision: number;
    }) => {
      requireAdministration();
      await WorkspaceManager.renameWorkspace(
        args.workspaceId,
        args.name,
        args.expectedCatalogRevision,
        'agent',
      );
      return { success: true };
    },
  );

  register(
    'delete_workspace',
    'Permanently deletes a saved local workspace. Deleting the final workspace leaves TuneQL in its empty state. Requires human-enabled agent workspace administration.',
    z.object({
      workspaceId: z.string().min(1),
      expectedCatalogRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['workspaceId', 'expectedCatalogRevision'],
      properties: {
        workspaceId: { type: 'string' },
        expectedCatalogRevision: { type: 'integer' },
      },
    },
    async (args: { workspaceId: string; expectedCatalogRevision: number }) => {
      requireAdministration();
      await WorkspaceManager.deleteWorkspace(
        args.workspaceId,
        args.expectedCatalogRevision,
        'agent',
      );
      return { success: true };
    },
  );

  register(
    'get_optimization_report',
    'Returns a concise Markdown evidence report for the active workspace without result-row contents.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => ({
      markdown: buildOptimizationReport(workspaceStore.getState()),
    }),
  );

  register(
    'get_schema',
    'Returns table schema metadata, column types, and estimated row counts. Optionally filter by table name.',
    z.object({ table: z.string().optional() }),
    {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Optional table name to filter' },
      },
    },
    async (args: { table?: string }) => {
      const state = workspaceStore.getState();
      if (args.table) {
        const t = state.schema.tables.find(
          (tbl) => tbl.name.toLowerCase() === args.table?.toLowerCase(),
        );
        return t
          ? { table: t }
          : {
              error: 'TABLE_NOT_FOUND',
              message: `Table "${args.table}" does not exist.`,
            };
      }
      return { tables: state.schema.tables };
    },
  );

  register(
    'get_indexes',
    'Returns all existing indexes in the database including column definitions and protected status. Optionally filter by table.',
    z.object({ table: z.string().optional() }),
    {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Optional table name' },
      },
    },
    async (args: { table?: string }) => {
      const state = workspaceStore.getState();
      if (args.table) {
        return {
          indexes: state.schema.indexes.filter(
            (i) => i.table.toLowerCase() === args.table?.toLowerCase(),
          ),
        };
      }
      return { indexes: state.schema.indexes };
    },
  );

  register(
    'get_active_query',
    'Returns the active SQL query currently in the workspace editor and current revision.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => {
      const state = workspaceStore.getState();
      return {
        query: state.query,
        revision: state.revision,
        hasBaseline: !!state.baseline,
      };
    },
  );

  register(
    'set_active_query',
    'Updates the active SQL query in the workspace editor. Must be a read-only SELECT query.',
    z.object({
      sql: z.string().min(1, 'SQL query cannot be empty'),
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['sql', 'expectedWorkspaceId', 'expectedRevision'],
      properties: {
        sql: { type: 'string', description: 'The new SQL query' },
        expectedWorkspaceId: {
          type: 'string',
          description: 'Expected active workspace ID',
        },
        expectedRevision: {
          type: 'integer',
          description: 'Expected workspace revision number',
        },
      },
    },
    async (args: {
      sql: string;
      expectedWorkspaceId: string;
      expectedRevision: number;
    }) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      return WorkspaceCommands.setActiveQuery(
        args.sql,
        'agent',
        args.expectedRevision,
      );
    },
  );

  register(
    'explain_query',
    'Runs PostgreSQL EXPLAIN on the active query and returns execution time, root node details, and deterministic plan findings.',
    z.object({
      mode: z.enum(['estimate', 'analyze']).default('analyze'),
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['expectedWorkspaceId', 'expectedRevision'],
      properties: {
        mode: {
          type: 'string',
          enum: ['estimate', 'analyze'],
          description: 'Explain mode',
        },
        expectedWorkspaceId: { type: 'string' },
        expectedRevision: { type: 'integer' },
      },
    },
    async (
      args: {
        mode: 'estimate' | 'analyze';
        expectedWorkspaceId: string;
        expectedRevision: number;
      },
      signal,
    ) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      const plan = await WorkspaceCommands.explainQuery(
        args.mode,
        'agent',
        signal,
      );
      return {
        rootNode: plan.rootNode.nodeType,
        totalTimeMs: plan.totalTimeMs,
        executionTimeMs: plan.executionTimeMs,
        planningTimeMs: plan.planningTimeMs,
        findings: plan.findings,
      };
    },
  );

  register(
    'benchmark_query',
    'Runs repeated local benchmark execution runs for the active query and returns median, min, and max runtime in milliseconds.',
    z.object({
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['expectedWorkspaceId', 'expectedRevision'],
      properties: {
        expectedWorkspaceId: { type: 'string' },
        expectedRevision: { type: 'integer' },
      },
    },
    async (
      args: { expectedWorkspaceId: string; expectedRevision: number },
      signal,
    ) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      return WorkspaceCommands.benchmarkQuery(
        undefined,
        undefined,
        'agent',
        signal,
      );
    },
  );

  register(
    'set_baseline',
    'Designates the current active query and index configuration as the official optimization baseline.',
    z.object({
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['expectedWorkspaceId', 'expectedRevision'],
      properties: {
        expectedWorkspaceId: { type: 'string' },
        expectedRevision: { type: 'integer' },
      },
    },
    async (
      args: { expectedWorkspaceId: string; expectedRevision: number },
      signal,
    ) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      const baseline = await WorkspaceCommands.setBaseline('agent', signal);
      return {
        baselineId: baseline.id,
        medianMs: baseline.benchmark?.medianMs,
        query: baseline.query,
      };
    },
  );

  register(
    'compare_to_baseline',
    'Compares active candidate query against baseline: checks full result equivalence, computes speedup ratio, and evaluates workspace constraints.',
    z.object({
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['expectedWorkspaceId', 'expectedRevision'],
      properties: {
        expectedWorkspaceId: { type: 'string' },
        expectedRevision: { type: 'integer' },
      },
    },
    async (
      args: { expectedWorkspaceId: string; expectedRevision: number },
      signal,
    ) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      return WorkspaceCommands.compareToBaseline(undefined, 'agent', signal);
    },
  );

  register(
    'create_index',
    'Creates a B-Tree index on a specified table and column list. Checks workspace constraints before creating.',
    z.object({
      table: z.string().min(1),
      columns: z.array(z.string().min(1)).min(1),
      name: z.string().optional(),
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['table', 'columns', 'expectedWorkspaceId', 'expectedRevision'],
      properties: {
        table: { type: 'string', description: 'Target table name' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Columns to include in index',
        },
        name: { type: 'string', description: 'Optional index name' },
        expectedWorkspaceId: {
          type: 'string',
          description: 'Expected active workspace ID',
        },
        expectedRevision: {
          type: 'integer',
          description: 'Expected workspace revision',
        },
      },
    },
    async (args: {
      table: string;
      columns: string[];
      name?: string;
      expectedWorkspaceId: string;
      expectedRevision: number;
    }) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      return WorkspaceCommands.createIndex(
        args.table,
        args.columns,
        args.name,
        'agent',
        args.expectedRevision,
      );
    },
  );

  register(
    'drop_index',
    'Drops a user-created index. Protected indexes and primary keys cannot be dropped.',
    z.object({
      name: z.string().min(1),
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['name', 'expectedWorkspaceId', 'expectedRevision'],
      properties: {
        name: { type: 'string', description: 'Index name to remove' },
        expectedWorkspaceId: {
          type: 'string',
          description: 'Expected active workspace ID',
        },
        expectedRevision: {
          type: 'integer',
          description: 'Expected workspace revision',
        },
      },
    },
    async (args: {
      name: string;
      expectedWorkspaceId: string;
      expectedRevision: number;
    }) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      await WorkspaceCommands.dropIndex(
        args.name,
        'agent',
        args.expectedRevision,
      );
      return { success: true, droppedIndex: args.name };
    },
  );

  register(
    'get_constraints',
    'Returns the active human-configured constraints and optimization goals.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => {
      const state = workspaceStore.getState();
      return { constraints: state.constraints };
    },
  );

  register(
    'list_attempts',
    'Returns the history of optimization attempts made during this session.',
    z.object({}),
    { type: 'object', properties: {} },
    async () => {
      const state = workspaceStore.getState();
      return {
        workspaceRevision: state.revision,
        baseline: state.baseline
          ? {
              id: state.baseline.id,
              medianMs: state.baseline.benchmark?.medianMs,
              createdAt: state.baseline.createdAt,
            }
          : undefined,
        attempts: state.attempts.map((a) => ({
          id: a.id,
          sequence: a.sequence,
          source: a.source,
          medianMs: a.benchmark?.medianMs,
          equivalent: a.comparison?.equivalent,
          speedup: a.comparison?.speedup,
          userIndexesCount: a.userIndexes.length,
          createdAt: a.createdAt,
        })),
      };
    },
  );

  register(
    'restore_attempt',
    'Restores the query and index configuration of a previous attempt or baseline.',
    z.object({
      attemptId: z.string().min(1),
      expectedWorkspaceId: z.string().min(1),
      expectedRevision: z.number().int(),
    }),
    {
      type: 'object',
      required: ['attemptId', 'expectedWorkspaceId', 'expectedRevision'],
      properties: {
        attemptId: {
          type: 'string',
          description: 'ID of the attempt to restore',
        },
        expectedWorkspaceId: {
          type: 'string',
          description: 'Expected active workspace ID',
        },
        expectedRevision: {
          type: 'integer',
          description: 'Expected workspace revision',
        },
      },
    },
    async (args: {
      attemptId: string;
      expectedWorkspaceId: string;
      expectedRevision: number;
    }) => {
      requireActiveWorkspace(args.expectedWorkspaceId, args.expectedRevision);
      await WorkspaceCommands.restoreAttempt(
        args.attemptId,
        'agent',
        args.expectedRevision,
      );
      return { success: true, restoredAttemptId: args.attemptId };
    },
  );

  try {
    await Promise.all(registrationPromises);
    workspaceStore.setState({
      webMcpAvailable: true,
      registeredToolsCount: count,
    });
    return {
      success: true,
      registeredCount: count,
      cleanup: () => {
        registrationController.abort();
        workspaceStore.setState({
          webMcpAvailable: false,
          registeredToolsCount: 0,
        });
      },
    };
  } catch (error) {
    registrationController.abort();
    workspaceStore.setState({
      webMcpAvailable: false,
      registeredToolsCount: 0,
    });
    throw error;
  }
}
