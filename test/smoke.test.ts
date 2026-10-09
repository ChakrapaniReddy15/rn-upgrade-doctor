import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runScan } from '../src/index.js';

describe('runScan', () => {
  it('returns a report for a minimal React Native project', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rn-doctor-smoke-'));
    try {
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-native': '^0.76.0' } }));
      await writeFile(path.join(dir, 'package-lock.json'), '{}');

      const report = await runScan({ cwd: dir, format: ['json'], ci: true, offline: true });
      expect(report.meta).toMatchObject({ reactNativeVersion: '0.76.0', packageManager: 'npm' });
      expect(report.summary).toEqual({ blockers: 0, warnings: 0, ok: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
