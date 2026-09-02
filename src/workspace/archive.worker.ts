/// <reference lib="webworker" />
import { PGlite } from '@electric-sql/pglite';
import { pgDump } from '@electric-sql/pglite-tools';
import { strToU8, unzipSync, zipSync } from 'fflate';

type Request =
  | {
      id: string;
      action: 'export';
      dataDir: string;
      metadata: string;
      report: string;
    }
  | { id: string; action: 'restore'; archive: ArrayBuffer };

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.action === 'export') {
      const pg = await PGlite.create(request.dataDir);
      try {
        const dump = await pgDump({ pg, fileName: 'database.sql' });
        const sql = new Uint8Array(await dump.arrayBuffer());
        const archive = zipSync(
          {
            'database.sql': sql,
            'workspace.json': strToU8(request.metadata),
            'report.md': strToU8(request.report),
          },
          { level: 6 },
        );
        self.postMessage(
          { id: request.id, archive: archive.buffer },
          { transfer: [archive.buffer] },
        );
      } finally {
        await pg.close();
      }
    } else {
      if (request.archive.byteLength > 50 * 1024 * 1024)
        throw new Error('ARCHIVE_TOO_LARGE: ZIP files are limited to 50 MB.');
      let expanded = 0;
      const allowed = new Set(['database.sql', 'workspace.json', 'report.md']);
      const files = unzipSync(new Uint8Array(request.archive), {
        filter(file) {
          if (!allowed.has(file.name)) return false;
          expanded += file.originalSize;
          if (expanded > 200 * 1024 * 1024)
            throw new Error(
              'ARCHIVE_TOO_LARGE: Expanded workspace is limited to 200 MB.',
            );
          return true;
        },
      });
      if (!files['database.sql'] || !files['workspace.json'])
        throw new Error(
          'ARCHIVE_INVALID: database.sql and workspace.json are required.',
        );
      const decoder = new TextDecoder();
      self.postMessage({
        id: request.id,
        databaseSql: decoder.decode(files['database.sql']),
        metadata: decoder.decode(files['workspace.json']),
      });
    }
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
