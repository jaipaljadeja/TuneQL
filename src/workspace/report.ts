import type { WorkspaceState } from '@/types';

function sqlBlock(sql?: string) {
  return sql ? `\`\`\`sql\n${sql.trim()}\n\`\`\`` : '_Not available_';
}

export function buildOptimizationReport(state: WorkspaceState): string {
  const candidate = state.currentAttempt;
  const comparison = state.lastComparison;
  const lines = [
    `# TuneQL report — ${state.name}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> Benchmarks are local comparative measurements from browser-hosted PGlite. They are not production performance claims.',
    '',
    '## Workspace',
    '',
    `- Tables: ${state.schema.tables.length}`,
    `- Indexes: ${state.schema.indexes.length}`,
    `- Benchmark: ${state.benchmarkSettings.measuredRuns} measured run(s), ${state.benchmarkSettings.warmupRuns} warm-up(s), ${state.benchmarkSettings.timeoutSeconds}s timeout`,
    `- Equivalence: ${state.benchmarkSettings.equivalenceMode}, up to ${state.benchmarkSettings.equivalenceRowLimit.toLocaleString()} rows`,
    '',
    '## Baseline SQL',
    '',
    sqlBlock(state.baseline?.query),
    '',
    '## Candidate SQL',
    '',
    sqlBlock(candidate?.query ?? state.query),
    '',
    '## Index changes',
    '',
    ...(state.schema.indexes
      .filter((index) => !index.isProtected)
      .map(
        (index) =>
          `- ${index.name} on ${index.table} (${index.columns.join(', ')})`,
      ) || []),
    '',
    '## Benchmark evidence',
    '',
    `- Baseline runs: ${state.baseline?.benchmark?.runs.join(', ') || 'Not available'} ms`,
    `- Baseline median: ${state.baseline?.benchmark?.medianMs ?? 'Not available'} ms`,
    `- Candidate runs: ${candidate?.benchmark?.runs.join(', ') || 'Not available'} ms`,
    `- Candidate median: ${candidate?.benchmark?.medianMs ?? state.lastBenchmark?.medianMs ?? 'Not available'} ms`,
    `- Speedup: ${comparison ? `${comparison.speedup}x` : 'Not available'}`,
    `- Result equivalent: ${comparison ? (comparison.equivalent ? 'Yes' : 'No') : 'Not checked'}`,
    '',
    '## Plan findings',
    '',
    ...(state.lastPlan?.findings.length
      ? state.lastPlan.findings.map(
          (finding) => `- **${finding.title}:** ${finding.description}`,
        )
      : ['- No analyzed plan findings recorded.']),
    '',
    '## Constraints',
    '',
    `- Result equivalence required: ${state.constraints.requireEquivalentResults ? 'Yes' : 'No'}`,
    `- Query rewrite allowed: ${state.constraints.allowQueryRewrite ? 'Yes' : 'No'}`,
    `- Index creation allowed: ${state.constraints.allowIndexes ? 'Yes' : 'No'}`,
    `- Maximum new indexes: ${state.constraints.maxNewIndexes}`,
    `- Target runtime: ${state.constraints.targetRuntimeMs ? `${state.constraints.targetRuntimeMs} ms` : 'None'}`,
    '',
    '_Result row contents are intentionally excluded._',
    '',
  ];
  return lines.join('\n');
}
