import { describe, expect, it } from 'vitest';
import { runScan } from '../src/index.js';

describe('runScan', () => {
  it('returns an empty report from the skeleton', async () => {
    const report = await runScan({ cwd: '.', format: ['json'], ci: true, offline: true });
    expect(report.summary).toEqual({ blockers: 0, warnings: 0, ok: 0 });
  });
});
