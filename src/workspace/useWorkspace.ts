'use client';

import { useStore } from 'zustand';
import { WorkspaceState } from '@/types';
import { zustandWorkspaceStore } from './store';

export function useWorkspace<T = WorkspaceState>(
  selector?: (state: WorkspaceState) => T,
): T {
  return useStore(zustandWorkspaceStore, selector ?? ((state) => state as T));
}
