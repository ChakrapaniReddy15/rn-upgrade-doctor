import { PLAY_POLICY, compareVersions, upgradeHelperUrl } from '../rules/index.js';
import type { Finding, NativeComparison, NativeRow, NativeStatus, ProjectContext, TemplateInfo } from '../types.js';

type AndroidValues = TemplateInfo['android'];
type VersionKey = 'targetSdk' | 'compileSdk' | 'minSdk' | 'buildToolsVersion' | 'ndkVersion' | 'kotlinVersion' | 'gradleVersion';

const ANDROID_VERSIONS: Array<[VersionKey, string]> = [
  ['targetSdk', 'targetSdk'],
  ['compileSdk', 'compileSdk'],
  ['minSdk', 'minSdk'],
  ['buildToolsVersion', 'Build tools'],
  ['ndkVersion', 'NDK'],
  ['kotlinVersion', 'Kotlin'],
  ['gradleVersion', 'Gradle'],
];
/** Build settings that, when behind the template, commonly break an upgrade build. */
const BUILD_KEYS: string[] = ['targetSdk', 'compileSdk', 'buildToolsVersion', 'ndkVersion', 'kotlinVersion', 'gradleVersion'];

/**
 * Your Android and iOS settings next to the React Native template for your current and the target version.
 * "behind" = already behind your own version's template; "raised" = the upgrade raises it.
 */
export function compareNative(ctx: ProjectContext): NativeComparison {
  const t = ctx.templates;
  const current = t?.current.value;
  const target = t?.target.value;
  const rows: NativeRow[] = [];

  const a = ctx.android;
  if (a) {
    for (const [key, label] of ANDROID_VERSIONS) {
      rows.push(versionRow('Android', key, label, a[key], current?.android[key], target?.android[key]));
    }
    rows.push(flagRow('Android', 'newArchEnabled', 'New Architecture', a.newArchEnabled, current?.android.newArchEnabled, target?.android.newArchEnabled));
    rows.push(flagRow('Android', 'hermesEnabled', 'Hermes', a.hermesEnabled, current?.android.hermesEnabled, target?.android.hermesEnabled));
  }

  const i = ctx.ios;
  if (i) {
    // `min_ios_version_supported` follows React Native, so it is always equal to the template of the installed version.
    const yours = i.minIos ?? (i.usesRnMinIos ? current?.minIos : undefined);
    const row = versionRow('iOS', 'minIos', 'Deployment target', yours, current?.minIos, target?.minIos);
    if (!i.minIos && i.usesRnMinIos) row.yours = `follows React Native${yours ? ` (${yours})` : ''}`;
    rows.push(row);
    // The template's Podfile has no New Architecture switch; React Native's default is the same on both platforms.
    rows.push(flagRow('iOS', 'newArchEnabled', 'New Architecture', i.newArchEnabled, current?.android.newArchEnabled, target?.android.newArchEnabled));
  }

  return {
    currentVersion: t?.currentVersion,
    currentSource: t?.current.source ?? 'not looked up',
    targetVersion: t?.targetVersion,
    targetSource: t?.target.source ?? 'not looked up',
    rows,
  };
}

function versionRow(
  platform: NativeRow['platform'],
  key: string,
  label: string,
  yours: number | string | undefined,
  current: number | string | undefined,
  target: number | string | undefined,
): NativeRow {
  const row: NativeRow = { platform, key, label, yours: yours === undefined ? 'not found' : String(yours), status: 'unknown' };
  if (current !== undefined) row.current = String(current);
  if (target !== undefined) row.target = String(target);
  if (yours === undefined || target === undefined) return row;

  const vsTarget = compareVersions(String(yours), String(target));
  if ((key === 'minSdk' || key === 'minIos') && vsTarget < 0) row.status = 'below-required';
  else if (key === 'targetSdk' && Number(yours) < PLAY_POLICY.minTargetSdk) row.status = 'below-required';
  else if (vsTarget < 0) row.status = current !== undefined && compareVersions(String(yours), String(current)) < 0 ? 'behind' : 'raised';
  else row.status = vsTarget > 0 && key !== 'minSdk' && key !== 'minIos' ? 'newer' : 'ok';
  return row;
}

/** A flag that is not set uses React Native's default, which is what the template of the installed version sets. */
function flagRow(
  platform: NativeRow['platform'],
  key: string,
  label: string,
  yours: boolean | undefined,
  current: boolean | undefined,
  target: boolean | undefined,
): NativeRow {
  const show = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'on' : 'off');
  const effective = yours ?? current;
  const row: NativeRow = {
    platform,
    key,
    label,
    yours: yours === undefined ? `not set${effective === undefined ? '' : ` (default: ${show(effective)})`}` : show(yours)!,
    status: 'unknown',
  };
  if (current !== undefined) row.current = show(current);
  if (target !== undefined) row.target = show(target);
  if (effective !== undefined && target !== undefined) row.status = effective === target ? 'ok' : 'differs';
  return row;
}

/** Android build settings behind the target template, in one finding with the upgrade-helper link. */
export function checkNativeTemplate(ctx: ProjectContext): Finding[] {
  const native = compareNative(ctx);
  const gaps = native.rows.filter((r) => r.platform === 'Android' && BUILD_KEYS.includes(r.key) && (r.status === 'raised' || r.status === 'behind'));
  if (gaps.length === 0 || !native.targetVersion) return [];

  const current = native.currentVersion;
  const behind = gaps.filter((r) => r.status === 'behind');
  return [
    {
      id: 'android-template-gap',
      severity: 'warning',
      title: `${gaps.length} Android build setting${gaps.length === 1 ? ' is' : 's are'} behind the React Native ${native.targetVersion} template`,
      detail:
        gaps.map((r) => `${r.label} ${r.yours} → ${r.target}`).join(', ') +
        (behind.length > 0 && current
          ? `. Already behind your own version's template (${current}): ${behind.map((r) => r.label).join(', ')}.`
          : '.'),
      fix: current
        ? `Apply the android/ changes from the upgrade helper diff: ${upgradeHelperUrl(current, native.targetVersion)}`
        : 'Compare android/ with a new app created from the React Native template.',
      source: native.targetSource,
    },
  ];
}
