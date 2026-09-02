import { createStore } from 'zustand/vanilla';
import {
  ActivityEvent,
  DEFAULT_BENCHMARK_SETTINGS,
  ExecutionSource,
  WorkspaceState,
} from '@/types';
import {
  ECOMMERCE_DEMO_NAME,
  INITIAL_BASELINE_SQL,
  INITIAL_CONSTRAINTS,
} from '@/db/ecommerce-fixture';

const createdAt = new Date().toISOString();

export const initialWorkspaceState: WorkspaceState = {
  id: 'ecommerce-demo',
  name: ECOMMERCE_DEMO_NAME,
  revision: 1,
  status: 'initializing',
  query: INITIAL_BASELINE_SQL,
  activeQueryId: 'query-main',
  schema: { tables: [], indexes: [] },
  constraints: { ...INITIAL_CONSTRAINTS },
  attempts: [],
  activity: [],
  webMcpAvailable: false,
  registeredToolsCount: 0,
  kind: 'ecommerce',
  initialQuery: INITIAL_BASELINE_SQL,
  baseIndexNames: [],
  benchmarkSettings: { ...DEFAULT_BENCHMARK_SETTINGS },
  workspaces: [
    {
      id: 'ecommerce-demo',
      name: ECOMMERCE_DEMO_NAME,
      kind: 'ecommerce',
      createdAt,
      updatedAt: createdAt,
    },
  ],
  openWorkspaceIds: ['ecommerce-demo'],
  activeWorkspaceId: 'ecommerce-demo',
  catalogRevision: 1,
  catalogReady: false,
  agentWorkspaceAdminEnabled: false,
};

export const zustandWorkspaceStore = createStore<WorkspaceState>(
  () => initialWorkspaceState,
);

export const workspaceStore = {
  getState: zustandWorkspaceStore.getState,
  subscribe: zustandWorkspaceStore.subscribe,
  setState(
    partial: Partial<WorkspaceState>,
    options: { bumpRevision?: boolean } = {},
  ) {
    const current = zustandWorkspaceStore.getState();
    zustandWorkspaceStore.setState({
      ...partial,
      revision:
        partial.revision !== undefined
          ? partial.revision
          : current.revision + (options.bumpRevision ? 1 : 0),
    });
  },
  replaceState(next: WorkspaceState) {
    zustandWorkspaceStore.setState(next, true);
  },
  logActivity(source: ExecutionSource, action: string, details?: string) {
    const current = zustandWorkspaceStore.getState();
    const event: ActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      source,
      action,
      details,
    };
    zustandWorkspaceStore.setState({
      activity: [event, ...current.activity.slice(0, 49)],
    });
  },
};
