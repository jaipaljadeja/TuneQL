'use client';

import React from 'react';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
  Table2,
  Key,
  Database,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface SchemaExplorerProps {
  onOpenCreateIndex: () => void;
}

export function SchemaExplorer({ onOpenCreateIndex }: SchemaExplorerProps) {
  const schema = useWorkspace((state) => state.schema);
  const [expandedTables, setExpandedTables] = React.useState<
    Record<string, boolean>
  >({
    orders: true,
    customers: false,
    order_items: false,
    products: false,
  });
  const [indexToDrop, setIndexToDrop] = React.useState<string>();

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  const userIndexes = schema.indexes.filter((i) => !i.isProtected);
  const protectedIndexes = schema.indexes.filter((i) => i.isProtected);

  return (
    <aside className="min-w-0 bg-card/40 flex flex-col h-full select-none text-xs">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-border/80 flex items-center justify-between">
        <div className="min-w-0 flex items-center gap-1.5 font-semibold text-foreground">
          <Database className="w-3.5 h-3.5 shrink-0 text-sky-400" />
          <span className="truncate">Schema & Indexes</span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {schema.tables.length} tables
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Tables Section */}
        <div>
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 flex items-center justify-between">
            <span>Tables</span>
          </div>

          <div className="space-y-1 mt-1">
            {schema.tables.map((table) => {
              const isExpanded = !!expandedTables[table.name];
              return (
                <div
                  key={table.name}
                  className="rounded-md border border-border/40 bg-background/30 overflow-hidden"
                >
                  <button
                    onClick={() => toggleTable(table.name)}
                    className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-accent/40 transition-colors"
                  >
                    <div className="min-w-0 flex flex-1 items-center gap-1.5 font-medium text-foreground">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <Table2 className="w-3.5 h-3.5 text-sky-400" />
                      <span className="truncate" title={table.name}>
                        {table.name}
                      </span>
                    </div>
                    <span className="shrink-0 pl-2 text-[10px] text-muted-foreground font-mono">
                      {table.estimatedRows.toLocaleString()} rows
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-2.5 py-1.5 bg-muted/20 border-t border-border/30 space-y-1 font-mono text-[11px]">
                      {table.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between py-0.5 text-muted-foreground"
                        >
                          <div className="min-w-0 flex flex-1 items-center gap-1.5">
                            {col.name === 'id' ? (
                              <Key className="w-3 h-3 text-amber-400 shrink-0" />
                            ) : (
                              <span className="w-3 text-center text-muted-foreground/50">
                                ·
                              </span>
                            )}
                            <span
                              className="truncate text-foreground/90"
                              title={col.name}
                            >
                              {col.name}
                            </span>
                          </div>
                          <span
                            className="max-w-[45%] shrink-0 truncate pl-2 text-[10px] text-muted-foreground/70"
                            title={col.type}
                          >
                            {col.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Indexes Section */}
        <div>
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 flex items-center justify-between">
            <span>Indexes ({schema.indexes.length})</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenCreateIndex}
              className="h-5 px-1.5 text-[10px] gap-1 hover:text-emerald-400 text-muted-foreground"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </Button>
          </div>

          <div className="space-y-1.5 mt-1">
            {/* User Candidate Indexes */}
            {userIndexes.map((idx) => (
              <div
                key={idx.name}
                className="p-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 flex flex-col gap-1 shadow-xs"
              >
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <div className="min-w-0 flex items-center gap-1 font-medium text-emerald-400">
                    <Zap className="w-3 h-3 shrink-0 text-emerald-400" />
                    <span
                      className="truncate font-mono text-[11px]"
                      title={idx.name}
                    >
                      {idx.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIndexToDrop(idx.name)}
                    className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Drop Index"
                    aria-label={`Drop index ${idx.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="min-w-0 font-mono text-[10px] text-muted-foreground [overflow-wrap:anywhere]">
                  <span className="text-foreground/80">{idx.table}</span>{' '}
                  <span>({idx.columns.join(', ')})</span>
                </div>
                <Badge
                  variant="outline"
                  className="w-fit text-[9px] py-0 px-1 border-emerald-500/30 text-emerald-300 font-mono"
                >
                  Candidate Index
                </Badge>
              </div>
            ))}

            {/* Built-in / Protected Indexes */}
            {protectedIndexes.map((idx) => (
              <div
                key={idx.name}
                className="p-2 rounded-md border border-border/40 bg-background/20 flex flex-col gap-0.5 opacity-80"
              >
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <span
                    className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                    title={idx.name}
                  >
                    {idx.name}
                  </span>
                  <span title="Protected System Index">
                    <ShieldCheck className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                  </span>
                </div>
                <div className="min-w-0 font-mono text-[10px] text-muted-foreground/70 [overflow-wrap:anywhere]">
                  <span>{idx.table}</span>{' '}
                  <span>({idx.columns.join(', ')})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ConfirmActionDialog
        open={!!indexToDrop}
        onOpenChange={(open) => {
          if (!open) setIndexToDrop(undefined);
        }}
        title="Drop candidate index?"
        description={`PostgreSQL will drop “${indexToDrop ?? ''}”. Existing benchmark and comparison evidence will be cleared.`}
        confirmLabel="Drop Index"
        destructive
        onConfirm={() =>
          indexToDrop
            ? WorkspaceCommands.dropIndex(indexToDrop, 'human')
            : Promise.resolve()
        }
      />
    </aside>
  );
}
