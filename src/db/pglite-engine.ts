import type { PGliteInterface } from '@electric-sql/pglite';
import {
  BenchmarkResult,
  FullQueryResult,
  IndexInfo,
  NormalizedPlan,
  ResultPreview,
  SchemaSnapshot,
  TableSchema,
} from '@/types';
import { getEcommerceSeedSql } from './ecommerce-fixture';
import { parsePostgresExplainJson } from '@/engine/plan-parser';
import { calculateBenchmarkStats } from '@/engine/benchmarking';
import { validateReadOnlySql } from '@/lib/sql-validator';

class PgLiteDatabaseEngine {
  private db: PGliteInterface | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private userCreatedIndexes = new Set<string>();
  private protectedIndexNames = new Set<string>();
  private timeoutMs = 10_000;

  /**
   * Initializes or resets the in-browser PostgreSQL instance and seeds the Ecommerce fixture.
   */
  async initialize(onProgress?: (message: string) => void): Promise<void> {
    return this.openWorkspace('ecommerce-demo', {
      initialize: true,
      setupSql: getEcommerceSeedSql(),
      onProgress,
    });
  }

  async openWorkspace(
    workspaceId: string,
    options: {
      initialize?: boolean;
      setupSql?: string;
      onProgress?: (message: string) => void;
    } = {},
  ): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.initializeDatabase(workspaceId, options);
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeDatabase(
    workspaceId: string,
    options: {
      initialize?: boolean;
      setupSql?: string;
      onProgress?: (message: string) => void;
    },
  ): Promise<void> {
    const onProgress = options.onProgress;
    if (onProgress)
      onProgress('Starting in-browser PostgreSQL (PGlite WASM)...');

    if (!this.db) {
      this.db =
        typeof window !== 'undefined' && typeof Worker !== 'undefined'
          ? await (
              await import('@electric-sql/pglite/worker')
            ).PGliteWorker.create(
              new Worker(new URL('./pglite.worker.ts', import.meta.url), {
                type: 'module',
                name: 'tuneql-pglite',
              }),
              {
                id: `tuneql-${workspaceId}`,
                dataDir: `idb://tuneql-${workspaceId}`,
              },
            )
          : await (await import('@electric-sql/pglite')).PGlite.create();
    }

    this.userCreatedIndexes.clear();

    if (options.initialize && options.setupSql?.trim()) {
      if (onProgress) onProgress('Preparing workspace database...');
      await this.runSetupSql(options.setupSql);
    }

    this.isInitialized = true;
    if (options.initialize) {
      const initializedSchema = await this.getSchema();
      this.protectedIndexNames = new Set(
        initializedSchema.indexes.map((index) => index.name),
      );
    }
    if (onProgress) onProgress('Database ready.');
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    this.isInitialized = false;
    if (db && 'close' in db) await db.close();
  }

  setProtectedIndexes(names: string[]) {
    this.protectedIndexNames = new Set(names);
  }
  setTimeoutSeconds(seconds: number) {
    this.timeoutMs = Math.max(1, Math.min(60, seconds)) * 1000;
  }

  private async runSetupSql(sql: string): Promise<void> {
    if (/^\s*\\/m.test(sql))
      throw new Error(
        'IMPORT_UNSUPPORTED: psql meta-commands are not supported.',
      );
    if (/\bCOPY\b[\s\S]*?\b(?:PROGRAM|FROM\s+['"])/i.test(sql)) {
      throw new Error(
        'IMPORT_UNSAFE: external file and program COPY commands are not supported.',
      );
    }
    const db = this.ensureReadyForSetup();
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL statement_timeout = '30000ms';");
      await tx.exec(sql);
    });
  }

  private ensureReadyForSetup(): PGliteInterface {
    if (!this.db) throw new Error('Database could not be opened.');
    return this.db;
  }

  get ready(): boolean {
    return this.isInitialized && this.db !== null;
  }

