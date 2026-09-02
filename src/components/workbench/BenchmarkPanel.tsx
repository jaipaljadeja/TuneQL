'use client';

import { useWorkspace } from '@/workspace/useWorkspace';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut';
import { Timer, Zap, Info, TrendingUp, BarChart3 } from 'lucide-react';

export function BenchmarkPanel() {
  const benchmark = useWorkspace((state) => state.lastBenchmark);

  if (!benchmark) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none">
        <Timer className="w-10 h-10 mb-2 opacity-30 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground/80">
          No benchmark executed yet
        </p>
        <p className="text-xs text-muted-foreground/70 max-w-sm mt-1">
          Click{' '}
          <span className="text-amber-400">
            Benchmark <KeyboardShortcut keys={['⌘', '⇧', 'B']} />
          </span>{' '}
          to run the configured local execution test.
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...benchmark.runs, 1);

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 space-y-4 text-xs">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Median */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                Median Runtime
              </span>
              <Timer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {benchmark.medianMs}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ms
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Primary headline metric
            </p>
          </CardContent>
        </Card>

        {/* Min */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                Min Run
              </span>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {benchmark.minMs}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ms
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Fastest iteration
            </p>
          </CardContent>
        </Card>

        {/* Max */}
        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Max Run
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {benchmark.maxMs}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ms
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Slowest iteration
            </p>
          </CardContent>
        </Card>

        {/* Mean */}
        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Mean Average
              </span>
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {benchmark.meanMs}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ms
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Across {benchmark.runs.length} runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Individual Runs Visualization */}
      <div className="p-4 rounded-lg border border-border/70 bg-card/30 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground text-xs">
            Measured Benchmark Iterations
          </span>
          <Badge
            variant="outline"
            className="text-[10px] py-0 font-mono border-border/60 text-muted-foreground"
          >
            {benchmark.warmupRuns} Warmup + {benchmark.runs.length} Measured
          </Badge>
        </div>

        <div className="space-y-2 font-mono text-[11px]">
          {benchmark.runs.map((timing, idx) => {
            const percent = (timing / maxVal) * 100;
            const isMedian = timing === benchmark.medianMs;
            return (
              <div key={idx} className="flex items-center gap-3">
                <span className="w-12 text-muted-foreground text-[10px]">
                  Run #{idx + 1}
                </span>
                <div className="flex-1 h-5 rounded bg-muted/40 overflow-hidden relative flex items-center">
                  <div
                    className={`h-full rounded ${
                      isMedian ? 'bg-amber-500/80' : 'bg-sky-500/50'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                  <span className="absolute left-2 text-[10px] font-bold text-white drop-shadow-xs">
                    {timing.toFixed(1)} ms
                  </span>
                </div>
                {isMedian && (
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 px-1 border-amber-500/50 text-amber-400 shrink-0"
                  >
                    Median
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-2.5 rounded-md border border-border/40 bg-muted/20 text-muted-foreground text-[11px]">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <span>
          Local benchmarks run inside browser-based PostgreSQL (PGlite WASM) and
          are intended for relative experimentation and candidate comparison.
          Production timings may differ.
        </span>
      </div>
    </div>
  );
}
