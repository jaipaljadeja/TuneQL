import { describe, it, expect } from 'vitest';
import { calculateBenchmarkStats } from '../src/engine/benchmarking';

describe('Benchmarking Statistics', () => {
  it('calculates odd-length median correctly', () => {
    const runs = [105, 92, 88, 140, 95]; // sorted: [88, 92, 95, 105, 140]
    const stats = calculateBenchmarkStats(runs, 1);

    expect(stats.medianMs).toBe(95);
    expect(stats.minMs).toBe(88);
    expect(stats.maxMs).toBe(140);
    expect(stats.warmupRuns).toBe(1);
    expect(stats.runs).toEqual(runs);
  });

  it('calculates even-length median correctly', () => {
    const runs = [100, 90, 80, 110]; // sorted: [80, 90, 100, 110]
    const stats = calculateBenchmarkStats(runs, 1);

    expect(stats.medianMs).toBe(95); // (90 + 100) / 2
    expect(stats.minMs).toBe(80);
    expect(stats.maxMs).toBe(110);
  });

  it('handles empty runs gracefully', () => {
    const stats = calculateBenchmarkStats([], 1);
    expect(stats.medianMs).toBe(0);
    expect(stats.runs.length).toBe(0);
  });
});
