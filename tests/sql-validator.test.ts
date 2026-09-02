import { describe, it, expect } from 'vitest';
import { validateReadOnlySql } from '../src/lib/sql-validator';

describe('SQL Read-Only Validator', () => {
  it('allows valid SELECT queries', () => {
    const res = validateReadOnlySql(
      "SELECT * FROM orders WHERE status = 'completed';",
    );
    expect(res.isValid).toBe(true);
    expect(res.statementType).toBe('SELECT');
  });

  it('allows valid WITH CTE read-only queries', () => {
    const sql = `
      WITH recent_orders AS (
        SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '30 days'
      )
      SELECT customer_id, count(*) FROM recent_orders GROUP BY customer_id;
    `;
    const res = validateReadOnlySql(sql);
    expect(res.isValid).toBe(true);
    expect(res.statementType).toBe('WITH');
  });

  it('rejects INSERT statements', () => {
    const res = validateReadOnlySql(
      'INSERT INTO orders (id, total) VALUES (1, 100);',
    );
    expect(res.isValid).toBe(false);
    expect(res.error).toContain(
      'Only read-only SELECT / WITH queries are allowed',
    );
  });

  it('rejects UPDATE statements', () => {
    const res = validateReadOnlySql(
      "UPDATE orders SET status = 'cancelled' WHERE id = 1;",
    );
    expect(res.isValid).toBe(false);
  });

  it('rejects DELETE statements', () => {
    const res = validateReadOnlySql('DELETE FROM orders WHERE id = 1;');
    expect(res.isValid).toBe(false);
  });

  it('rejects DROP TABLE or DROP INDEX in SQL text', () => {
    const res = validateReadOnlySql('DROP TABLE orders;');
    expect(res.isValid).toBe(false);
  });

  it('rejects multiple statements (injection attempts)', () => {
    const res = validateReadOnlySql(
      'SELECT * FROM orders; DROP TABLE customers;',
    );
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Multiple statements are not permitted');
  });

  it('does not let comments splice a forbidden keyword past validation', () => {
    expect(
      validateReadOnlySql(
        'WITH doomed AS (DELETE/* split */FROM orders RETURNING *) SELECT * FROM doomed',
      ).isValid,
    ).toBe(false);
  });

  it('rejects data-modifying CTEs and MERGE', () => {
    expect(
      validateReadOnlySql(
        "WITH changed AS (UPDATE orders SET status = 'x' RETURNING *) SELECT * FROM changed",
      ).isValid,
    ).toBe(false);
    expect(
      validateReadOnlySql(
        'MERGE INTO orders USING customers ON false WHEN NOT MATCHED THEN DO NOTHING',
      ).isValid,
    ).toBe(false);
  });

  it('allows keywords and semicolons inside strings, comments, and dollar strings', () => {
    expect(validateReadOnlySql("SELECT 'DROP TABLE x;'").isValid).toBe(true);
    expect(
      validateReadOnlySql('SELECT $$DELETE FROM orders;$$ AS text').isValid,
    ).toBe(true);
    expect(
      validateReadOnlySql('/* DROP TABLE orders; */ SELECT 1').isValid,
    ).toBe(true);
  });

  it('rejects unterminated lexical constructs', () => {
    expect(validateReadOnlySql("SELECT 'unfinished").isValid).toBe(false);
    expect(validateReadOnlySql('SELECT 1 /* unfinished').isValid).toBe(false);
  });

  it('rejects empty queries', () => {
    const res = validateReadOnlySql('   ');
    expect(res.isValid).toBe(false);
  });
});
