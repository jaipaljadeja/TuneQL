import {
  DEFAULT_BENCHMARK_SETTINGS,
  ExecutionSource,
  WorkspaceCatalogItem,
  WorkspaceKind,
  WorkspaceState,
} from '@/types';
import {
  ECOMMERCE_DEMO_NAME,
  getEcommerceSeedSql,
  INITIAL_BASELINE_SQL,
  INITIAL_CONSTRAINTS,
} from '@/db/ecommerce-fixture';
import { pgEngine } from '@/db/pglite-engine';
import {
  initialWorkspaceState,
  workspaceStore,
  zustandWorkspaceStore,
} from './store';
import {
  deleteWorkspaceDatabase,
  deleteWorkspaceRecord,
  loadCatalog,
  loadWorkspace,
  PersistedCatalog,
  saveCatalog,
  saveWorkspace,
  toPersistedWorkspace,
} from './persistence';

export interface CreateWorkspaceInput {
  name: string;
  kind: Exclude<WorkspaceKind, 'restored'>;
  setupSql?: string;
  initialQuery?: string;
}

let bootPromise: Promise<void> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;
let switching = false;

function catalogFrom(state: WorkspaceState): PersistedCatalog {
  return {
    workspaces: Array.from(
      new Map(state.workspaces.map((w) => [w.id, w])).values(),
    ),
    openWorkspaceIds: Array.from(new Set(state.openWorkspaceIds)),
    activeWorkspaceId: state.activeWorkspaceId,
    catalogRevision: state.catalogRevision,
    agentWorkspaceAdminEnabled: state.agentWorkspaceAdminEnabled,
  };
}

function isBusy(state = workspaceStore.getState()) {
  return (
    switching ||
    state.status === 'running' ||
    state.status === 'benchmarking' ||
    state.status === 'initializing'
  );
}

function emptyState(
  item: WorkspaceCatalogItem,
  input: CreateWorkspaceInput,
): WorkspaceState {
  const query =
    input.initialQuery?.trim() ||
    (input.kind === 'ecommerce' ? INITIAL_BASELINE_SQL : 'SELECT version();');
  const current = workspaceStore.getState();
  return {
    ...initialWorkspaceState,
    id: item.id,
    name: item.name,
    kind: item.kind,
    setupSql: input.setupSql,
    initialQuery: query,
    query,
    revision: 1,
    constraints: { ...INITIAL_CONSTRAINTS },
    benchmarkSettings: { ...DEFAULT_BENCHMARK_SETTINGS },
    workspaces: current.workspaces,
    openWorkspaceIds: current.openWorkspaceIds,
    activeWorkspaceId: item.id,
    catalogRevision: current.catalogRevision,
    catalogReady: true,
    agentWorkspaceAdminEnabled: current.agentWorkspaceAdminEnabled,
    webMcpAvailable: current.webMcpAvailable,
    registeredToolsCount: current.registeredToolsCount,
  };
}

function noWorkspaceState(catalog: PersistedCatalog): WorkspaceState {
  const current = workspaceStore.getState();
  return {
    ...initialWorkspaceState,
    id: '',
    name: '',
    kind: 'empty',
    revision: 0,
    status: 'ready',
    query: '',
    initialQuery: '',
    schema: { tables: [], indexes: [] },
    baseline: undefined,
    attempts: [],
    currentAttempt: undefined,
    lastResult: undefined,
    lastPlan: undefined,
    lastBenchmark: undefined,
    lastComparison: undefined,
    activity: [],
    baseIndexNames: [],
    setupSql: undefined,
    workspaces: [],
    openWorkspaceIds: [],
    activeWorkspaceId: '',
    catalogRevision: catalog.catalogRevision,
    catalogReady: true,
    agentWorkspaceAdminEnabled: catalog.agentWorkspaceAdminEnabled,
    webMcpAvailable: current.webMcpAvailable,
    registeredToolsCount: current.registeredToolsCount,
  };
}

async function persistNow() {
  clearTimeout(persistTimer);
  const state = workspaceStore.getState();
  if (!state.catalogReady) return;
  const writes: Promise<void>[] = [saveCatalog(catalogFrom(state))];
  if (
    state.id &&
    state.workspaces.some((workspace) => workspace.id === state.id)
  ) {
    writes.push(saveWorkspace(toPersistedWorkspace(state)));
  }
  await Promise.all(writes);
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void persistNow(), 500);
}