  private ensureReady(): PGliteInterface {
    if (!this.db || !this.isInitialized) {
      throw new Error(
        'Database is not initialized. Please wait for PostgreSQL to finish booting.',
      );
    }
    return this.db;
  }

  private async queryReadOnly<T extends Record<string, unknown>>(
    sql: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const db = this.ensureReady();
    const result = await db.transaction(async (tx) => {
      await tx.exec(
        `SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '${this.timeoutMs}ms';`,
      );
      return tx.query<T>(sql);
    });
    signal?.throwIfAborted();
    return result;
  }

  /**
   * Introspects tables, columns, row counts, and indexes from PostgreSQL system catalogs.
   */
  async getSchema(): Promise<SchemaSnapshot> {
    const db = this.ensureReady();

    // 1. Get Tables & Columns
    const colResult = await db.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(`
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    // 2. Get Indexes
    const idxResult = await db.query<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(`
      SELECT 
        tablename, 
        indexname, 
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    // 3. Get Accurate Row Counts from pg_class reltuples
    const rowCountResult = await db.query<{
      relname: string;
      reltuples: string | number;
    }>(`
      SELECT
        c.relname,
        GREATEST(c.reltuples::bigint, 0) AS reltuples
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r';
    `);

    const rowCountMap = new Map<string, number>();
    for (const r of rowCountResult.rows) {
      rowCountMap.set(r.relname, Number(r.reltuples) || 0);
    }

    const tableMap = new Map<string, TableSchema>();

    for (const col of colResult.rows) {
      if (!tableMap.has(col.table_name)) {
        tableMap.set(col.table_name, {
          name: col.table_name,
          columns: [],
          estimatedRows: rowCountMap.get(col.table_name) || 0,
          indexes: [],
        });
      }

      tableMap.get(col.table_name)!.columns.push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
      });
    }

    // Fallback: If reltuples is 0 (e.g. before ANALYZE), fetch fast count(*)
    for (const table of tableMap.values()) {
      if (table.estimatedRows === 0) {
        try {
          const countRes = await db.query<{ count: string | number }>(
            `SELECT count(*) as count FROM "${table.name.replaceAll('"', '""')}";`,
          );
          table.estimatedRows = Number(countRes.rows[0]?.count) || 0;
        } catch {
          // Ignore count error if table is inaccessible
        }
      }
    }

    const allIndexes: IndexInfo[] = [];

    for (const idx of idxResult.rows) {
      const isPrimary = idx.indexname.endsWith('_pkey');
      const isProtected =
        isPrimary || this.protectedIndexNames.has(idx.indexname);

      // Parse columns from indexdef, e.g. "CREATE INDEX idx_name ON public.orders USING btree (status, created_at)"
      const matchCols = idx.indexdef.match(/\((.*?)\)$/);
      const cols = matchCols
        ? matchCols[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        : [];
      const matchMethod = idx.indexdef.match(/USING\s+([a-zA-Z0-9_]+)/i);
      const method = matchMethod ? matchMethod[1].toUpperCase() : 'BTREE';

      const info: IndexInfo = {
        name: idx.indexname,
        table: idx.tablename,
        columns: cols,
        method,
        isPrimary,
        isProtected,
      };

      allIndexes.push(info);

      if (tableMap.has(idx.tablename)) {
        tableMap.get(idx.tablename)!.indexes.push(info);
      }
    }

    return {
      tables: Array.from(tableMap.values()),
      indexes: allIndexes,
    };
  }

  /**
   * Runs controlled benchmark measuring PostgreSQL's actual internal execution timing.
   */
  async runBenchmark(
    sql: string,
    runs: number = 5,
    warmupRuns: number = 1,
    signal?: AbortSignal,
  ): Promise<BenchmarkResult> {
    const validation = validateReadOnlySql(sql);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Query failed safety validation.');
    }

    const safeRuns = Math.max(1, Math.min(20, runs));
    const safeWarmup = Math.max(0, Math.min(5, warmupRuns));
    const db = this.ensureReady();

