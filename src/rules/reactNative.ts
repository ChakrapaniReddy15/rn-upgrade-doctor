/**
 * React Native and store-policy rules. Data only; checks read it from here.
 * Sources: React Native release blog posts and changelogs, Android developer docs, Google Play policy pages.
 * Bump RULES_AS_OF whenever a value is reviewed.
 */
export const RULES_AS_OF = '2026-10';

/** New Architecture is on by default from this version. */
export const NEW_ARCH_DEFAULT_SINCE = '0.76.0';
/** From this version the legacy architecture can no longer be turned on: every native library must support the New Architecture. */
export const NEW_ARCH_ONLY_SINCE = '0.82.0';
/** First React Native release whose own native libraries are built for 16 KB page sizes. */
export const SIXTEEN_KB_SINCE = '0.77.0';

/**
 * Fallback minimum platform versions, used only when the React Native template (src/registry/template.ts) is not
 * available, e.g. offline without a cache. Newest first.
 */
export const PLATFORM_MINIMUMS: Array<{ since: string; minSdk: number; minIos: string }> = [
  { since: '0.76.0', minSdk: 24, minIos: '15.1' },
  { since: '0.74.0', minSdk: 23, minIos: '13.4' },
  { since: '0.73.0', minSdk: 21, minIos: '13.4' },
];

/**
 * Google Play rules (phone and tablet apps). Checked 2026-10-13 against
 * developer.android.com/google/play/requirements/target-sdk and developer.android.com/guide/practices/page-sizes.
 * Play raises the target API level every August, so re-check this yearly.
 */
export const PLAY_POLICY = {
  /** Lowest targetSdk Google Play accepts for new apps and app updates. */
  minTargetSdk: 36,
  minTargetSdkNote:
    'Since 31 Aug 2026, Google Play requires new apps and app updates to target API 36 (Android 16) or higher ' +
    '(an extension to 1 Nov 2026 can be requested). Existing apps below API 35 are hidden from new users on newer Android versions.',
  /** One-line form for report headings. */
  sixteenKbShort: 'from 1 Feb 2027, Google Play blocks app updates without 16 KB support',
  /** The fix when uncompressed libraries are not 16 KB aligned in the APK: one build setting, not a per-library fix. */
  zipAlignFix:
    'Build with Android Gradle Plugin 8.5.1 or newer; if you align or sign the APK yourself, run `zipalign -P 16` before `apksigner`.',
  sixteenKbNote:
    'Google Play requires apps targeting Android 15+ to support 16 KB memory page sizes on 64-bit devices; ' +
    'from 1 Feb 2027, app updates that do not cannot be released.',
};

export function upgradeHelperUrl(from: string, to: string): string {
  return `https://react-native-community.github.io/upgrade-helper/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
