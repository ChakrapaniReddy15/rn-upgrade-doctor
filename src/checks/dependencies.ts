import { LIBRARY_ADVICE, NEW_ARCH_ONLY_SINCE, breakingDistance, gte } from '../rules/index.js';
import type { DependencyInfo, Finding, ProjectContext } from '../types.js';

/** Per-dependency findings: New Architecture support, maintenance, deprecation and how far behind latest. */
export function checkDependencies(ctx: ProjectContext): Finding[] {
  const target = ctx.latestReactNative?.value ?? ctx.reactNativeVersion;
  const newArchRequired = target !== undefined && gte(target, NEW_ARCH_ONLY_SINCE);
  const findings: Finding[] = [];

  for (const dep of ctx.dependencies ?? []) {
    if (dep.name === 'react-native') continue; // covered by checkReactNative
    const dir = dep.directory.value;
    const advice = LIBRARY_ADVICE[dep.name];

    if (dir?.newArchitecture === 'unsupported') {
      findings.push({
        id: `dep-new-arch:${dep.name}`,
        severity: newArchRequired ? 'blocker' : 'warning',
        title: `${dep.name} does not support the New Architecture`,
        detail: newArchRequired
          ? `React Native ${NEW_ARCH_ONLY_SINCE.replace(/\.0$/, '')}+ has no legacy architecture, so this library will not work after the upgrade.`
          : undefined,
        package: dep.name,
        fix: advice ? `Replace with ${advice.replacement}.` : 'Find a maintained alternative on reactnative.directory, or patch the library.',
        source: dep.directory.source,
      });
    } else if (dir?.newArchitecture === 'untested' && !dep.dev && !advice) {
      findings.push({
        id: `dep-new-arch-untested:${dep.name}`,
        severity: 'warning',
        title: `${dep.name}: New Architecture support is untested`,
        package: dep.name,
        fix: 'Test it with the New Architecture on, or check the library issues for New Architecture reports.',
        source: dep.directory.source,
      });
    }

    if (advice) {
      findings.push({
        id: `dep-replace:${dep.name}`,
        severity: 'warning',
        title: `${dep.name}: ${advice.reason}`,
        package: dep.name,
        fix: `Move to ${advice.replacement}.`,
        source: 'rules (known libraries)',
      });
    } else if (dir?.unmaintained) {
      findings.push({
        id: `dep-unmaintained:${dep.name}`,
        severity: 'warning',
        title: `${dep.name} is marked unmaintained`,
        package: dep.name,
        fix: 'Look for a maintained fork or alternative on reactnative.directory.',
        source: dep.directory.source,
      });
    }

    const npm = dep.npm.value;
    if (npm?.deprecated && !advice) {
      findings.push({
        id: `dep-deprecated:${dep.name}`,
        severity: 'warning',
        title: `${dep.name} is deprecated on npm`,
        detail: npm.deprecated,
        package: dep.name,
        source: dep.npm.source,
      });
    }

    const behind = majorsBehind(dep);
    if (behind > 0) {
      // Native libraries matter for an RN upgrade; plain JS packages rarely block one.
      const native = dir !== undefined;
      findings.push({
        id: `dep-outdated:${dep.name}`,
        severity: native ? 'warning' : 'info',
        title: `${dep.name} ${dep.installed} is ${behind} major version${behind === 1 ? '' : 's'} behind ${npm?.latest}`,
        package: dep.name,
        fix: native ? 'Read its changelog for React Native version requirements and upgrade it together with React Native.' : undefined,
        source: dep.npm.source,
      });
    }
  }
  return findings;
}

function majorsBehind(dep: DependencyInfo): number {
  const latest = dep.npm.value?.latest;
  if (!dep.installed || !latest) return 0;
  return breakingDistance(dep.installed, latest);
}