async function openPersisted(
  id: string,
  initialize: boolean,
  onProgress?: (message: string) => void,
) {
  const current = workspaceStore.getState();
  const persisted = await loadWorkspace(id);
  const item = current.workspaces.find((workspace) => workspace.id === id);
  if (!persisted || !item)
    throw new Error(`Workspace "${id}" could not be restored.`);
  await pgEngine.openWorkspace(id, {
    initialize,
    setupSql: persisted.setupSql,
    onProgress,
  });
  pgEngine.setProtectedIndexes(persisted.baseIndexNames);
  pgEngine.setTimeoutSeconds(persisted.benchmarkSettings.timeoutSeconds);
  const schema = await pgEngine.getSchema();
  workspaceStore.replaceState({
    ...persisted,
    status: 'ready',
    schema,
    workspaces: current.workspaces,
    openWorkspaceIds: current.openWorkspaceIds,
    activeWorkspaceId: id,
    catalogRevision: current.catalogRevision,
    catalogReady: true,
    agentWorkspaceAdminEnabled: current.agentWorkspaceAdminEnabled,
    webMcpAvailable: current.webMcpAvailable,
    registeredToolsCount: current.registeredToolsCount,
  });
}

export class WorkspaceManager {
  static bootstrap(onProgress?: (message: string) => void): Promise<void> {
    bootPromise ??= this.bootstrapOnce(onProgress);
    return bootPromise;
  }

  private static async bootstrapOnce(onProgress?: (message: string) => void) {
    workspaceStore.setState({ status: 'initializing' });
    let catalog = await loadCatalog();
    if (!catalog) {
      const now = new Date().toISOString();
      const item: WorkspaceCatalogItem = {
        id: 'ecommerce-demo',
        name: ECOMMERCE_DEMO_NAME,
        kind: 'ecommerce',
        createdAt: now,
        updatedAt: now,
      };
      catalog = {
        workspaces: [item],
        openWorkspaceIds: [item.id],
        activeWorkspaceId: item.id,
        catalogRevision: 1,
        agentWorkspaceAdminEnabled: false,
      };
      workspaceStore.setState({ ...catalog, catalogReady: true });
      const state = emptyState(item, {
        name: item.name,
        kind: 'ecommerce',
        setupSql: getEcommerceSeedSql(),
      });
      workspaceStore.replaceState({
        ...state,
        ...catalog,
        status: 'initializing',
        catalogReady: true,
      });
      await saveWorkspace(toPersistedWorkspace(workspaceStore.getState()));
      await pgEngine.openWorkspace(item.id, {
        initialize: true,
        setupSql: getEcommerceSeedSql(),
        onProgress,
      });
      const initialSchema = await pgEngine.getSchema();
      const baseIndexNames = initialSchema.indexes.map((index) => index.name);
      pgEngine.setProtectedIndexes(baseIndexNames);
      workspaceStore.setState({
        status: 'ready',
        schema: await pgEngine.getSchema(),
        baseIndexNames,
      });
    } else if (!catalog.workspaces.length) {
      const emptyCatalog = {
        ...catalog,
        workspaces: [],
        openWorkspaceIds: [],
        activeWorkspaceId: '',
      };
      workspaceStore.replaceState(noWorkspaceState(emptyCatalog));
      await pgEngine.close();
    } else {
      const workspaces = Array.from(
        new Map(
          catalog.workspaces.map((workspace) => [workspace.id, workspace]),
        ).values(),
      );
      const validOpen = Array.from(new Set(catalog.openWorkspaceIds)).filter(
        (id) => workspaces.some((workspace) => workspace.id === id),
      );
      const active = workspaces.some(
        (workspace) => workspace.id === catalog!.activeWorkspaceId,
      )
        ? catalog.activeWorkspaceId
        : workspaces[0].id;
      catalog = {
        ...catalog,
        workspaces,
        openWorkspaceIds: validOpen.includes(active)
          ? validOpen
          : [...validOpen, active],
        activeWorkspaceId: active,
      };
      workspaceStore.setState({ ...catalog, catalogReady: true });
      await openPersisted(active, false, onProgress);
    }
    unsubscribe ??= zustandWorkspaceStore.subscribe(schedulePersist);
    window.addEventListener('pagehide', () => void persistNow());
    workspaceStore.logActivity(
      'system',
      'Workspace ready',
      'Restored the local PostgreSQL workspace.',
    );
    await persistNow();
  }

  static async flush() {
    await persistNow();
  }

