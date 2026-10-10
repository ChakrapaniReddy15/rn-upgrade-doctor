import type { Finding, ProjectContext, Severity } from '../types.js';
import { checkApk } from './apk.js';
import { checkDependencies } from './dependencies.js';
import { checkPatches } from './patches.js';
import { checkAndroid, checkIos } from './platforms.js';
import { checkReactNative } from './reactNative.js';

export { checkApk, checkAndroid, checkDependencies, checkIos, checkPatches, checkReactNative };

/** Order inside a severity: what blocks a release first, then the upgrade itself, then housekeeping. */
const CHECKS: Array<(ctx: ProjectContext) => Finding[]> = [
  checkApk,
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
