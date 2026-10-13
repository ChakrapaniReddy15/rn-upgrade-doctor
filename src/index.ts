import { createRequire } from 'node:module';
import path from 'node:path';
import { readAndroidConfig } from './android/index.js';
import { scanApk } from './apk/index.js';
import { registryUnreachable, runChecks } from './checks/index.js';
import { readIosConfig } from './ios/index.js';
import { buildProjectContext, readPackageJson, type PackageJson } from './project/index.js';
import { readPatches } from './project/patches.js';
import { FileCache, getDirectoryInfo, getNpmInfo, type RegistryOptions } from './registry/index.js';
import { upgradeHelperUrl } from './rules/index.js';
import type { DependencyInfo, PatchInfo, ProjectContext, Report, ScanOptions, Sourced } from './types.js';

export * from './types.js';
export { runChecks, rankFindings } from './checks/index.js';
export { renderReport, writeReports } from './report/index.js';

export const TOOL_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

/**
 * Process exit code for a report: 1 when there are blockers, else 0. With `ci`, a registry that could not be reached
 * gives 2 (the tool could not do its job), so a network failure never passes as a clean result.
 */
export function exitCodeFor(report: Report, options: { ci: boolean }): 0 | 1 | 2 {
  if (options.ci && registryUnreachable(report.dependencies)) return 2;
  return report.summary.blockers > 0 ? 1 : 0;
}

export interface RunScanDeps {
  /** Override registry access (tests). */
  registry?: Partial<RegistryOptions>;
}

/** Library entry: read the project, look up every dependency, run every check and return a ranked report. */
export async function runScan(options: ScanOptions, deps: RunScanDeps = {}): Promise<Report> {
  const ctx = await buildProjectContext(options.cwd);
  const pkg = await readPackageJson(ctx.cwd);
  const root = ctx.workspaceRoot;
  const rootPrefix = root ? `${path.relative(ctx.cwd, root).split(path.sep).join('/')}/` : '';
  const registry: RegistryOptions = { offline: options.offline, cache: new FileCache(options.cacheDir), ...deps.registry };

  const [dependencies, android, ios, patches, apk] = await Promise.all([
    lookupDependencies(ctx, registry),
    readAndroidConfig(ctx.cwd),
    readIosConfig(ctx.cwd),
    readAllPatches(ctx.cwd, pkg, root, rootPrefix),
    // Like --cwd, a relative --apk path is relative to the folder the command runs in, not to the project.
    options.apk ? scanApk(options.apk, root ? [ctx.cwd, root] : ctx.cwd) : Promise.resolve(undefined),
  ]);

  const rnNpm = dependencies.find((d) => d.name === 'react-native')?.npm;
  const latestReactNative: Sourced<string> = { value: rnNpm?.value?.latest, source: rnNpm?.source ?? 'unknown' };
  const full: ProjectContext = { ...ctx, latestReactNative, dependencies, android, ios, patches, apk };
  const findings = runChecks(full);

  const current = ctx.reactNativeVersion;
  const latest = latestReactNative.value;
  return {
    meta: {
      tool: 'rn-upgrade-doctor',
      version: TOOL_VERSION,
      scannedAt: new Date().toISOString(),
      cwd: ctx.cwd,
      apk: apk?.file,
      reactNativeVersion: current,
      reactNativeVersionSource: ctx.reactNativeVersionSource,
      latestReactNative: latest,
      latestReactNativeSource: latestReactNative.source,
      upgradeHelperUrl: current && latest && current !== latest ? upgradeHelperUrl(current, latest) : undefined,
      packageManager: ctx.packageManager,
      lockfile: ctx.lockfile ? path.relative(ctx.cwd, ctx.lockfile).split(path.sep).join('/') : undefined,
      offline: options.offline,
    },
    summary: {
      blockers: findings.filter((f) => f.severity === 'blocker').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length,
    },
    findings,
    dependencies,
    android,
    ios,
    patches,
    apk,
  };
}

/** Patches in the app folder plus, in a monorepo, the workspace root (where patch-package usually runs). */
async function readAllPatches(cwd: string, pkg: PackageJson, root: string | undefined, rootPrefix: string): Promise<PatchInfo[]> {
  const own = await readPatches(cwd, pkg);
  if (!root) return own;
  const rootPkg = await readPackageJson(root).catch(() => ({}));
  return [...own, ...(await readPatches(root, rootPkg, rootPrefix))];
}

/** Specs that do not come from the npm registry: local folders, workspaces, git and tarball URLs. */
const NON_REGISTRY = /^(file:|link:|portal:|workspace:|git(\+\w+)?:|github:|https?:|[\w.-]+\/[\w.-]+(#.*)?$)/;

async function lookupDependencies(ctx: ProjectContext, registry: RegistryOptions): Promise<DependencyInfo[]> {
  const names = Object.keys(ctx.declared).sort();
  const fromRegistry = names.filter((name) => !NON_REGISTRY.test(ctx.declared[name]));
  const [npm, directory] = await Promise.all([getNpmInfo(fromRegistry, registry), getDirectoryInfo(fromRegistry, registry)]);

  return names.map((name) => ({
    name,
    declared: ctx.declared[name],
    installed: ctx.installed[name],
    dev: ctx.devOnly.includes(name),
    npm: npm[name] ?? { source: 'skipped (not from the npm registry)' },
    directory: directory[name] ?? { source: 'skipped (not from the npm registry)' },
  }));
}
