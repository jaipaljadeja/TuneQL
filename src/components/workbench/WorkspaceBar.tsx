'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  DatabaseZap,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceManager } from '@/workspace/manager';
import { workspaceStore } from '@/workspace/store';
import { buildOptimizationReport } from '@/workspace/report';
import {
  downloadBlob,
  exportActiveWorkspace,
  restoreWorkspaceArchive,
} from '@/workspace/archive';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  BenchmarkSettingsForm,
  CreateWorkspaceDialog,
  DEFAULT_WORKSPACE_NAMES,
  type CreateKind,
} from './WorkspaceDialogs';

const SQL_IMPORT_LIMIT_BYTES = 25 * 1024 * 1024;

function safeFilename(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace'
  );
}

export function WorkspaceBar() {
  const state = useWorkspace(
    useShallow((workspace) => ({
      activeWorkspaceId: workspace.activeWorkspaceId,
      name: workspace.name,
      openWorkspaceIds: workspace.openWorkspaceIds,
      status: workspace.status,
      workspaces: workspace.workspaces,
    })),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kind, setKind] = useState<CreateKind>('empty');
  const [name, setName] = useState(DEFAULT_WORKSPACE_NAMES.empty);
  const [setupSql, setSetupSql] = useState('');
  const [archive, setArchive] = useState<File>();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const busy =
    state.status === 'initializing' ||
    state.status === 'running' ||
    state.status === 'benchmarking' ||
    pending;

  async function run(operation: () => Promise<unknown>) {
    setPending(true);
    setError(undefined);
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  async function saveRename() {
    const nextName = renameValue.trim();
    if (!nextName || nextName === state.name) {
      setRenaming(false);
      return;
    }
    await run(() =>
      WorkspaceManager.renameWorkspace(state.activeWorkspaceId, nextName),
    );
    setRenaming(false);
  }

  function openCreate(selectedKind: CreateKind = 'empty') {
    setError(undefined);
    setKind(selectedKind);
    setName(DEFAULT_WORKSPACE_NAMES[selectedKind]);
    setSetupSql('');
    setArchive(undefined);
    setCreateOpen(true);
  }

  function createWorkspace() {
    return run(async () => {
      if (kind === 'restore') {
        if (!archive) throw new Error('Choose a TuneQL ZIP file.');
        await restoreWorkspaceArchive(archive);
      } else {
        if (new Blob([setupSql]).size > SQL_IMPORT_LIMIT_BYTES) {
          throw new Error('SQL imports are limited to 25 MB.');
        }
        await WorkspaceManager.createWorkspace({
          name,
          kind,
          setupSql: kind === 'sql' || kind === 'empty' ? setupSql : undefined,
        });
      }
      setCreateOpen(false);
      setSetupSql('');
      setArchive(undefined);
    });
  }

  function exportWorkspace() {
    return run(async () => {
      const blob = await exportActiveWorkspace();
      downloadBlob(blob, `tuneql-${safeFilename(state.name)}.zip`);
    });
  }

  function downloadReport() {
    const report = buildOptimizationReport(workspaceStore.getState());
    downloadBlob(
      new Blob([report], { type: 'text/markdown' }),
      `tuneql-${safeFilename(state.name)}-report.md`,
    );
  }

  async function loadSqlFile(file?: File) {
    if (!file) return;
    if (file.size > SQL_IMPORT_LIMIT_BYTES) {
      setError('SQL imports are limited to 25 MB.');
      return;
    }
    setSetupSql(await file.text());
  }

  const uniqueWorkspaces = Array.from(
    new Map(state.workspaces.map((item) => [item.id, item])).values(),
  );
  const uniqueOpenIds = Array.from(new Set(state.openWorkspaceIds));

  return (
    <>
      <div className="h-10 shrink-0 border-b border-border/80 bg-card/70 flex items-center gap-2 px-2 overflow-hidden">
        <WorkspaceLibrary
          workspaces={uniqueWorkspaces}
          activeWorkspaceId={state.activeWorkspaceId}
          busy={busy}
          onSelect={(id) =>
            void run(() => WorkspaceManager.switchWorkspace(id))
          }
        />

        <div className="min-w-0 flex-1 h-full flex items-center gap-1 overflow-x-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.border)_transparent]">
          {uniqueOpenIds.map((id) => {
            const item = uniqueWorkspaces.find(
              (workspace) => workspace.id === id,
            );
            if (!item) return null;
            const active = id === state.activeWorkspaceId;

            return (
              <div
                key={id}
                className={`group h-7 shrink-0 flex items-center rounded-md border transition-colors ${active ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground shadow-xs' : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground'}`}
              >
                {active && renaming ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    maxLength={80}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => void saveRename()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveRename();
                      if (event.key === 'Escape') setRenaming(false);
                    }}
                    className="h-6 w-40 border-0 bg-transparent px-2 text-xs focus-visible:ring-1"
                    aria-label="Workspace name"
                    name="workspace-name"
                    autoComplete="off"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => WorkspaceManager.switchWorkspace(id))
                    }
                    className="h-full rounded-l-md pl-2.5 pr-1.5 text-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="max-w-48 truncate block">{item.name}</span>
                  </button>
                )}
                {active && !renaming && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameValue(item.name);
                      setRenaming(true);
                    }}
                    className="rounded p-1 opacity-0 hover:text-emerald-300 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Rename ${item.name}`}
                    title={`Rename ${item.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
                {!renaming && (
                  <button
                    type="button"
                    disabled={busy || uniqueOpenIds.length === 1}
                    onClick={() =>
                      void run(() => WorkspaceManager.closeTab(id))
                    }
                    className="mr-1 rounded p-1 hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Close ${item.name} tab`}
                    title={`Close ${item.name} tab`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            disabled={busy}
            onClick={() => openCreate()}
            className="size-7 shrink-0 rounded-md border border-dashed border-border grid place-items-center text-muted-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Create workspace"
            title="Create workspace"
          >
            <Plus className="size-4" />
          </button>

          {state.workspaces.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="size-7 shrink-0 rounded-md grid place-items-center text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Workspace actions"
                    title="Workspace actions"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 gap-1 p-1.5">
                <p className="px-2 py-1 text-[10px] font-medium truncate text-muted-foreground">
                  {state.name}
                </p>
                <ActionButton
                  icon={Settings2}
                  label="Benchmark settings"
                  onClick={() => setSettingsOpen(true)}
                />
                <ActionButton
                  icon={FileText}
                  label="Download report"
                  onClick={downloadReport}
                />
                <ActionButton
                  icon={Download}
                  label={pending ? 'Exporting…' : 'Export ZIP'}
                  disabled={busy}
                  onClick={() => void exportWorkspace()}
                />
                <div className="my-1 h-px bg-border" />
                <ActionButton
                  icon={Trash2}
                  label="Delete workspace"
                  destructive
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="max-w-64 truncate text-[10px] text-destructive font-mono"
            title={error}
          >
            {error}
          </p>
        )}
      </div>

      {state.workspaces.length === 0 && state.status !== 'initializing' && (
        <div className="fixed inset-x-0 bottom-0 top-[88px] z-30 grid place-items-center bg-background p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
              <FolderPlus className="size-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              No workspace
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Create a blank database, import SQL, restore a backup, or use
              sample data to explore TuneQL.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button onClick={() => openCreate()}>
                <Plus className="size-4" />
                Create workspace
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    WorkspaceManager.createWorkspace({
                      name: DEFAULT_WORKSPACE_NAMES.ecommerce,
                      kind: 'ecommerce',
                    }),
                  )
                }
              >
                <DatabaseZap className="size-4 text-emerald-400" />
                Use sample data
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        kind={kind}
        setKind={setKind}
        name={name}
        setName={setName}
        setupSql={setupSql}
        setSetupSql={setSetupSql}
        setArchive={setArchive}
        loadSqlFile={loadSqlFile}
        error={error}
        pending={pending}
        onCreate={() => void createWorkspace()}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benchmark settings</DialogTitle>
            <DialogDescription>
              Shared by UI actions and WebMCP tools for this workspace.
            </DialogDescription>
          </DialogHeader>
          <BenchmarkSettingsForm onCloseAction={() => setSettingsOpen(false)} />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${state.name}?`}
        description="This permanently removes its local PostgreSQL database and optimization history."
        confirmLabel="Delete Workspace"
        destructive
        onConfirm={() =>
          run(() => WorkspaceManager.deleteWorkspace(state.activeWorkspaceId))
        }
      />
    </>
  );
}

interface WorkspaceLibraryProps {
  workspaces: Array<{ id: string; name: string; kind: string }>;
  activeWorkspaceId: string;
  busy: boolean;
  onSelect: (id: string) => void;
}

function WorkspaceLibrary({
  workspaces,
  activeWorkspaceId,
  busy,
  onSelect,
}: WorkspaceLibraryProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="h-7 shrink-0 px-2 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <FolderOpen className="size-3.5" /> Workspaces
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1 p-1.5">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Saved workspaces
        </p>
        {workspaces.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No saved workspaces.
          </p>
        )}
        {workspaces.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => onSelect(item.id)}
            className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.id === activeWorkspaceId ? 'bg-emerald-500/10 text-emerald-300' : 'text-foreground'}`}
          >
            <span className="block truncate">{item.name}</span>
            <span className="text-[9px] uppercase text-muted-foreground">
              {item.kind}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  destructive,
  disabled,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent'}`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
