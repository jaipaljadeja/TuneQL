'use client';

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspace } from '@/workspace/useWorkspace';
import { WorkspaceCommands } from '@/workspace/commands';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OptimizationChanges } from '@/components/workbench/OptimizationChanges';
import {
  Scale,
  CheckCircle2,
  XCircle,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export function ComparisonPanel() {
  const workspace = useWorkspace(
    useShallow((state) => ({
      baseline: state.baseline,
      benchmarkSettings: state.benchmarkSettings,
      lastBenchmark: state.lastBenchmark,
      lastComparison: state.lastComparison,
      lastPlan: state.lastPlan,
      schema: state.schema,
      query: state.query,
    })),
  );
  const baseline = workspace.baseline;
  const comparison = workspace.lastComparison;
  const [isComparing, setIsComparing] = React.useState(false);
  const mode = workspace.benchmarkSettings.equivalenceMode;
  const [error, setError] = React.useState<string | null>(null);

  const handleRunComparison = async (selectedMode = mode) => {
    if (!baseline) return;
    setIsComparing(true);
    setError(null);
    try {
      await WorkspaceCommands.compareToBaseline(selectedMode, 'human');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComparing(false);
    }
  };

  if (!baseline) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <Scale className="w-10 h-10 mb-2 opacity-30 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground/80">
          No baseline established
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-sm mt-1">
          Click <span className="font-mono text-sky-400">Set Baseline</span> in
          the top toolbar to record the initial slow query state before
          benchmarking candidate optimizations.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 space-y-4 text-xs">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {/* Comparison Headline Hero */}
      {comparison ? (
        <div
          className={`p-4 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs ${
            comparison.speedup >= 1.2 && comparison.equivalent
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : !comparison.equivalent
                ? 'border-rose-500/40 bg-rose-500/10'
                : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                comparison.speedup >= 1.2 && comparison.equivalent
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : !comparison.equivalent
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Zap className="w-6 h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold font-mono text-foreground">
                  {comparison.speedup >= 1
                    ? `${comparison.speedup}× Faster`
                    : `${(1 / comparison.speedup).toFixed(2)}× Slower`}
                </span>
                {comparison.equivalent ? (
                  <Badge className="bg-emerald-500 text-white font-semibold text-[10px] gap-1 py-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    Equivalent Results
                  </Badge>
                ) : (
                  <Badge
                    variant="destructive"
                    className="font-semibold text-[10px] gap-1 py-0.5"
                  >
                    <XCircle className="w-3 h-3" />
                    Results Diverged
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reduced runtime by{' '}
                <span className="font-semibold text-foreground font-mono">
                  {comparison.improvementPercent}%
                </span>{' '}
                from {comparison.baselineMedianMs} ms down to{' '}
                {comparison.candidateMedianMs} ms.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextMode =
                  mode === 'relational' ? 'strict' : 'relational';
                WorkspaceCommands.updateBenchmarkSettings({
                  equivalenceMode: nextMode,
                });
                handleRunComparison(nextMode);
              }}
              className="h-8 text-xs font-mono border-border/80 text-foreground"
            >
              Mode: {mode === 'relational' ? 'Relational' : 'Strict (Ordered)'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleRunComparison()}
              disabled={isComparing}
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${isComparing ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              <span>Re-compare</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-border/70 bg-card/30 flex items-center justify-between">
          <div>
            <span className="font-semibold text-foreground text-sm">
              Baseline established
            </span>
            <p className="text-xs text-muted-foreground">
              Baseline median:{' '}
              <span className="font-mono text-foreground font-medium">
                {baseline.benchmark?.medianMs} ms
              </span>
              . Ready to evaluate current candidate.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => handleRunComparison()}
            disabled={isComparing}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <span>Compare Candidate</span>
          </Button>
        </div>
      )}

      {/* Side-by-side Baseline vs Candidate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Baseline Card */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider text-sky-400">
                Baseline
              </span>
              <Badge
                variant="outline"
                className="text-[9px] font-mono border-border/60"
              >
                Original State
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">
                {baseline.benchmark?.medianMs}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ms median
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1 font-mono pt-1 border-t border-border/40">
              <div className="truncate">
                Plan: {baseline.plan?.rootNode.nodeType || 'Full Scan'}
              </div>
              <div>User Indexes: {baseline.userIndexes.length}</div>
            </div>
          </CardContent>
        </Card>

        {/* Candidate Card */}
        <Card className="border-border/70 bg-card/40">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                Current Candidate
              </span>
              <Badge
                variant="outline"
                className="text-[9px] font-mono border-emerald-500/40 text-emerald-300"
              >
                Active Optimization
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {comparison?.candidateMedianMs ??
                  workspace.lastBenchmark?.medianMs ??
                  '—'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ms median
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1 font-mono pt-1 border-t border-border/40">
              <div className="truncate">
                Plan: {workspace.lastPlan?.rootNode.nodeType || '—'}
              </div>
              <div>
                User Indexes:{' '}
                {workspace.schema.indexes.filter((i) => !i.isProtected).length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {comparison && (
        <OptimizationChanges
          baselineQuery={baseline.query}
          candidateQuery={workspace.query}
          baselineIndexes={baseline.userIndexes}
          candidateIndexes={workspace.schema.indexes.filter(
            (index) => !index.isProtected,
          )}
        />
      )}

      {/* Constraints & Guardrails Evaluation */}
      {comparison && (
        <div className="p-4 rounded-lg border border-border/70 bg-card/30 flex flex-col gap-3">
          <h3 className="font-semibold text-foreground text-xs">
            Constraint & Guardrail Verification
          </h3>
          <div className="space-y-2">
            {comparison.constraintResults.map((c, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-md border flex items-start justify-between gap-2 text-[11px] ${
                  c.passed
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                    : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                <div className="flex items-start gap-2">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold">{c.name}</span>
                    <p className="text-[10px] text-muted-foreground">
                      {c.message}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={c.passed ? 'outline' : 'destructive'}
                  className="text-[9px] py-0 px-1 font-mono uppercase"
                >
                  {c.passed ? 'Pass' : 'Violation'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
