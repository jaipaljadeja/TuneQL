import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt =
  'TuneQL — PostgreSQL query optimization with real benchmarks and WebMCP agents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const icon = await readFile(join(process.cwd(), 'public/icon.png'));
  const iconDataUrl = `data:image/png;base64,${icon.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 64,
        padding: '72px 80px',
        color: '#f5f5f5',
        background: '#0a0a0a',
      }}
    >
      <img
        src={iconDataUrl}
        width={320}
        height={320}
        alt=""
        style={{ borderRadius: 72 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680 }}>
        <div
          style={{
            color: '#6ee7b7',
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 2,
          }}
        >
          POSTGRESQL OPTIMIZATION WORKBENCH
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 74,
            fontWeight: 700,
            letterSpacing: -3,
          }}
        >
          TuneQL
        </div>
        <div
          style={{
            marginTop: 22,
            color: '#a3a3a3',
            fontSize: 32,
            lineHeight: 1.35,
          }}
        >
          Measure, optimize, and verify SQL with real PostgreSQL and WebMCP
          agents.
        </div>
      </div>
    </div>,
    size,
  );
}
