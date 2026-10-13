import { NEW_ARCH_ONLY_SINCE, PLATFORM_MINIMUMS, PLAY_POLICY, compareVersions, gte } from '../rules/index.js';
import type { Finding, ProjectContext } from '../types.js';

/**
 * Platform minimums required by the target React Native version: from its template when available, else the newest
 * entry of the fallback rules table it satisfies.
 */
function minimumsFor(ctx: ProjectContext): { minSdk?: number; minIos?: string; label: string; source: string } | undefined {
  const template = ctx.templates?.target.value;
  if (template) {
    return {
      minSdk: template.android.minSdk,
      minIos: template.minIos,
      label: `React Native ${template.version}`,
      source: ctx.templates!.target.source,
    };
  }
  const version = ctx.latestReactNative?.value ?? ctx.reactNativeVersion;
  const rule = version ? PLATFORM_MINIMUMS.find((m) => gte(version, m.since)) : undefined;
  return rule && { minSdk: rule.minSdk, minIos: rule.minIos, label: `React Native ${rule.since.replace(/\.0$/, '')}+`, source: 'rules' };
}

export function checkAndroid(ctx: ProjectContext): Finding[] {
  const android = ctx.android;
  if (!android) return [];
  const source = `android/ (${android.files.join(', ')})`;
  const target = ctx.latestReactNative?.value ?? ctx.reactNativeVersion;
  const findings: Finding[] = [];

  if (android.targetSdk !== undefined && android.targetSdk < PLAY_POLICY.minTargetSdk) {
    findings.push({
      id: 'android-target-sdk',
      severity: 'blocker',
      title: `targetSdkVersion ${android.targetSdk} is below Google Play's minimum (${PLAY_POLICY.minTargetSdk})`,
      detail: PLAY_POLICY.minTargetSdkNote,
      fix: `Set targetSdkVersion (and compileSdkVersion) to ${PLAY_POLICY.minTargetSdk} or higher in android/build.gradle.`,
      source,
    });
  }
  if (android.compileSdk !== undefined && android.targetSdk !== undefined && android.compileSdk < android.targetSdk) {
    findings.push({
      id: 'android-compile-sdk',
      severity: 'warning',
      title: `compileSdkVersion ${android.compileSdk} is lower than targetSdkVersion ${android.targetSdk}`,
      fix: 'Set compileSdkVersion to at least targetSdkVersion.',
      source,
    });
  }

  const required = minimumsFor(ctx);
  if (required?.minSdk !== undefined && android.minSdk !== undefined && android.minSdk < required.minSdk) {
    findings.push({
      id: 'android-min-sdk',
      severity: 'warning',
      title: `minSdkVersion ${android.minSdk} is below ${required.minSdk}, required by ${required.label}`,
      fix: `Raise minSdkVersion to ${required.minSdk}; check how many of your users are on older Android versions first.`,
      source: `${source} + ${required.source}`,
    });
  }

  if (android.newArchEnabled === false) {
    const forced = target !== undefined && gte(target, NEW_ARCH_ONLY_SINCE);
    findings.push({
      id: 'android-new-arch-off',
      severity: forced ? 'warning' : 'info',
      title: 'newArchEnabled=false in android/gradle.properties',
      detail: forced ? `The flag is ignored from React Native ${NEW_ARCH_ONLY_SINCE.replace(/\.0$/, '')}: the app will run on the New Architecture.` : undefined,
      fix: 'Turn it on and test before upgrading.',
      source,
    });
  }
  if (android.hermesEnabled === false) {
    findings.push({
      id: 'android-hermes-off',
      severity: 'info',
      title: 'hermesEnabled=false: the app uses JavaScriptCore on Android',
      detail: 'JavaScriptCore is no longer part of React Native core (it moved to a community package). Hermes is the default engine.',
      fix: 'Switch to Hermes, or add the community JSC package when you upgrade.',
      source,
    });
  }
  return findings;
}

export function checkIos(ctx: ProjectContext): Finding[] {
  const ios = ctx.ios;
  if (!ios) return [];
  const source = ios.files.join(', ');
  const target = ctx.latestReactNative?.value ?? ctx.reactNativeVersion;
  const findings: Finding[] = [];

  const required = minimumsFor(ctx);
  if (required?.minIos && ios.minIos && compareVersions(ios.minIos, required.minIos) < 0) {
    findings.push({
      id: 'ios-min-version',
      severity: 'warning',
      title: `iOS deployment target ${ios.minIos} is below ${required.minIos}, required by ${required.label}`,
      fix: "Use `platform :ios, min_ios_version_supported` in the Podfile so it follows React Native, or raise it by hand.",
      source: `${source} + ${required.source}`,
    });
  }

  if (ios.newArchEnabled === false) {
    const forced = target !== undefined && gte(target, NEW_ARCH_ONLY_SINCE);
    findings.push({
      id: 'ios-new-arch-off',
      severity: forced ? 'warning' : 'info',
      title: "RCT_NEW_ARCH_ENABLED is '0' in the Podfile",
      detail: forced ? `It is ignored from React Native ${NEW_ARCH_ONLY_SINCE.replace(/\.0$/, '')}: the app will run on the New Architecture.` : undefined,
      fix: 'Remove the override, run pod install and test before upgrading.',
      source,
    });
  }

  if (ios.podsReactNativeVersion && ctx.reactNativeVersion && ios.podsReactNativeVersion !== ctx.reactNativeVersion) {
    findings.push({
      id: 'ios-pods-out-of-sync',
      severity: 'warning',
      title: `Podfile.lock has React Native ${ios.podsReactNativeVersion}, node_modules has ${ctx.reactNativeVersion}`,
      fix: 'Run `cd ios && pod install` and commit Podfile.lock.',
      source,
    });
  }
  return findings;
}
