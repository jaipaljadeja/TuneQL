'use client';

import { useState } from 'react';
import { WorkspaceCommands } from '@/workspace/commands';
import { useWorkspace } from '@/workspace/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  ArchiveRestore,
  DatabaseZap,
  FileUp,
  SquarePlus,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type CreateKind = 'ecommerce' | 'empty' | 'sql' | 'restore';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CreateKind;
  setKind: (kind: CreateKind) => void;
  name: string;
  setName: (name: string) => void;
  setupSql: string;
  setSetupSql: (sql: string) => void;
  setArchive: (file?: File) => void;
  loadSqlFile: (file?: File) => Promise<void>;
  error?: string;
  pending: boolean;
  onCreate: () => void;
}

export const DEFAULT_WORKSPACE_NAMES: Record<CreateKind, string> = {
  ecommerce: 'Ecommerce Demo',
  empty: 'Untitled Workspace',
  sql: 'SQL Import',
  restore: 'Restored Workspace',
};

const CREATE_OPTIONS: Array<{
  value: CreateKind;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}> = [
  {
    value: 'empty',
    title: 'Blank workspace',
    description: 'Start with an empty PostgreSQL database.',
    icon: SquarePlus,
  },
  {
    value: 'sql',
    title: 'Import SQL',
    description: 'Create a database from a SQL file or pasted setup SQL.',
    icon: FileUp,
  },
  {
    value: 'restore',
    title: 'Restore backup',
    description: 'Open a TuneQL workspace ZIP.',
    icon: ArchiveRestore,
  },
  {
    value: 'ecommerce',
    title: 'Sample Ecommerce data',
    description: 'Use seeded orders and a sample query to test the workbench.',
    icon: DatabaseZap,
    badge: 'Demo',
  },
];

export function CreateWorkspaceDialog(props: CreateWorkspaceDialogProps) {
  const {
    open,
    onOpenChange,
    kind,
    setKind,
    name,
    setName,
    setupSql,
    setSetupSql,
    setArchive,
    loadSqlFile,
    error,
    pending,
    onCreate,
  } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Choose how you want to set up the local PostgreSQL database.
          </DialogDescription>
        </DialogHeader>
        <div
          className="grid gap-2 sm:grid-cols-2"
          aria-label="Workspace source"
        >
          {CREATE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = kind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setKind(option.value);
                  setName(DEFAULT_WORKSPACE_NAMES[option.value]);
                }}
                className={`min-h-20 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-border bg-background hover:bg-accent/50'}`}
              >
                <span className="flex items-center gap-2">
                  <Icon
                    className={`size-4 ${selected ? 'text-emerald-400' : 'text-muted-foreground'}`}
                  />
                  <span className="text-xs font-medium text-foreground">
                    {option.title}
                  </span>
                  {option.badge && (
                    <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {option.badge}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
        {kind !== 'restore' && (
          <label className="grid gap-1.5 text-xs font-medium">
            Name
            <Input
              name="workspace-name"
              autoComplete="off"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        {(kind === 'sql' || kind === 'empty') && (
          <label className="grid gap-1.5 text-xs font-medium">
            {kind === 'sql' ? 'SQL dump or setup SQL' : 'Optional setup SQL'}
            <textarea
              value={setupSql}
              name="setup-sql"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setSetupSql(event.target.value)}
              className="h-44 resize-y rounded-md border border-input bg-background p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              placeholder="CREATE TABLE …"
            />
            {kind === 'sql' && (
              <Input
                name="sql-file"
                type="file"
                accept=".sql,text/plain"
                onChange={(event) => void loadSqlFile(event.target.files?.[0])}
              />
            )}
          </label>
        )}
        {kind === 'restore' && (
          <label className="grid gap-1.5 text-xs font-medium">
            TuneQL ZIP
            <Input
              name="workspace-archive"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setArchive(event.target.files?.[0])}
            />
          </label>
        )}
        {error && (
          <p
            role="alert"
            className="text-xs text-destructive font-mono [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onCreate}>
            {pending
              ? 'Creating…'
              : kind === 'restore'
                ? 'Restore workspace'
                : kind === 'sql'
                  ? 'Import workspace'
                  : kind === 'ecommerce'
                    ? 'Create demo workspace'
                    : 'Create workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BenchmarkSettingsForm({
  onCloseAction,
}: {
  onCloseAction: () => void;
}) {
  const settings = useWorkspace((state) => state.benchmarkSettings);
  const [draft, setDraft] = useState(settings);

  function numberField(
    key:
      'measuredRuns' | 'warmupRuns' | 'timeoutSeconds' | 'equivalenceRowLimit',
    label: string,
    min: number,
    max: number,
  ) {
    return (
      <label className="grid grid-cols-[1fr_110px] items-center gap-3 text-xs">
        <span>{label}</span>
        <Input
          name={key}
          autoComplete="off"
          type="number"
          min={min}
          max={max}
          value={draft[key]}
          onChange={(event) =>
            setDraft({ ...draft, [key]: Number(event.target.value) })
          }
        />
      </label>
    );
  }

  return (
    <div className="grid gap-3">
      {numberField('measuredRuns', 'Measured runs', 3, 20)}
      {numberField('warmupRuns', 'Warm-ups', 0, 5)}
      {numberField('timeoutSeconds', 'Timeout (seconds)', 1, 60)}
      {numberField('equivalenceRowLimit', 'Equivalence row limit', 1, 100_000)}
      <label className="grid grid-cols-[1fr_110px] items-center gap-3 text-xs">
        <span>Equivalence mode</span>
        <NativeSelect
          value={draft.equivalenceMode}
          name="equivalence-mode"
          onChange={(event) =>
            setDraft({
              ...draft,
              equivalenceMode: event.target.value as 'relational' | 'strict',
            })
          }
          className="w-[110px]"
          size="sm"
        >
          <NativeSelectOption value="relational">Relational</NativeSelectOption>
          <NativeSelectOption value="strict">Strict</NativeSelectOption>
        </NativeSelect>
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onCloseAction}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            WorkspaceCommands.updateBenchmarkSettings(draft);
            onCloseAction();
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}
