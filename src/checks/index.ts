import type { Finding, ProjectContext, Severity } from '../types.js';
import { checkApk } from './apk.js';
import { checkDataGaps } from './data.js';
import { checkDependencies } from './dependencies.js';
import { checkPatches } from './patches.js';
import { checkAndroid, checkIos } from './platforms.js';
import { checkReactNative } from './reactNative.js';

export { checkApk, checkAndroid, checkDataGaps, checkDependencies, checkIos, checkPatches, checkReactNative };
export { registryUnreachable } from './data.js';

/**
 * Order inside a severity: what blocks a release first, then gaps in the data (so a quiet report is not read as a
 * clean one), then the upgrade itself, then housekeeping.
 */
const CHECKS: Array<(ctx: ProjectContext) => Finding[]> = [
  checkApk,
  checkDataGaps,
  checkReactNative,
  checkDependencies,
  checkAndroid,
  checkIos,
  checkPatches,
];

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };

/** Run every check and rank the findings: by severity, then by check order (stable sort keeps it). */
export function runChecks(ctx: ProjectContext): Finding[] {
  return rankFindings(CHECKS.flatMap((check) => check(ctx)));
}

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
