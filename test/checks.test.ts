import { describe, expect, it } from 'vitest';
import { exitCodeFor } from '../src/index.js';
import {
  checkAndroid,
  checkDataGaps,
  checkDependencies,
  checkIos,
  checkPatches,
  checkReactNative,
  rankFindings,
} from '../src/checks/index.js';
import { breakingDistance, compareVersions } from '../src/rules/index.js';
import type { DependencyInfo, Finding, ProjectContext } from '../src/types.js';

function ctx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    cwd: '/app',
    reactNativeVersion: '0.76.9',
    reactNativeVersionSource: 'lockfile',
    reactNativeRange: '^0.76.0',
    installed: {},
    declared: {},
    devOnly: [],
    latestReactNative: { value: '0.87.1', source: 'npm registry' },
    ...overrides,
  };
}

function dep(name: string, overrides: Partial<DependencyInfo> = {}): DependencyInfo {
  return {
    name,
    declared: '*',
    installed: '1.0.0',
    dev: false,
    npm: { value: { latest: '1.0.0' }, source: 'npm registry' },
    directory: { value: { newArchitecture: 'supported', unmaintained: false }, source: 'React Native Directory' },
    ...overrides,
  };
}

const ids = (findings: Finding[]) => findings.map((f) => `${f.severity}:${f.id}`);

