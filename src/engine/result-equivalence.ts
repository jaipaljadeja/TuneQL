import { FullQueryResult, ResultColumn, ResultFingerprint } from '@/types';

export interface EquivalenceCheckResult {
  equivalent: boolean;
  mode: 'relational' | 'strict';
  baselineCount: number;
  candidateCount: number;
  diffSummary?: string;
  baselineColumns: string[];
  candidateColumns: string[];
}

function canonicalValue(value: unknown): unknown {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];
  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return ['number', 'NaN'];
    if (value === Infinity) return ['number', 'Infinity'];
    if (value === -Infinity) return ['number', '-Infinity'];
    if (Object.is(value, -0)) return ['number', '-0'];
    return ['number', value];
  }
  if (value instanceof Date) return ['date', value.toISOString()];
  if (value instanceof Uint8Array) {
    return [
      'bytes',
      Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    ];
  }
  if (Array.isArray(value)) return ['array', value.map(canonicalValue)];
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalValue(nested)]);
    return ['object', entries];
  }
  return [typeof value, String(value)];
}

function normalizeRow(row: Record<string, unknown>): string {
  const entries = Object.keys(row)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => [key, canonicalValue(row[key])]);
  return JSON.stringify(entries);
}

function columnSignature(columns: ResultColumn[]): string {
  return JSON.stringify(
    columns.map((column) => [column.name, column.dataTypeId ?? null]),
  );
}

function inferColumns(rows: Record<string, unknown>[]): ResultColumn[] {
  return rows[0] ? Object.keys(rows[0]).map((name) => ({ name })) : [];
}

function toResult(
  rowsOrResult: Record<string, unknown>[] | FullQueryResult,
  columns?: ResultColumn[],
): FullQueryResult {
  if (Array.isArray(rowsOrResult)) {
    return {
      rows: rowsOrResult,
      columns: columns ?? inferColumns(rowsOrResult),
    };
  }
  return rowsOrResult;
}

/** Performs exact, full-result comparison with ordered and multiset modes. */
export function verifyResultEquivalence(
  baselineInput: Record<string, unknown>[] | FullQueryResult,
  candidateInput: Record<string, unknown>[] | FullQueryResult,
  mode: 'relational' | 'strict' = 'relational',
): EquivalenceCheckResult {
  const baseline = toResult(baselineInput);
  const candidate = toResult(candidateInput);
  const baselineCount = baseline.rows.length;
  const candidateCount = candidate.rows.length;
  const baselineColumns = baseline.columns.map((column) => column.name);
  const candidateColumns = candidate.columns.map((column) => column.name);

  if (
    columnSignature(baseline.columns) !== columnSignature(candidate.columns)
  ) {
    return {
      equivalent: false,
      mode,
      baselineCount,
      candidateCount,
      diffSummary: `Column mismatch: Baseline [${baselineColumns.join(', ')}] vs Candidate [${candidateColumns.join(', ')}].`,
      baselineColumns,
      candidateColumns,
    };
  }

  if (baselineCount !== candidateCount) {
    return {
      equivalent: false,
      mode,
      baselineCount,
      candidateCount,
      diffSummary: `Row count mismatch: Baseline returned ${baselineCount.toLocaleString()} rows, Candidate returned ${candidateCount.toLocaleString()} rows.`,
      baselineColumns,
      candidateColumns,
    };
  }

  if (mode === 'strict') {
    for (let i = 0; i < baselineCount; i++) {
      if (normalizeRow(baseline.rows[i]) !== normalizeRow(candidate.rows[i])) {
        return {
          equivalent: false,
          mode,
          baselineCount,
          candidateCount,
          diffSummary: `Row mismatch at index ${i}: Candidate differs from Baseline under strict ordering.`,
          baselineColumns,
          candidateColumns,
        };
      }
    }
    return {
      equivalent: true,
      mode,
      baselineCount,
      candidateCount,
      baselineColumns,
      candidateColumns,
    };
  }

  const baselineMap = new Map<string, number>();
  for (const row of baseline.rows) {
    const key = normalizeRow(row);
    baselineMap.set(key, (baselineMap.get(key) ?? 0) + 1);
  }

  const candidateMap = new Map<string, number>();
  for (const row of candidate.rows) {
    const key = normalizeRow(row);
    candidateMap.set(key, (candidateMap.get(key) ?? 0) + 1);
  }

  if (baselineMap.size !== candidateMap.size) {
    return {
      equivalent: false,
      mode,
      baselineCount,
      candidateCount,
      diffSummary: `Result content mismatch: Baseline has ${baselineMap.size} unique rows, Candidate has ${candidateMap.size}.`,
      baselineColumns,
      candidateColumns,
    };
  }

  for (const [key, baselineFrequency] of baselineMap) {
    if ((candidateMap.get(key) ?? 0) !== baselineFrequency) {
      return {
        equivalent: false,
        mode,
        baselineCount,
        candidateCount,
        diffSummary:
          'Row frequency mismatch: at least one record occurs a different number of times.',
        baselineColumns,
        candidateColumns,
      };
    }
  }

  return {
    equivalent: true,
    mode,
    baselineCount,
    candidateCount,
    baselineColumns,
    candidateColumns,
  };
}

export function computeResultFingerprint(
  resultInput: Record<string, unknown>[] | FullQueryResult,
): ResultFingerprint {
  const result = toResult(resultInput);
  return {
    rowCount: result.rows.length,
    columns: result.columns.map((column) => column.name),
    sampleSignature: result.rows.slice(0, 3).map(normalizeRow).join(';'),
  };
}
