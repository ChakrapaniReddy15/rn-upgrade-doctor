import type { DependencyInfo, Report, Severity } from '../types.js';

export const SEVERITY_LABEL: Record<Severity, string> = { blocker: 'Blocker', warning: 'Warning', info: 'Info' };

export function newArchLabel(dep: DependencyInfo): string {
  const status = dep.directory.value?.newArchitecture;
  if (status === 'new-arch-only') return 'yes (only)';
  if (status === 'supported') return 'yes';
  if (status === 'unsupported') return 'no';
  if (status === 'untested') return 'untested';
  return '–';
}

export function maintenanceLabel(dep: DependencyInfo): string {
  if (dep.npm.value?.deprecated) return 'deprecated';
  if (dep.directory.value?.unmaintained) return 'unmaintained';
  if (dep.directory.value) return 'ok';
  return '–';
}

/** Dependencies worth listing: React Native itself, libraries in React Native Directory and anything with a finding. */
export function interestingDependencies(report: Report): DependencyInfo[] {
  const flagged = new Set(report.findings.map((f) => f.package).filter(Boolean));
  return report.dependencies.filter((d) => d.directory.value || flagged.has(d.name) || d.name === 'react-native');
}

export function headline(report: Report): string {
  const { reactNativeVersion, latestReactNative } = report.meta;
  if (!reactNativeVersion) return 'React Native version unknown';
  if (!latestReactNative) return `React Native ${reactNativeVersion} (latest unknown${report.meta.offline ? ', offline' : ''})`;
  if (reactNativeVersion === latestReactNative) return `React Native ${reactNativeVersion} (latest)`;
  return `React Native ${reactNativeVersion} → ${latestReactNative}`;
}

export function dataSources(report: Report): string[] {
  const sources = new Set<string>();
  const lockfile = report.meta.lockfile ? ` (${report.meta.lockfile})` : '';
  sources.add(`React Native version: ${report.meta.reactNativeVersionSource}${report.meta.reactNativeVersionSource === 'lockfile' ? lockfile : ''}`);
  if (report.meta.latestReactNativeSource) sources.add(`Latest React Native: ${report.meta.latestReactNativeSource}`);
  const npm = countBy(report.dependencies.map((d) => d.npm.source));
  const dir = countBy(report.dependencies.map((d) => d.directory.source));
  sources.add(`Versions: ${npm}`);
  sources.add(`New Architecture / maintenance: ${dir}`);
  return [...sources];
}

function countBy(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([value, n]) => `${value} (${n})`).join(', ') || 'none';
}

export interface ConfigSection {
  platform: 'Android' | 'iOS';
  /** Files the values came from; empty when the platform folder was not found. */
  files: string[];
  rows: Array<[label: string, value: string]>;
}

/** Android and iOS settings as read from the project, so the report shows them even when nothing is wrong. */
export function configSections(report: Report): ConfigSection[] {
  const a = report.android;
  const i = report.ios;
  const shown = (value: string | number | undefined) => (value === undefined ? 'not found' : String(value));
  const flag = (value: boolean | undefined) => (value === undefined ? 'not set (React Native default: on)' : value ? 'on' : 'off');

  return [
    {
      platform: 'Android',
      files: a?.files ?? [],
      rows: a
        ? [
            ['targetSdk', shown(a.targetSdk)],
            ['compileSdk', shown(a.compileSdk)],
            ['minSdk', shown(a.minSdk)],
            ['New Architecture (newArchEnabled)', flag(a.newArchEnabled)],
            ['Hermes (hermesEnabled)', flag(a.hermesEnabled)],
            ['NDK', shown(a.ndkVersion)],
            ['Kotlin', shown(a.kotlinVersion)],
            ['Gradle', shown(a.gradleVersion)],
          ]
        : [],
    },
    {
      platform: 'iOS',
      files: i?.files ?? [],
      rows: i
        ? [
            ['Deployment target', i.minIos ?? (i.usesRnMinIos ? 'min_ios_version_supported (follows React Native)' : 'not found')],
            ['New Architecture (RCT_NEW_ARCH_ENABLED)', flag(i.newArchEnabled)],
            ['Hermes (:hermes_enabled)', flag(i.hermesEnabled)],
            ['React Native in Podfile.lock', shown(i.podsReactNativeVersion)],
            ['CocoaPods', shown(i.cocoapodsVersion)],
          ]
        : [],
    },
  ];
}
