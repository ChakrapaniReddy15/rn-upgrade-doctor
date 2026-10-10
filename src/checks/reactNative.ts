import {
  NEW_ARCH_DEFAULT_SINCE,
  NEW_ARCH_ONLY_SINCE,
  PLAY_POLICY,
  SIXTEEN_KB_SINCE,
  breakingDistance,
  gte,
  upgradeHelperUrl,
} from '../rules/index.js';
import type { Finding, ProjectContext } from '../types.js';

/** Version gap to the latest React Native and the milestones crossed on the way. */
export function checkReactNative(ctx: ProjectContext): Finding[] {
  const current = ctx.reactNativeVersion;
  const latest = ctx.latestReactNative?.value;
  const source = ctx.reactNativeVersionSource === 'lockfile' ? 'lockfile' : 'package.json';
  if (!current) {
    return [
      {
        id: 'rn-version-unknown',
        severity: 'warning',
        title: `Could not read the React Native version from "${ctx.reactNativeRange}"`,
        fix: 'Pin react-native to a version number in package.json and install, so the lockfile records it.',
        source: 'package.json',
      },
    ];
  }

  const findings: Finding[] = [];
  if (latest) {
    const gap = breakingDistance(current, latest);
    if (gap > 0) {
      findings.push({
        id: 'rn-version-gap',
        severity: gap >= 3 ? 'warning' : 'info',
        title: `React Native ${current} is ${gap} release${gap === 1 ? '' : 's'} behind ${latest}`,
        detail: 'Each React Native minor release can contain breaking changes to native project files.',
        package: 'react-native',
        fix: `Follow the upgrade helper diff: ${upgradeHelperUrl(current, latest)}`,
        source: `${source} + ${ctx.latestReactNative?.source}`,
      });
    }
  }

  const target = latest ?? current;
  if (!gte(current, NEW_ARCH_ONLY_SINCE) && gte(target, NEW_ARCH_ONLY_SINCE)) {
    findings.push({
      id: 'rn-new-arch-only',
      severity: 'warning',
      title: `React Native ${NEW_ARCH_ONLY_SINCE.replace(/\.0$/, '')}+ runs only on the New Architecture`,
      detail: gte(current, NEW_ARCH_DEFAULT_SINCE)
        ? 'Your app can still turn the New Architecture off today; after this upgrade it cannot.'
        : `Your version predates the New Architecture default (${NEW_ARCH_DEFAULT_SINCE}). Every native library must support it.`,
      fix: 'Turn on newArchEnabled (Android) and RCT_NEW_ARCH_ENABLED (iOS) on your current version first and fix what breaks, then upgrade.',
      source: 'rules (React Native release notes)',
    });
  }

  if (!gte(current, SIXTEEN_KB_SINCE)) {
    findings.push({
      id: 'rn-16kb',
      severity: 'warning',
      title: `React Native ${current} is older than ${SIXTEEN_KB_SINCE}, the first release built for 16 KB page sizes`,
      detail: PLAY_POLICY.sixteenKbNote,
      package: 'react-native',
      fix: `Upgrade to React Native ${SIXTEEN_KB_SINCE} or newer, then scan the release build with --apk.`,
      source: 'rules (React Native release notes, Google Play policy)',
    });
  }
  return findings;
}
