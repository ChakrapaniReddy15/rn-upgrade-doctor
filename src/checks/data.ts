import type { DependencyInfo, Finding, ProjectContext } from '../types.js';

/** Sources that mean "we wanted the data but could not get it" (as opposed to "not on npm" or "not listed"). */
export const OFFLINE_SOURCES = ['offline, not cached'];
export const UNREACHABLE_SOURCES = ['npm registry unreachable', 'React Native Directory unreachable', 'React Native template unreachable'];

/** True when a registry could not be reached (network failure), not just skipped because of --offline. */
export function registryUnreachable(dependencies: DependencyInfo[], otherSources: string[] = []): boolean {
  return (
    otherSources.some((s) => UNREACHABLE_SOURCES.includes(s)) ||
    dependencies.some((d) => UNREACHABLE_SOURCES.includes(d.npm.source) || UNREACHABLE_SOURCES.includes(d.directory.source))
  );
}

/**
 * Say so when data is missing, so a quiet report is never mistaken for a clean one:
 * no lockfile (no installed versions), registry data or a React Native template that could not be fetched.
 */
export function checkDataGaps(ctx: ProjectContext): Finding[] {
  const findings: Finding[] = [];

  if (!ctx.lockfile && Object.keys(ctx.declared).length > 0) {
    findings.push({
      id: 'data-lockfile-missing',
      severity: 'warning',
      title: 'No lockfile found: installed versions are unknown',
      detail:
        'Version checks were skipped for every dependency, and the React Native version comes from the package.json range. ' +
        'Looked in the app folder and, for monorepos, in parent folders that declare workspaces.',
      fix: 'Run your package manager install and commit the lockfile (package-lock.json, yarn.lock or pnpm-lock.yaml).',
      source: 'project files',
    });
  }

  const missing = (ctx.dependencies ?? []).filter((d) => isMissing(d.npm.source) || isMissing(d.directory.source));
  if (missing.length > 0) {
    const unreachable = registryUnreachable(missing);
    const names = missing.map((d) => d.name);
    findings.push({
      id: 'data-registry-unavailable',
      severity: 'warning',
      title: `Registry data missing for ${missing.length} of ${ctx.dependencies?.length ?? 0} dependencies`,
      detail:
        `${unreachable ? 'npm or React Native Directory could not be reached' : 'Offline and not in the cache'}, so version, ` +
        `New Architecture and maintenance checks were skipped for: ${names.slice(0, 8).join(', ')}${names.length > 8 ? `, and ${names.length - 8} more` : ''}.`,
      fix: unreachable
        ? 'Check network access to registry.npmjs.org and reactnative.directory, then run again.'
        : 'Run once without --offline to fill the cache, or point --cache-dir at a cache that has these packages.',
      source: [...new Set(missing.flatMap((d) => [d.npm.source, d.directory.source]).filter(isMissing))].join(', '),
    });
  }
  const templates = ctx.templates;
  if (templates && (ctx.android || ctx.ios)) {
    const lost = [
      { version: templates.currentVersion, source: templates.current.source },
      { version: templates.targetVersion, source: templates.target.source },
    ].filter((t, index, all) => t.version && isMissing(t.source) && all.findIndex((o) => o.version === t.version) === index);
    if (lost.length > 0) {
      const unreachable = lost.some((t) => UNREACHABLE_SOURCES.includes(t.source));
      findings.push({
        id: 'data-template-unavailable',
        severity: 'warning',
        title: `React Native template not available for ${lost.map((t) => t.version).join(' and ')}`,
        detail: 'Your Android and iOS settings could not be compared with the official template, so template-based checks were skipped.',
        fix: unreachable
          ? 'Check network access to raw.githubusercontent.com, then run again.'
          : 'Run once without --offline to fill the cache, or point --cache-dir at a cache that has it.',
        source: [...new Set(lost.map((t) => t.source))].join(', '),
      });
    }
  }
  return findings;
}

function isMissing(source: string): boolean {
  return OFFLINE_SOURCES.includes(source) || UNREACHABLE_SOURCES.includes(source);
}