    // 1. Warm-up runs to prime PostgreSQL buffer cache
    for (let w = 0; w < safeWarmup; w++) {
      signal?.throwIfAborted();
      await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
    }

    // 2. Measured runs using PostgreSQL internal Execution Time
    const runTimings: number[] = [];
    for (let i = 0; i < safeRuns; i++) {
      signal?.throwIfAborted();
      const res = await db.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
      );
      const rawPlan = res.rows?.[0]?.['QUERY PLAN'] as
        Array<Record<string, unknown>> | undefined;
      const execTime = rawPlan?.[0]?.['Execution Time'];
      if (typeof execTime === 'number') {
        runTimings.push(Number(execTime.toFixed(2)));
      }
    }

    return calculateBenchmarkStats(runTimings, safeWarmup);
  }

  /**
   * Executes a read-only SELECT query and returns formatted preview rows.
   */
  async executeReadOnly(
    sql: string,
    maxRows: number = 500,
    signal?: AbortSignal,
  ): Promise<ResultPreview> {
    const validation = validateReadOnlySql(sql);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Query failed safety validation.');
    }

    const start = performance.now();
    const res = await this.queryReadOnly<Record<string, unknown>>(sql, signal);
    const durationMs = Number((performance.now() - start).toFixed(2));

    const totalRowCount = res.rows.length;
    const isTruncated = totalRowCount > maxRows;
    const rows = isTruncated ? res.rows.slice(0, maxRows) : res.rows;
    const columns = res.fields
      ? res.fields.map((f) => f.name)
      : rows[0]
        ? Object.keys(rows[0])
        : [];
    const columnTypes = res.fields?.map((field) => String(field.dataTypeID));

    return {
      columns,
      columnTypes,
      rows,
      totalRowCount,
      isTruncated,
      durationMs,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetches all rows without truncation for result equivalence checking.
   */
  async fetchAllResult(
    sql: string,
    signal?: AbortSignal,
    rowLimit = 100_000,
  ): Promise<FullQueryResult> {
    const validation = validateReadOnlySql(sql);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Query failed safety validation.');
    }

    const res = await this.queryReadOnly<Record<string, unknown>>(sql, signal);
    if (res.rows.length > rowLimit) {
      throw new Error(
        `RESULT_LIMIT_EXCEEDED: Equivalence checks are limited to ${rowLimit.toLocaleString()} rows per query.`,
      );
    }
    return {
      rows: res.rows,
      columns: res.fields.map((field) => ({
        name: field.name,
        dataTypeId: field.dataTypeID,
      })),
    };
  }

  async fetchAllRows(
    sql: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>[]> {
    return (await this.fetchAllResult(sql, signal)).rows;
  }

  /**
   * Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) or estimated EXPLAIN.
   */
  async explainQuery(
    sql: string,
    analyze: boolean = true,
    signal?: AbortSignal,
  ): Promise<NormalizedPlan> {
    const validation = validateReadOnlySql(sql);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Query failed safety validation.');
    }

    const explainSql = analyze
      ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`
      : `EXPLAIN (FORMAT JSON) ${sql}`;

    const res = await this.queryReadOnly<{ 'QUERY PLAN': unknown }>(
      explainSql,
      signal,
    );
    if (!res.rows || res.rows.length === 0) {
      throw new Error('No EXPLAIN plan returned by PostgreSQL.');
    }

    const planJson = res.rows[0]['QUERY PLAN'];
    return parsePostgresExplainJson(planJson);
  }

  /**
   * Creates a structured index on a table and column list.
   */
  async createIndex(
    table: string,
    columns: string[],
    customName?: string,
  ): Promise<IndexInfo> {
    const db = this.ensureReady();

    if (columns.length === 0) throw new Error('Choose at least one column.');

    const schema = await this.getSchema();
    const targetTable = schema.tables.find(
      (candidate) => candidate.name === table,
    );
    if (!targetTable) throw new Error(`Table "${table}" does not exist.`);
    const availableColumns = new Set(
      targetTable.columns.map((column) => column.name),
    );
    const missingColumn = columns.find(
      (column) => !availableColumns.has(column),
    );
    if (missingColumn)
      throw new Error(
        `Column "${missingColumn}" does not exist on table "${table}".`,
      );

    const generatedName = `idx_${table}_${columns.join('_')}`
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .slice(0, 63);
    const indexName = customName ?? generatedName;
    if (
      !indexName ||
      indexName.includes('\0') ||
      new TextEncoder().encode(indexName).length > 63
    ) {
      throw new Error(
        'Index name must be non-empty and at most 63 UTF-8 bytes.',
      );
    }
    if (schema.indexes.some((index) => index.name === indexName)) {
      throw new Error(`Index "${indexName}" already exists.`);
    }

    const quote = (identifier: string) =>
      `"${identifier.replaceAll('"', '""')}"`;
    const createSql = `CREATE INDEX ${quote(indexName)} ON ${quote(table)} (${columns.map(quote).join(', ')});`;
    await db.exec(createSql);
    this.userCreatedIndexes.add(indexName);

    // Run ANALYZE to update statistics for index selection
    await db.exec(`ANALYZE ${quote(table)};`);

    return {
      name: indexName,
      table,
      columns,
      method: 'BTREE',
      isProtected: false,
    };
  }

  /**
   * Drops a user-created index.
   */
  async dropIndex(name: string): Promise<void> {
    const db = this.ensureReady();
    if (!name || name.includes('\0')) throw new Error('Invalid index name.');
    const schema = await this.getSchema();
    const index = schema.indexes.find((candidate) => candidate.name === name);
    if (!index) throw new Error(`Index "${name}" does not exist.`);
    if (index.isProtected)
      throw new Error(`Index "${name}" is protected and cannot be dropped.`);

    const quote = (identifier: string) =>
      `"${identifier.replaceAll('"', '""')}"`;
    await db.exec(`DROP INDEX ${quote(name)};`);
    this.userCreatedIndexes.delete(name);
  }

  async replaceUserIndexes(targetIndexes: IndexInfo[]): Promise<void> {
    const db = this.ensureReady();
    const schema = await this.getSchema();
    const quote = (identifier: string) =>
      `"${identifier.replaceAll('"', '""')}"`;
    const tableMap = new Map(
      schema.tables.map((table) => [
        table.name,
        new Set(table.columns.map((column) => column.name)),
      ]),
    );

    for (const index of targetIndexes) {
      if (
        !index.name ||
        index.name.includes('\0') ||
        index.columns.length === 0 ||
        index.columns.some((column) => !column || column.includes('\0'))
      ) {
        throw new Error(
          `Cannot restore invalid index definition "${index.name}".`,
        );
      }
      const tableColumns = tableMap.get(index.table);
      if (
        !tableColumns ||
        index.columns.some((column) => !tableColumns.has(column))
      ) {
        throw new Error(
          `Cannot restore index "${index.name}" because its table or columns no longer exist.`,
        );
      }
    }

    await db.transaction(async (tx) => {
      for (const index of schema.indexes.filter(
        (candidate) => !candidate.isProtected,
      )) {
        await tx.exec(`DROP INDEX ${quote(index.name)};`);
      }
      for (const index of targetIndexes) {
        await tx.exec(
          `CREATE INDEX ${quote(index.name)} ON ${quote(index.table)} (${index.columns.map(quote).join(', ')});`,
        );
      }
      for (const table of new Set(targetIndexes.map((index) => index.table))) {
        await tx.exec(`ANALYZE ${quote(table)};`);
      }
    });

    this.userCreatedIndexes = new Set(targetIndexes.map((index) => index.name));
  }

  getUserCreatedIndexes(): string[] {
    return Array.from(this.userCreatedIndexes);
  }
}

export const pgEngine = new PgLiteDatabaseEngine();
