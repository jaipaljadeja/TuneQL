import { BenchmarkResult } from '@/types';

export async function runControlledBenchmark(
  executeFn: () => Promise<void>,
  runs: number = 5,
  warmupRuns: number = 1,
): Promise<BenchmarkResult> {
  const safeRuns = Math.max(1, Math.min(20, runs));
  const safeWarmup = Math.max(0, Math.min(5, warmupRuns));

  // Warm-up runs to prime database cache / WASM JIT
  for (let w = 0; w < safeWarmup; w++) {
    await executeFn();
  }

  const runTimings: number[] = [];

  for (let i = 0; i < safeRuns; i++) {
    const start = performance.now();
    await executeFn();
    const duration = performance.now() - start;
    runTimings.push(Number(duration.toFixed(2)));
  }

  return calculateBenchmarkStats(runTimings, safeWarmup);
}

export function calculateBenchmarkStats(
  runTimings: number[],
  warmupRuns: number = 1,
): BenchmarkResult {
  if (runTimings.length === 0) {
    return {
      runs: [],
      warmupRuns,
      medianMs: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      executedAt: new Date().toISOString(),
    };
  }

  const sorted = [...runTimings].sort((a, b) => a - b);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const meanMs = Number((sum / sorted.length).toFixed(2));

  let medianMs: number;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    medianMs = Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  } else {
    medianMs = sorted[mid];
  }

  return {
    runs: runTimings,
    warmupRuns,
    medianMs,
    minMs,
    maxMs,
    meanMs,
    executedAt: new Date().toISOString(),
  };
}
