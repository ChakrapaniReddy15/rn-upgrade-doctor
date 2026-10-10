import { createRequire } from 'node:module';
import { readAndroidConfig } from './android/index.js';
import { scanApk } from './apk/index.js';
import { runChecks } from './checks/index.js';
import { readIosConfig } from './ios/index.js';
import { buildProjectContext, readPackageJson } from './project/index.js';
import { readPatches } from './project/patches.js';
import { FileCache, getDirectoryInfo, getNpmInfo, type RegistryOptions } from './registry/index.js';
import { upgradeHelperUrl } from './rules/index.js';
import type { DependencyInfo, ProjectContext, Report, ScanOptions, Sourced } from './types.js';

export * from './types.js';
export { runChecks, rankFindings } from './checks/index.js';
export { renderReport, writeReports } from './report/index.js';

const TOOL_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export interface RunScanDeps {
  /** Override registry access (tests). */
  registry?: Partial<RegistryOptions>;
}

/** Library entry: read the project, look up every dependency, run every check and return a ranked report. */
export async function runScan(options: ScanOptions, deps: RunScanDeps = {}): Promise<Report> {
  const ctx = await buildProjectContext(options.cwd);
  const pkg = await readPackageJson(ctx.cwd);
  const registry: RegistryOptions = { offline: options.offline, cache: new FileCache(), ...deps.registry };

  const [dependencies, android, ios, patches, apk] = await Promise.all([
    lookupDependencies(ctx, registry),
    readAndroidConfig(ctx.cwd),
    readIosConfig(ctx.cwd),
    readPatches(ctx.cwd, pkg),
    options.apk ? scanApk(options.apk, ctx.cwd) : Promise.resolve(undefined),
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
