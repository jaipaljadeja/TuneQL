'use client';

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut';
import {
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  History,
  Bot,
  User,
} from 'lucide-react';

interface PerformanceInspectorProps {
  onOpenConstraints: () => void;
}

export function PerformanceInspector({
  onOpenConstraints,
}: PerformanceInspectorProps) {
  const workspace = useWorkspace(
    useShallow((state) => ({
      attempts: state.attempts,
      baseline: state.baseline,
      constraints: state.constraints,
      lastBenchmark: state.lastBenchmark,
      lastComparison: state.lastComparison,
      lastPlan: state.lastPlan,
      schema: state.schema,
    })),
  );
  const comparison = workspace.lastComparison;
  const baseline = workspace.baseline;
  const plan = workspace.lastPlan;
  const [attemptToRestore, setAttemptToRestore] = React.useState<string>();

  return (
    <aside className="min-w-0 bg-card/40 flex flex-col h-full select-none text-xs">
      {/* Inspector Header */}
      <div className="p-3 border-b border-border/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Performance Inspector</span>
        </div>
        {comparison && (
          <Badge
            variant="outline"
            className={`text-[10px] font-mono font-bold ${
              comparison.speedup >= 1.2 && comparison.equivalent
                ? 'border-emerald-500/40 text-emerald-400'
                : 'border-border/60 text-muted-foreground'
            }`}
          >
            {comparison.speedup}× Speedup
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Section 1: Optimization Summary */}
        <div className="p-3 rounded-lg border border-border/70 bg-card/50 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              Optimization Metrics
            </span>
            {comparison?.equivalent ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Equivalent
              </span>
            ) : comparison ? (
              <span className="flex items-center gap-1 text-[10px] text-destructive font-semibold">
                <XCircle className="w-3 h-3" /> Mismatch
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="p-2 rounded bg-muted/30 border border-border/40 font-mono">
              <span className="text-[9px] text-muted-foreground uppercase">
                Baseline
              </span>
              <div className="text-base font-bold text-foreground">
                {baseline?.benchmark?.medianMs
                  ? `${baseline.benchmark.medianMs} ms`
                  : '—'}
              </div>
            </div>
            <div className="p-2 rounded bg-muted/30 border border-border/40 font-mono">
              <span className="text-[9px] text-muted-foreground uppercase">
                Candidate
              </span>
              <div className="text-base font-bold text-emerald-400">
                {workspace.lastBenchmark?.medianMs
                  ? `${workspace.lastBenchmark.medianMs} ms`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Active Constraints & Guardrails */}
        <div className="p-3 rounded-lg border border-border/70 bg-card/50 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              Guardrails & Constraints
            </span>
            <button
              onClick={onOpenConstraints}
              className="text-[10px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-0.5"
            >
              <SlidersHorizontal className="w-2.5 h-2.5" /> Edit
            </button>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Target Runtime:</span>
              <span className="text-foreground font-semibold">
                {workspace.constraints.targetRuntimeMs
                  ? `< ${workspace.constraints.targetRuntimeMs} ms`
                  : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Equivalence:</span>
              <span className="text-emerald-400 font-semibold">Mandatory</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Query Rewrite:</span>
              <span
                className={
                  workspace.constraints.allowQueryRewrite
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }
              >
                {workspace.constraints.allowQueryRewrite
                  ? 'Allowed'
                  : 'Prohibited'}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Max New Indexes:</span>
              <span className="text-foreground font-semibold">
                {workspace.schema.indexes.filter((i) => !i.isProtected).length}{' '}
                / {workspace.constraints.maxNewIndexes}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Deterministic Plan Findings */}
        <div>
          <div className="px-1 py-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center justify-between">
            <span>Deterministic Plan Findings</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {plan?.findings.length || 0}
            </span>
          </div>

          <div className="space-y-2 mt-1">
            {plan?.findings && plan.findings.length > 0 ? (
              plan.findings.map((f) => (
                <div
                  key={f.id}
                  className={`p-2 rounded-md border space-y-1 text-[11px] ${
                    f.severity === 'high'
                      ? 'border-rose-500/40 bg-rose-500/5 text-rose-300'
                      : f.severity === 'medium'
                        ? 'border-amber-500/40 bg-amber-500/5 text-amber-300'
                        : 'border-sky-500/40 bg-sky-500/5 text-sky-300'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {f.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal [overflow-wrap:anywhere]">
                    {f.description}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-md border border-border/40 bg-background/20 text-center text-muted-foreground text-[11px]">
                Run{' '}
                <span className="text-sky-400">
                  Explain <KeyboardShortcut keys={['⌘', '⇧', 'E']} />
                </span>{' '}
                to analyze execution bottlenecks.
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Attempt History & Restore */}
        <div>
          <div className="px-1 py-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <History className="w-3 h-3" /> Attempt History
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {workspace.attempts.length} attempts
            </span>
          </div>

          <div className="space-y-1.5 mt-1">
            {/* Baseline Attempt */}
            {baseline && (
              <div className="p-2 rounded-md border border-sky-500/30 bg-sky-500/5 flex items-center justify-between gap-1 text-[11px]">
                <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-sky-400 font-mono">
                    #0 (Baseline)
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {baseline.benchmark?.medianMs} ms
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAttemptToRestore(baseline.id)}
                  className="h-5 shrink-0 px-1.5 text-[10px] hover:text-sky-300 gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Restore
                </Button>
              </div>
            )}

            {/* Candidate Attempts */}
            {workspace.attempts.map((att) => (
              <div
                key={att.id}
                className="p-2 rounded-md border border-border/50 bg-background/20 flex items-center justify-between gap-1 text-[11px] font-mono"
              >
                <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                  {att.source === 'agent' ? (
                    <span title="Agent action" aria-label="Agent action">
                      <Bot className="w-3 h-3 text-indigo-400 shrink-0" />
                    </span>
                  ) : (
                    <span title="Human action" aria-label="Human action">
                      <User className="w-3 h-3 text-sky-400 shrink-0" />
                    </span>
                  )}
                  <span className="font-bold text-foreground">
                    #{att.sequence}
                  </span>
                  <span className="text-muted-foreground">
                    {att.benchmark?.medianMs} ms
                  </span>
                  {att.comparison?.speedup && (
                    <span className="text-emerald-400 font-bold">
                      {att.comparison.speedup}x
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAttemptToRestore(att.id)}
                  className="h-5 shrink-0 px-1.5 text-[10px] hover:text-emerald-400 gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ConfirmActionDialog
        open={!!attemptToRestore}
        onOpenChange={(open) => {
          if (!open) setAttemptToRestore(undefined);
        }}
        title="Restore this attempt?"
        description="The editor and candidate indexes will be restored atomically. Current unbenchmarked changes will be replaced."
        confirmLabel="Restore Attempt"
        onConfirm={() =>
          attemptToRestore
            ? WorkspaceCommands.restoreAttempt(attemptToRestore, 'human')
            : Promise.resolve()
        }
      />
    </aside>
  );
}
