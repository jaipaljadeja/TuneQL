'use client';

import { useState } from 'react';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, AlertCircle, Loader2 } from 'lucide-react';

interface CreateIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateIndexDialog({
  open,
  onOpenChange,
}: CreateIndexDialogProps) {
  const schema = useWorkspace((state) => state.schema);
  const ecommerceOrders = schema.tables.find(
    (table) => table.name === 'orders',
  );
  const [selectedTable, setSelectedTable] = useState(
    ecommerceOrders?.name ?? schema.tables[0]?.name ?? '',
  );
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    ecommerceOrders &&
      ['status', 'created_at'].every((name) =>
        ecommerceOrders.columns.some((column) => column.name === name),
      )
      ? ['status', 'created_at']
      : [],
  );
  const [customName, setCustomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tableObj = schema.tables.find((t) => t.name === selectedTable);
  const availableColumns = tableObj?.columns.map((c) => c.name) || [];

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  const generatedName =
    customName.trim() || `idx_${selectedTable}_${selectedColumns.join('_')}`;
  const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

  const handleCreate = async () => {
    if (selectedColumns.length === 0) {
      setError('Please select at least one column for the index.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await WorkspaceCommands.createIndex(
        selectedTable,
        selectedColumns,
        customName.trim() || undefined,
        'human',
      );
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground text-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>Create Structured PostgreSQL Index</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-2.5 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Table Selector */}
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Target Table
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono">
              {schema.tables.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    setSelectedTable(t.name);
                    setSelectedColumns([]);
                  }}
                  className={`p-2 rounded border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selectedTable === t.name
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400 font-bold'
                      : 'border-border/60 bg-background/40 hover:bg-accent text-muted-foreground'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Column Selector */}
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Select Columns ({selectedColumns.length} selected)
            </span>
            <div className="flex flex-wrap gap-1.5 font-mono">
              {availableColumns.map((col) => {
                const isSelected = selectedColumns.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleColumn(col)}
                    className={`px-2.5 py-1 rounded border text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-white font-bold'
                        : 'border-border/60 bg-background/40 hover:bg-accent text-foreground'
                    }`}
                  >
                    {col}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generated Name & Preview */}
          <div className="space-y-2">
            <div>
              <label
                htmlFor="candidate-index-name"
                className="text-[11px] font-semibold text-muted-foreground block mb-1"
              >
                Index Name (Optional)
              </label>
              <Input
                id="candidate-index-name"
                name="candidate-index-name"
                autoComplete="off"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={generatedName}
                className="h-8 text-xs font-mono bg-background/50 border-border/80"
              />
            </div>

            <div className="p-2.5 rounded bg-muted/40 border border-border/60 font-mono text-[11px] text-muted-foreground">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/60 block mb-1">
                Generated DDL
              </span>
              <code className="text-emerald-400">
                CREATE INDEX {quote(generatedName)} ON {quote(selectedTable)} (
                {selectedColumns.length
                  ? selectedColumns.map(quote).join(', ')
                  : '…'}
                );
              </code>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || selectedColumns.length === 0}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
          >
            {isCreating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span>Create Index</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
