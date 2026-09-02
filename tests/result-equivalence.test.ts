import { describe, it, expect } from 'vitest';
import { verifyResultEquivalence } from '../src/engine/result-equivalence';

describe('Result Equivalence Engine', () => {
  const baseline = [
    {
      region: 'US-East',
      status: 'completed',
      total_revenue: 12500.5,
      order_count: 50,
    },
    {
      region: 'EU-West',
      status: 'completed',
      total_revenue: 8400.25,
      order_count: 32,
    },
    {
      region: 'APAC',
      status: 'completed',
      total_revenue: 6100.0,
      order_count: 24,
    },
  ];

  it('passes when candidate has identical rows in relational mode', () => {
    // Shuffled order
    const candidate = [
      {
        region: 'APAC',
        status: 'completed',
        total_revenue: 6100.0,
        order_count: 24,
      },
      {
        region: 'US-East',
        status: 'completed',
        total_revenue: 12500.5,
        order_count: 50,
      },
      {
        region: 'EU-West',
        status: 'completed',
        total_revenue: 8400.25,
        order_count: 32,
      },
    ];

    const res = verifyResultEquivalence(baseline, candidate, 'relational');
    expect(res.equivalent).toBe(true);
    expect(res.baselineCount).toBe(3);
    expect(res.candidateCount).toBe(3);
  });

  it('fails under strict mode when order differs', () => {
    const candidate = [
      {
        region: 'APAC',
        status: 'completed',
        total_revenue: 6100.0,
        order_count: 24,
      },
      {
        region: 'US-East',
        status: 'completed',
        total_revenue: 12500.5,
        order_count: 50,
      },
      {
        region: 'EU-West',
        status: 'completed',
        total_revenue: 8400.25,
        order_count: 32,
      },
    ];

    const res = verifyResultEquivalence(baseline, candidate, 'strict');
    expect(res.equivalent).toBe(false);
    expect(res.diffSummary).toContain('Row mismatch at index 0');
  });

  it('fails when row count differs', () => {
    const candidate = [
      {
        region: 'US-East',
        status: 'completed',
        total_revenue: 12500.5,
        order_count: 50,
      },
      {
        region: 'EU-West',
        status: 'completed',
        total_revenue: 8400.25,
        order_count: 32,
      },
    ];

    const res = verifyResultEquivalence(baseline, candidate, 'relational');
    expect(res.equivalent).toBe(false);
    expect(res.diffSummary).toContain('Row count mismatch');
  });

  it('fails when values differ', () => {
    const candidate = [
      {
        region: 'US-East',
        status: 'completed',
        total_revenue: 12500.5,
        order_count: 50,
      },
      {
        region: 'EU-West',
        status: 'completed',
        total_revenue: 9999.99,
        order_count: 32,
      }, // modified
      {
        region: 'APAC',
        status: 'completed',
        total_revenue: 6100.0,
        order_count: 24,
      },
    ];

    const res = verifyResultEquivalence(baseline, candidate, 'relational');
    expect(res.equivalent).toBe(false);
  });

  it('fails when column names differ', () => {
    const candidate = [
      { region: 'US-East', status: 'completed', revenue: 12500.5, count: 50 },
    ];

    const res = verifyResultEquivalence(baseline, candidate, 'relational');
    expect(res.equivalent).toBe(false);
    expect(res.diffSummary).toContain('Column mismatch');
  });

  it('does not coerce strings to numbers or round close numeric values', () => {
    expect(
      verifyResultEquivalence([{ value: '001' }], [{ value: 1 }], 'relational')
        .equivalent,
    ).toBe(false);
    expect(
      verifyResultEquivalence(
        [{ value: 1.0000001 }],
        [{ value: 1.0000002 }],
        'relational',
      ).equivalent,
    ).toBe(false);
  });

  it('preserves duplicate multiplicity in relational mode', () => {
    const left = [{ value: 'a' }, { value: 'a' }, { value: 'b' }];
    const right = [{ value: 'a' }, { value: 'b' }, { value: 'b' }];
    expect(verifyResultEquivalence(left, right, 'relational').equivalent).toBe(
      false,
    );
  });

  it('compares metadata even when both results are empty', () => {
    const baselineResult = {
      rows: [],
      columns: [{ name: 'id', dataTypeId: 23 }],
    };
    const sameResult = { rows: [], columns: [{ name: 'id', dataTypeId: 23 }] };
    const differentResult = {
      rows: [],
      columns: [{ name: 'id', dataTypeId: 25 }],
    };

    expect(
      verifyResultEquivalence(baselineResult, sameResult, 'relational')
        .equivalent,
    ).toBe(true);
    expect(
      verifyResultEquivalence(baselineResult, differentResult, 'relational')
        .equivalent,
    ).toBe(false);
  });
});
