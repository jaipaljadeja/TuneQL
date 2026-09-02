import { DBSchema, IDBPDatabase, deleteDB, openDB } from 'idb';
import type { WorkspaceCatalogItem, WorkspaceState } from '@/types';

export interface PersistedCatalog {
  workspaces: WorkspaceCatalogItem[];
  openWorkspaceIds: string[];
  activeWorkspaceId: string;
  catalogRevision: number;
  agentWorkspaceAdminEnabled: boolean;
}

export type PersistedWorkspace = Omit<
  WorkspaceState,
  | 'status'
  | 'errorMessage'
  | 'webMcpAvailable'
  | 'registeredToolsCount'
  | 'workspaces'
  | 'openWorkspaceIds'
  | 'activeWorkspaceId'
  | 'catalogRevision'
  | 'catalogReady'
  | 'agentWorkspaceAdminEnabled'
>;

interface TuneQLDb extends DBSchema {
  settings: { key: string; value: PersistedCatalog };
  workspaces: { key: string; value: PersistedWorkspace };
}

let database: Promise<IDBPDatabase<TuneQLDb>> | undefined;

function getDatabase() {
  database ??= openDB<TuneQLDb>('tuneql-metadata', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('workspaces'))
        db.createObjectStore('workspaces');
    },
  });
  return database;
}

export async function loadCatalog(): Promise<PersistedCatalog | undefined> {
  return (await getDatabase()).get('settings', 'catalog');
}
export async function saveCatalog(catalog: PersistedCatalog): Promise<void> {
  await (await getDatabase()).put('settings', catalog, 'catalog');
}
export async function loadWorkspace(
  id: string,
): Promise<PersistedWorkspace | undefined> {
  return (await getDatabase()).get('workspaces', id);
}
export async function saveWorkspace(
  workspace: PersistedWorkspace,
): Promise<void> {
  await (await getDatabase()).put('workspaces', workspace, workspace.id);
}
export async function deleteWorkspaceRecord(id: string): Promise<void> {
  await (await getDatabase()).delete('workspaces', id);
}
export async function deleteWorkspaceDatabase(id: string): Promise<void> {
  await deleteDB(`tuneql-${id}`);
}
export function toPersistedWorkspace(
  state: WorkspaceState,
): PersistedWorkspace {
  return {
    id: state.id,
    name: state.name,
    revision: state.revision,
    query: state.query,
    activeQueryId: state.activeQueryId,
    schema: state.schema,
    constraints: state.constraints,
    baseline: state.baseline,
    attempts: state.attempts,
    currentAttempt: state.currentAttempt,
    lastResult: state.lastResult,
    lastPlan: state.lastPlan,
    lastBenchmark: state.lastBenchmark,
    lastComparison: state.lastComparison,
    activity: state.activity,
    kind: state.kind,
    setupSql: state.setupSql,
    initialQuery: state.initialQuery,
    baseIndexNames: state.baseIndexNames,
    benchmarkSettings: state.benchmarkSettings,
  };
}