describe('semver helpers', () => {
  it('compares versions including prereleases', () => {
    expect(compareVersions('0.76.9', '0.76.10')).toBeLessThan(0);
    expect(compareVersions('0.77.0-rc.1', '0.77.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('counts minors for 0.x and majors otherwise', () => {
    expect(breakingDistance('0.76.9', '0.87.1')).toBe(11);
    expect(breakingDistance('2.12.2', '4.3.2')).toBe(2);
    expect(breakingDistance('4.0.0', '3.0.0')).toBe(0);
  });
});

describe('checkReactNative', () => {
  it('reports the gap, the New Architecture switch and 16 KB for an old app', () => {
    expect(ids(checkReactNative(ctx()))).toEqual(['warning:rn-version-gap', 'warning:rn-new-arch-only', 'warning:rn-16kb']);
  });

  it('is quiet on the latest version', () => {
    expect(checkReactNative(ctx({ reactNativeVersion: '0.87.1' }))).toEqual([]);
  });

  it('reports a small gap as info', () => {
    expect(ids(checkReactNative(ctx({ reactNativeVersion: '0.85.0' })))).toEqual(['info:rn-version-gap']);
  });
});

describe('checkDependencies', () => {
  it('blocks on unsupported New Architecture when the target is New Architecture only', () => {
    const findings = checkDependencies(
      ctx({ dependencies: [dep('legacy-lib', { directory: { value: { newArchitecture: 'unsupported', unmaintained: false }, source: 'RND' } })] }),
    );
    expect(ids(findings)).toEqual(['blocker:dep-new-arch:legacy-lib']);
  });

  it('only warns about unsupported libraries when the target still has the legacy architecture', () => {
    const findings = checkDependencies(
      ctx({
        reactNativeVersion: '0.79.0',
        latestReactNative: { value: '0.80.0', source: 'test' },
        dependencies: [dep('legacy-lib', { directory: { value: { newArchitecture: 'unsupported', unmaintained: false }, source: 'RND' } })],
      }),
    );
    expect(ids(findings)).toEqual(['warning:dep-new-arch:legacy-lib']);
  });

  it('uses the known libraries table, unmaintained flag, deprecation and outdated majors', () => {
    const findings = checkDependencies(
      ctx({
        dependencies: [
          dep('react-native-camera', { directory: { value: { newArchitecture: 'untested', unmaintained: true }, source: 'RND' } }),
          dep('old-lib', { directory: { value: { newArchitecture: 'supported', unmaintained: true }, source: 'RND' } }),
          dep('gone', { npm: { value: { latest: '1.0.0', deprecated: 'no longer maintained' }, source: 'npm' }, directory: { source: 'not listed' } }),
          dep('native-behind', { installed: '2.1.0', npm: { value: { latest: '4.0.0' }, source: 'npm' } }),
          dep('js-behind', { installed: '2.1.0', npm: { value: { latest: '3.0.0' }, source: 'npm' }, directory: { source: 'not listed' } }),
        ],
      }),
    );
    expect(ids(findings)).toEqual([
      'warning:dep-replace:react-native-camera',
      'warning:dep-unmaintained:old-lib',
      'warning:dep-deprecated:gone',
      'warning:dep-outdated:native-behind',
      'info:dep-outdated:js-behind',
    ]);
  });
});

describe('platform checks', () => {
  it('flags Android SDK levels and flags', () => {
    const findings = checkAndroid(
      ctx({ android: { minSdk: 23, compileSdk: 33, targetSdk: 34, newArchEnabled: false, hermesEnabled: false, files: ['android/build.gradle'] } }),
    );
    expect(ids(findings)).toEqual([
      'blocker:android-target-sdk',
      'warning:android-compile-sdk',
      'warning:android-min-sdk',
      'warning:android-new-arch-off',
      'info:android-hermes-off',
    ]);
  });

  it('accepts a current Android config', () => {
    expect(checkAndroid(ctx({ android: { minSdk: 24, compileSdk: 36, targetSdk: 36, newArchEnabled: true, files: [] } }))).toEqual([]);
  });

  it('flags iOS deployment target, New Architecture override and stale pods', () => {
    const findings = checkIos(
      ctx({ ios: { minIos: '13.4', usesRnMinIos: false, newArchEnabled: false, podsReactNativeVersion: '0.76.2', files: ['ios/Podfile'] } }),
    );
    expect(ids(findings)).toEqual(['warning:ios-min-version', 'warning:ios-new-arch-off', 'warning:ios-pods-out-of-sync']);
  });
});

describe('checkPatches', () => {
  it('warns when the patched version is not the installed one', () => {
    const findings = checkPatches(
      ctx({
        installed: { a: '1.0.1', b: '2.0.0' },
        patches: [
          { file: 'patches/a+1.0.0.patch', package: 'a', version: '1.0.0' },
          { file: 'patches/b+2.0.0.patch', package: 'b', version: '2.0.0' },
        ],
      }),
    );
    expect(ids(findings)).toEqual(['warning:patch:a', 'info:patch:b']);
  });
});

describe('rankFindings', () => {
  it('orders by severity and keeps check order within a severity', () => {
    const f = (id: string, severity: Finding['severity']): Finding => ({ id, severity, title: id, source: 'test' });
    expect(rankFindings([f('a', 'info'), f('b', 'warning'), f('c', 'blocker'), f('d', 'warning')]).map((x) => x.id)).toEqual([
      'c',
      'b',
      'd',
      'a',
    ]);
  });
});

describe('checkDataGaps', () => {
  it('reports a missing lockfile', () => {
    expect(ids(checkDataGaps(ctx({ declared: { 'react-native': '^0.85.0' } })))).toEqual(['warning:data-lockfile-missing']);
    expect(checkDataGaps(ctx({ declared: { 'react-native': '^0.85.0' }, lockfile: '/app/yarn.lock' }))).toEqual([]);
  });

  it('reports registry data that could not be fetched, but not packages that are simply not listed', () => {
    const findings = checkDataGaps(
      ctx({
        lockfile: '/app/package-lock.json',
        dependencies: [
          dep('fetched'),
          dep('private-pkg', { npm: { source: 'not on npm' }, directory: { source: 'not listed in React Native Directory' } }),
          dep('offline-pkg', { npm: { source: 'offline, not cached' } }),
          dep('down-pkg', { directory: { source: 'React Native Directory unreachable' } }),
        ],
      }),
    );
    expect(ids(findings)).toEqual(['warning:data-registry-unavailable']);
    expect(findings[0].title).toBe('Registry data missing for 2 of 4 dependencies');
    expect(findings[0].detail).toContain('offline-pkg, down-pkg');
  });
});

describe('exitCodeFor', () => {
  const report = (blockers: number, source = 'npm registry') =>
    ({
      summary: { blockers, warnings: 0, info: 0 },
      dependencies: [dep('x', { npm: { source } })],
      native: { currentSource: 'React Native template', targetSource: 'React Native template', rows: [] },
    }) as unknown as Parameters<typeof exitCodeFor>[0];

  it('returns 1 for blockers and 0 otherwise', () => {
    expect(exitCodeFor(report(2), { ci: false })).toBe(1);
    expect(exitCodeFor(report(0), { ci: true })).toBe(0);
  });

  it('returns 2 in CI when a registry was unreachable, but not for --offline', () => {
    expect(exitCodeFor(report(0, 'npm registry unreachable'), { ci: true })).toBe(2);
    expect(exitCodeFor(report(0, 'npm registry unreachable'), { ci: false })).toBe(0);
    expect(exitCodeFor(report(0, 'offline, not cached'), { ci: true })).toBe(0);
  });
});
