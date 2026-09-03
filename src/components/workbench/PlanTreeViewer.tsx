'use client';

import { useWorkspace } from '@/workspace/useWorkspace';
import { PlanNode } from '@/types';
import { Badge } from '@/components/ui/badge';
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut';
import {
  GitCommit,
  AlertTriangle,
  Filter,
  CheckCircle2,
  TrendingDown,
} from 'lucide-react';

export function PlanTreeViewer() {
  const plan = useWorkspace((state) => state.lastPlan);

  if (!plan) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <GitCommit className="w-10 h-10 mb-2 opacity-30 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground/80">
          No execution plan analyzed
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-sm mt-1">
          Click{' '}
          <span className="text-sky-400">
            Explain <KeyboardShortcut keys={['⌘', '⇧', 'E']} />
          </span>{' '}
          to analyze the PostgreSQL query plan and detect bottlenecks.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-xs">
      {/* Plan Header Bar */}
      <div className="px-3 py-2 border-b border-border/70 bg-muted/20 flex flex-wrap items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            PostgreSQL Execution Plan
          </span>
          {plan.executionTimeMs !== undefined && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-emerald-500/40 text-emerald-400"
            >
              Execution: {plan.executionTimeMs.toFixed(2)} ms
            </Badge>
          )}
          {plan.planningTimeMs !== undefined && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-border/60 text-muted-foreground"
            >
              Planning: {plan.planningTimeMs.toFixed(2)} ms
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {plan.findings.length > 0 ? (
            <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{plan.findings.length} heuristic finding(s) detected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>No major plan anomalies</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Tree Scrollable Content */}
      <div className="flex-1 overflow-auto p-4 space-y-3 font-mono">
        <PlanNodeCard node={plan.rootNode} depth={0} />
      </div>
    </div>
  );
}

function PlanNodeCard({ node, depth }: { node: PlanNode; depth: number }) {
  const isSeqScan = node.nodeType.toLowerCase().includes('seq scan');
  const isIndexScan = node.nodeType.toLowerCase().includes('index');
  const isExpensive =
    node.actualTotalTimeMs !== undefined && node.actualTotalTimeMs > 20;

  return (
    <div className="flex flex-col">
      <div
        className={`p-2.5 rounded-lg border transition-colors ${
          isSeqScan
            ? 'border-rose-500/40 bg-rose-500/5 hover:border-rose-500/60'
            : isIndexScan
              ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
              : isExpensive
                ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
                : 'border-border/60 bg-card/40 hover:border-border'
        }`}
        style={{ marginLeft: `${depth * 20}px` }}
      >
        {/* Node Title Line */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <span
              className={`font-semibold text-xs ${
                isSeqScan
                  ? 'text-rose-400'
                  : isIndexScan
                    ? 'text-emerald-400'
                    : 'text-foreground'
              }`}
            >
              {node.nodeType}
            </span>
            {node.relationName && (
              <span className="min-w-0 text-[11px] text-sky-400 font-medium [overflow-wrap:anywhere]">
                on {node.relationName}
              </span>
            )}
            {node.indexName && (
              <Badge
                variant="outline"
                className="max-w-full whitespace-normal px-1 py-0 text-[10px] font-mono border-emerald-500/30 text-emerald-300 [overflow-wrap:anywhere]"
              >
                using {node.indexName}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            {node.actualTotalTimeMs !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground/90 font-mono">
                {node.actualTotalTimeMs.toFixed(2)} ms
              </span>
            )}
            {node.actualRows !== undefined && (
              <span className="text-muted-foreground">
                rows={node.actualRows.toLocaleString()}
                {node.actualLoops && node.actualLoops > 1
                  ? ` (loops=${node.actualLoops})`
                  : ''}
              </span>
            )}
            <span className="text-muted-foreground/60">
              cost={node.startupCost.toFixed(2)}..{node.totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Additional Details (Filters, Drops, Conditions) */}
        {(node.filter ||
          node.rowsRemovedByFilter ||
          node.indexCond ||
          node.hashCond) && (
          <div className="mt-2 pt-1.5 border-t border-border/40 space-y-0.5 text-[10px] text-muted-foreground">
            {node.filter && (
              <div className="flex items-start gap-1.5 text-amber-300/90">
                <Filter className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  Filter: {node.filter}
                </span>
              </div>
            )}
            {node.rowsRemovedByFilter !== undefined &&
              node.rowsRemovedByFilter > 0 && (
                <div className="flex items-center gap-1.5 text-rose-300 font-medium">
                  <TrendingDown className="w-3 h-3 shrink-0 text-rose-400" />
                  <span>
                    Rows Removed by Filter:{' '}
                    {node.rowsRemovedByFilter.toLocaleString()} rows
                  </span>
                </div>
              )}
            {node.indexCond && (
              <div className="text-emerald-300/90 [overflow-wrap:anywhere]">
                <span>Index Cond: {node.indexCond}</span>
              </div>
            )}
            {node.hashCond && (
              <div className="text-muted-foreground [overflow-wrap:anywhere]">
                <span>Hash Cond: {node.hashCond}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Child Nodes */}
      {node.plans && node.plans.length > 0 && (
        <div className="space-y-2 mt-2">
          {node.plans.map((child) => (
            <PlanNodeCard key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
