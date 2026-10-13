import { parseAndroidFiles } from '../android/gradle.js';
import { parsePodfile } from '../ios/podfile.js';
import type { Sourced, TemplateInfo } from '../types.js';
import { FileCache } from './cache.js';
import { fetchText as defaultFetchText } from './http.js';
import type { RegistryOptions } from './npm.js';

/**
 * Native settings of the official React Native app template for one release, as used by the upgrade helper.
 * Source: github.com/react-native-community/rn-diff-purge, branch release/<version>, folder RnDiffApp/
 * (verified 2026-10). A release's template never changes, so it is cached without expiry.
 */
const DIFF_PURGE = 'https://raw.githubusercontent.com/react-native-community/rn-diff-purge';
const RN_SOURCE = 'https://raw.githubusercontent.com/facebook/react-native';
/** Where React Native defines min_ios_version_supported, newest layout first. */
const MIN_IOS_FILES = [
  'packages/react-native/scripts/cocoapods/helpers.rb',
  'packages/react-native/scripts/react_native_pods.rb',
  'scripts/cocoapods/helpers.rb',
  'scripts/react_native_pods.rb',
];
const NAMESPACE = 'rn-template';
/** "No template for this version" is re-checked after a day; a found template is kept forever. */
const MISSING_TTL_MS = 24 * 60 * 60 * 1000;
const SOURCE = 'React Native template';

export async function getTemplate(version: string, options: RegistryOptions): Promise<Sourced<TemplateInfo>> {
  const cache = options.cache ?? new FileCache();
  const cached = await cache.get<TemplateInfo | null>(NAMESPACE, version);
  // Entries cached before `packages` was added are refreshed once when online.
  if (cached?.value && (cached.value.packages || options.offline)) return { value: cached.value, source: `${SOURCE} (cache)` };
  if (cached?.value === null && (options.offline || Date.now() - cached.fetchedAt < MISSING_TTL_MS)) {
    return { source: `no ${SOURCE.toLowerCase()} for ${version}` };
  }
  if (options.offline) return { source: 'offline, not cached' };

  const fetchText = options.fetchText ?? defaultFetchText;
  const get = async (url: string): Promise<string | undefined> => {
    const { status, text } = await fetchText(url);
    if (status === 404) return undefined;
    if (status !== 200) throw new Error(`HTTP ${status}`);
    return text;
  };

  try {
    const base = `${DIFF_PURGE}/release/${encodeURIComponent(version)}/RnDiffApp`;
    const [root, app, properties, wrapper, podfile, packageJson] = await Promise.all([
      get(`${base}/android/build.gradle`),
      get(`${base}/android/app/build.gradle`),
      get(`${base}/android/gradle.properties`),
      get(`${base}/android/gradle/wrapper/gradle-wrapper.properties`),
      get(`${base}/ios/Podfile`),
      get(`${base}/package.json`),
    ]);
    if (root === undefined) {
      await cache.set(NAMESPACE, version, null);
      return { source: `no ${SOURCE.toLowerCase()} for ${version}` };
    }

    const ios = podfile === undefined ? undefined : parsePodfile(podfile);
    let minIos = ios?.minIos;
    if (!minIos && ios?.usesRnMinIos) {
      for (const file of MIN_IOS_FILES) {
        const text = await get(`${RN_SOURCE}/v${encodeURIComponent(version)}/${file}`);
        minIos = text === undefined ? undefined : parseMinIos(text);
        if (minIos) break;
      }
    }

    const pkg = packageJson === undefined ? undefined : (JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> });
    const value: TemplateInfo = {
      version,
      android: parseAndroidFiles({ root, app, properties, wrapper }),
      minIos,
      packages: { ...pkg?.devDependencies, ...pkg?.dependencies },
    };
    await cache.set(NAMESPACE, version, value);
    return { value, source: SOURCE };
  } catch {
    return { source: `${SOURCE} unreachable` };
  }
}

/** `def self.min_ios_version_supported` / `def min_ios_version_supported` followed by `return '15.1'`. */
export function parseMinIos(rubySource: string): string | undefined {
  return /def\s+(?:self\.)?min_ios_version_supported\s*(?:\(\s*\))?\s*\n\s*return\s+['"]([\d.]+)['"]/.exec(rubySource)?.[1];
}