  static async switchWorkspace(
    id: string,
    expectedCatalogRevision?: number,
    source: ExecutionSource = 'human',
  ) {
    const state = workspaceStore.getState();
    if (id === state.activeWorkspaceId) return;
    if (isBusy(state))
      throw new Error(
        'WORKSPACE_BUSY: Wait for the current database operation to finish.',
      );
    if (
      expectedCatalogRevision !== undefined &&
      expectedCatalogRevision !== state.catalogRevision
    )
      throw new Error('STALE_CATALOG: Re-read the workspace catalog.');
    if (!state.workspaces.some((workspace) => workspace.id === id))
      throw new Error('WORKSPACE_NOT_FOUND: Workspace does not exist.');
    switching = true;
    try {
      await persistNow();
      workspaceStore.setState({ status: 'initializing' });
      await pgEngine.close();
      const openWorkspaceIds = Array.from(
        new Set([...state.openWorkspaceIds, id]),
      );
      workspaceStore.setState({
        openWorkspaceIds,
        activeWorkspaceId: id,
        catalogRevision: state.catalogRevision + 1,
      });
      await openPersisted(id, false);
      workspaceStore.logActivity(
        source,
        'Opened workspace',
        workspaceStore.getState().name,
      );
      await persistNow();
    } finally {
      switching = false;
    }
  }

