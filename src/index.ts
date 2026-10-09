import { buildProjectContext } from './project/index.js';
import type { Report, ScanOptions } from './types.js';

export * from './types.js';

/** Library entry: run every check and return a ranked report. */
export async function runScan(options: ScanOptions): Promise<Report> {
  const project = await buildProjectContext(options.cwd);
  // TODO (week 1): fill project.installed from the lockfile, run checks, rank findings.
  // TODO (week 2): if options.apk, run src/apk 16 KB scan and map .so files to packages.
  return {
    meta: {
      tool: 'rn-upgrade-doctor',
      version: '0.0.1',
      scannedAt: new Date().toISOString(),
      cwd: project.cwd,
      apk: options.apk,
      reactNativeVersion: project.reactNativeVersion,
      packageManager: project.packageManager,
    },
    summary: { blockers: 0, warnings: 0, ok: 0 },
    findings: [],
  };
}
