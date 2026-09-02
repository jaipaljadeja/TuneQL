'use client';

import { Database, FileDiff } from 'lucide-react';
import type { IndexInfo } from '@/types';

type DiffLine = { kind: 'same' | 'added' | 'removed'; value: string };

function diffLines(before: string, after: string): DiffLine[] {
  const left = before.trim().split('\n');
  const right = after.trim().split('\n');
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', value: left[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ kind: 'removed', value: left[i] });
      i += 1;
    } else {
      lines.push({ kind: 'added', value: right[j] });
      j += 1;
    }
  }
  while (i < left.length) lines.push({ kind: 'removed', value: left[i++] });
  while (j < right.length) lines.push({ kind: 'added', value: right[j++] });
  return lines;
}

function indexKey(index: IndexInfo) {
  return `${index.table}.${index.name}`;
}

interface OptimizationChangesProps {
  baselineQuery: string;
  candidateQuery: string;
  baselineIndexes: IndexInfo[];
  candidateIndexes: IndexInfo[];
}

export function OptimizationChanges({
  baselineQuery,
  candidateQuery,
  baselineIndexes,
  candidateIndexes,
}: OptimizationChangesProps) {
  const queryChanged = baselineQuery.trim() !== candidateQuery.trim();
  const lines = queryChanged ? diffLines(baselineQuery, candidateQuery) : [];
  const baselineKeys = new Set(baselineIndexes.map(indexKey));
  const candidateKeys = new Set(candidateIndexes.map(indexKey));
  const addedIndexes = candidateIndexes.filter(
    (index) => !baselineKeys.has(indexKey(index)),
  );
  const removedIndexes = baselineIndexes.filter(
    (index) => !candidateKeys.has(indexKey(index)),
  );

  return (
    <section className="rounded-lg border border-border/70 bg-card/30">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground">
            What changed
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Candidate changes measured against the saved baseline.
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {queryChanged ? 'Query rewritten' : 'Query unchanged'} ·{' '}
          {addedIndexes.length} index added
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-[minmax(0,1fr)_18rem] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileDiff className="size-3.5 text-sky-400" />
            SQL diff
          </div>
          {queryChanged ? (
            <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-background/70 py-1 font-mono text-[11px] leading-5">
              {lines.map((line, index) => (
                <div
                  key={`${index}-${line.value}`}
                  className={
                    line.kind === 'added'
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : line.kind === 'removed'
                        ? 'bg-rose-500/10 text-rose-300'
                        : 'text-muted-foreground/75'
                  }
                >
                  <span className="inline-block w-7 select-none pr-2 text-right text-muted-foreground/50">
                    {line.kind === 'added'
                      ? '+'
                      : line.kind === 'removed'
                        ? '−'
                        : ' '}
                  </span>
                  <span className="whitespace-pre">{line.value || ' '}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border/60 bg-background/40 px-3 py-4 text-[11px] text-muted-foreground">
              SQL is unchanged. The measured improvement comes from the index
              configuration.
            </div>
          )}
        </div>

        <div className="p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Database className="size-3.5 text-emerald-400" />
            Index changes
          </div>
          <div className="space-y-2">
            {addedIndexes.map((index) => (
              <div
                key={indexKey(index)}
                className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-emerald-300">
                    + {index.name}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {index.table} ({index.columns.join(', ')})
                </p>
              </div>
            ))}
            {removedIndexes.map((index) => (
              <div
                key={indexKey(index)}
                className="rounded-md border border-rose-500/25 bg-rose-500/5 p-2.5"
              >
                <span className="font-mono text-xs font-medium text-rose-300">
                  − {index.name}
                </span>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {index.table} ({index.columns.join(', ')})
                </p>
              </div>
            ))}
            {addedIndexes.length === 0 && removedIndexes.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-background/40 px-3 py-4 text-[11px] text-muted-foreground">
                No index changes from baseline.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
