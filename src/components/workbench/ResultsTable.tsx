'use client';

import { useWorkspace } from '@/workspace/useWorkspace';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Clock, Table2 } from 'lucide-react';
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut';

export function ResultsTable() {
  const result = useWorkspace((state) => state.lastResult);

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <Table2 className="w-10 h-10 mb-2 opacity-30 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground/80">
          No query results yet
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-sm mt-1">
          Click{' '}
          <span className="text-emerald-400">
            Run <KeyboardShortcut keys={['⌘', '↵']} />
          </span>{' '}
          above to execute the active SQL query against the in-browser
          PostgreSQL database.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-xs">
      {/* Table Summary Bar */}
      <div className="px-3 py-1.5 border-b border-border/70 bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-muted-foreground select-none">
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Query Results</span>
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 font-mono border-border/60"
          >
            {result.totalRowCount.toLocaleString()} rows returned
          </Badge>
          {result.isTruncated && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-400 font-mono"
            >
              Previewing first {result.rows.length} rows
            </Badge>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
          <Clock className="w-3.5 h-3.5" />
          <span>{result.durationMs} ms</span>
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-12 text-[10px] font-mono text-muted-foreground/60 text-center">
                #
              </TableHead>
              {result.columns.map((col) => (
                <TableHead
                  key={col}
                  className="text-[11px] font-mono font-semibold text-foreground"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, idx) => (
              <TableRow
                key={idx}
                className="border-border/40 hover:bg-accent/30 font-mono text-[11px]"
              >
                <TableCell className="text-center text-muted-foreground/50 text-[10px] py-1.5">
                  {idx + 1}
                </TableCell>
                {result.columns.map((col) => {
                  const val = row[col];
                  const isNumber = typeof val === 'number';
                  return (
                    <TableCell
                      key={col}
                      className={`py-1.5 text-foreground/90 ${isNumber ? 'text-right text-sky-300' : ''}`}
                    >
                      {val === null || val === undefined ? (
                        <span className="text-muted-foreground/40 italic">
                          null
                        </span>
                      ) : typeof val === 'object' ? (
                        JSON.stringify(val)
                      ) : (
                        String(val)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