  static async createWorkspace(
    input: CreateWorkspaceInput,
    expectedCatalogRevision?: number,
    source: ExecutionSource = 'human',
  ) {
    const state = workspaceStore.getState();
    if (isBusy(state))
      throw new Error(
        'WORKSPACE_BUSY: Wait for the current operation to finish.',
      );
    if (
      expectedCatalogRevision !== undefined &&
      expectedCatalogRevision !== state.catalogRevision
    )
      throw new Error('STALE_CATALOG: Re-read the workspace catalog.');
    const name = input.name.trim();
    if (!name) throw new Error('Workspace name is required.');
    const id = `ws-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const item: WorkspaceCatalogItem = {
      id,
      name,
      kind: input.kind,
      createdAt: now,
      updatedAt: now,
    };
    const setupSql =
      input.kind === 'ecommerce'
        ? getEcommerceSeedSql()
        : input.setupSql?.trim();
    switching = true;
    await persistNow();
    await pgEngine.close();
    try {
      const nextCatalog = [...state.workspaces, item];
      const openWorkspaceIds = [...state.openWorkspaceIds, id];
      const draft = emptyState(item, { ...input, setupSql });
      workspaceStore.replaceState({
        ...draft,
        workspaces: nextCatalog,
        openWorkspaceIds,
        activeWorkspaceId: id,
        catalogRevision: state.catalogRevision + 1,
        status: 'initializing',
      });
      await pgEngine.openWorkspace(id, { initialize: true, setupSql });
      const schema = await pgEngine.getSchema();
      const baseIndexNames = schema.indexes.map((index) => index.name);
      pgEngine.setProtectedIndexes(baseIndexNames);
      workspaceStore.setState({
        status: 'ready',
        schema: await pgEngine.getSchema(),
        baseIndexNames,
      });
      workspaceStore.logActivity(
        source,
        'Created workspace',
        `${name} (${input.kind}).`,
      );
      await persistNow();
      return { workspaceId: id, workspaceName: name };
    } catch (error) {
      await pgEngine.close().catch(() => {});
      await Promise.all([
        deleteWorkspaceDatabase(id),
        deleteWorkspaceRecord(id),
      ]).catch(() => {});
      workspaceStore.replaceState(state);
      if (state.id) {
        await pgEngine.openWorkspace(state.id);
        pgEngine.setProtectedIndexes(state.baseIndexNames);
      }
      throw error;
    } finally {
      switching = false;
    }
  }

  static async resetActive() {
    const state = workspaceStore.getState();
    if (isBusy(state))
      throw new Error(
        'WORKSPACE_BUSY: Wait for the current operation to finish.',
      );
    switching = true;
    workspaceStore.setState({ status: 'initializing' });
    await pgEngine.close();
    await deleteWorkspaceDatabase(state.id);
    try {
      const seedSql =
        state.kind === 'ecommerce' ? getEcommerceSeedSql() : state.setupSql;
      const initialQuery =
        state.kind === 'ecommerce' ? INITIAL_BASELINE_SQL : state.initialQuery;
      await pgEngine.openWorkspace(state.id, {
        initialize: true,
        setupSql: seedSql,
      });
      const schema = await pgEngine.getSchema();
      const baseIndexNames = schema.indexes.map((index) => index.name);
      pgEngine.setProtectedIndexes(baseIndexNames);
      workspaceStore.setState({
        status: 'ready',
        query: initialQuery,
        initialQuery,
        setupSql: seedSql,
        schema: await pgEngine.getSchema(),
        baseIndexNames,
        baseline: undefined,
        attempts: [],
        currentAttempt: undefined,
        lastResult: undefined,
        lastPlan: undefined,
        lastBenchmark: undefined,
        lastComparison: undefined,
        activity: [],
        constraints: { ...INITIAL_CONSTRAINTS },
        revision: state.revision + 1,
      });
      workspaceStore.logActivity(
        'human',
        'Reset workspace',
        'Restored the original workspace database and cleared optimization evidence.',
      );
      await persistNow();
    } finally {
      switching = false;
    }
  }

  static async closeTab(id: string) {
    const state = workspaceStore.getState();
    if (isBusy(state))
      throw new Error(
        'WORKSPACE_BUSY: Wait for the current operation to finish.',
      );
    if (state.openWorkspaceIds.length === 1) return;
    const next = state.openWorkspaceIds.filter(
      (workspaceId) => workspaceId !== id,
    );
    if (id === state.activeWorkspaceId)
      await this.switchWorkspace(
        next[Math.max(0, state.openWorkspaceIds.indexOf(id) - 1)],
      );
    workspaceStore.setState({
      openWorkspaceIds: next,
      catalogRevision: workspaceStore.getState().catalogRevision + 1,
    });
    await persistNow();
  }

  static async renameWorkspace(
    id: string,
    name: string,
    expectedCatalogRevision?: number,
    source: ExecutionSource = 'human',
  ) {
    const state = workspaceStore.getState();
    if (
      expectedCatalogRevision !== undefined &&
      expectedCatalogRevision !== state.catalogRevision
    )
      throw new Error('STALE_CATALOG: Re-read the workspace catalog.');
    if (!state.workspaces.some((workspace) => workspace.id === id))
      throw new Error('WORKSPACE_NOT_FOUND: Workspace does not exist.');
    const clean = name.trim();
    if (!clean) throw new Error('Workspace name is required.');
    const workspaces = state.workspaces.map((item) =>
      item.id === id
        ? { ...item, name: clean, updatedAt: new Date().toISOString() }
        : item,
    );
    workspaceStore.setState(
      {
        workspaces,
        name: state.id === id ? clean : state.name,
        catalogRevision: state.catalogRevision + 1,
      },
      { bumpRevision: state.id === id },
    );
    workspaceStore.logActivity(source, 'Renamed workspace', clean);
    await persistNow();
  }

  static async deleteWorkspace(
    id: string,
    expectedCatalogRevision?: number,
    source: ExecutionSource = 'human',
  ) {
    const state = workspaceStore.getState();
    if (isBusy(state))
      throw new Error(
        'WORKSPACE_BUSY: Wait for the current operation to finish.',
      );
    if (
      expectedCatalogRevision !== undefined &&
      expectedCatalogRevision !== state.catalogRevision
    )
      throw new Error('STALE_CATALOG: Re-read the workspace catalog.');
    if (!state.workspaces.some((workspace) => workspace.id === id))
      throw new Error('WORKSPACE_NOT_FOUND: Workspace does not exist.');
    if (state.workspaces.length === 1) {
      switching = true;
      try {
        await persistNow();
        await pgEngine.close();
        await Promise.all([
          deleteWorkspaceRecord(id),
          deleteWorkspaceDatabase(id),
        ]);
        const catalog: PersistedCatalog = {
          workspaces: [],
          openWorkspaceIds: [],
          activeWorkspaceId: '',
          catalogRevision: state.catalogRevision + 1,
          agentWorkspaceAdminEnabled: state.agentWorkspaceAdminEnabled,
        };
        workspaceStore.replaceState(noWorkspaceState(catalog));
        await persistNow();
      } finally {
        switching = false;
      }
      return;
    }
    if (id === state.activeWorkspaceId) {
      const replacement = state.workspaces.find(
        (workspace) => workspace.id !== id,
      )!;
      await this.switchWorkspace(replacement.id, undefined, source);
    }
    const current = workspaceStore.getState();
    workspaceStore.setState({
      workspaces: current.workspaces.filter((workspace) => workspace.id !== id),
      openWorkspaceIds: current.openWorkspaceIds.filter(
        (workspaceId) => workspaceId !== id,
      ),
      catalogRevision: current.catalogRevision + 1,
    });
    await Promise.all([deleteWorkspaceRecord(id), deleteWorkspaceDatabase(id)]);
    workspaceStore.logActivity(source, 'Deleted workspace', id);
    await persistNow();
  }

  static async setAgentAdministration(enabled: boolean) {
    workspaceStore.setState({
      agentWorkspaceAdminEnabled: enabled,
      catalogRevision: workspaceStore.getState().catalogRevision + 1,
    });
    await persistNow();
  }
}
