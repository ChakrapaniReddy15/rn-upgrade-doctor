import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkNativeTemplate, compareNative } from '../src/checks/index.js';
import { exitCodeFor } from '../src/index.js';
import { FileCache, getTemplate, parseMinIos, type fetchText } from '../src/registry/index.js';
import type { ProjectContext, Report, TemplateInfo } from '../src/types.js';
import { tempDir } from './helpers.js';

const template = (version: string, android: Partial<TemplateInfo['android']>, minIos = '15.1'): TemplateInfo => ({
  version,
  android: { newArchEnabled: true, hermesEnabled: true, ...android },
  minIos,
});

const T084 = template('0.84.1', { minSdk: 24, compileSdk: 36, targetSdk: 36, buildToolsVersion: '36.0.0', ndkVersion: '27.1.12297006', kotlinVersion: '2.1.20', gradleVersion: '9.0.0' });
const T087 = template('0.87.1', { minSdk: 24, compileSdk: 37, targetSdk: 36, buildToolsVersion: '37.0.0', ndkVersion: '27.1.12297006', kotlinVersion: '2.2.0', gradleVersion: '9.4.1' });

function ctx(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    cwd: '/app',
    reactNativeVersion: '0.84.1',
    reactNativeVersionSource: 'lockfile',
    installed: {},
    declared: {},
    devOnly: [],
    templates: {
      currentVersion: '0.84.1',
      current: { value: T084, source: 'React Native template' },
      targetVersion: '0.87.1',
      target: { value: T087, source: 'React Native template' },
    },
    ...overrides,
  };
}

const status = (c: ProjectContext) => Object.fromEntries(compareNative(c).rows.map((r) => [`${r.platform}:${r.key}`, r.status]));

describe('compareNative', () => {
  it('labels each setting against the current and target templates', () => {
    const result = status(
      ctx({
        android: {
          targetSdk: 34, // below the Play minimum
          compileSdk: 36, // equal to the current template, raised by the upgrade
          minSdk: 23, // below the target's minimum
          buildToolsVersion: '35.0.0', // already behind the current template
          ndkVersion: '28.0.13004108', // newer than the template: fine
          kotlinVersion: '2.2.0', // equal
          newArchEnabled: false, // differs
          files: [],
        },
        ios: { minIos: '16.0', usesRnMinIos: false, files: [] },
      }),
    );
    expect(result).toEqual({
      'Android:targetSdk': 'below-required',
      'Android:compileSdk': 'raised',
      'Android:minSdk': 'below-required',
      'Android:buildToolsVersion': 'behind',
      'Android:ndkVersion': 'newer',
      'Android:kotlinVersion': 'ok',
      'Android:gradleVersion': 'unknown',
      'Android:newArchEnabled': 'differs',
      'Android:hermesEnabled': 'ok',
      'iOS:minIos': 'ok',
      'iOS:newArchEnabled': 'ok',
    });
  });

  it('treats min_ios_version_supported as following React Native', () => {
    const rows = compareNative(ctx({ ios: { usesRnMinIos: true, files: [] } })).rows;
    expect(rows.find((r) => r.key === 'minIos')).toMatchObject({ yours: 'follows React Native (15.1)', status: 'ok' });
  });

  it('shows unknown when no template is available', () => {
    const c = ctx({
      android: { targetSdk: 36, files: [] },
      templates: { currentVersion: '0.84.1', current: { source: 'offline, not cached' }, targetVersion: '0.84.1', target: { source: 'offline, not cached' } },
    });
    expect(compareNative(c).rows.every((r) => r.status === 'unknown')).toBe(true);
    expect(checkNativeTemplate(c)).toEqual([]);
  });
});

describe('checkNativeTemplate', () => {
  it('lists Android build settings behind the target template in one finding', () => {
    const findings = checkNativeTemplate(
      ctx({ android: { targetSdk: 36, compileSdk: 36, buildToolsVersion: '35.0.0', kotlinVersion: '2.1.20', gradleVersion: '9.4.1', files: [] } }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'android-template-gap', severity: 'warning' });
    expect(findings[0].detail).toBe(
      "compileSdk 36 → 37, Build tools 35.0.0 → 37.0.0, Kotlin 2.1.20 → 2.2.0. Already behind your own version's template (0.84.1): Build tools.",
    );
    expect(findings[0].fix).toContain('upgrade-helper/?from=0.84.1&to=0.87.1');
  });

  it('is quiet when everything matches', () => {
    expect(checkNativeTemplate(ctx({ android: { ...T087.android, files: [] } }))).toEqual([]);
  });
});

describe('parseMinIos', () => {
  it('reads the newer helpers.rb and the older react_native_pods.rb forms', () => {
    expect(parseMinIos("module Helpers\n  class Constants\n    def self.min_ios_version_supported\n      return '15.1'\n    end")).toBe('15.1');
    expect(parseMinIos("def min_ios_version_supported\n  return '12.4'\nend")).toBe('12.4');
    expect(parseMinIos('nothing here')).toBeUndefined();
  });
});

describe('getTemplate', () => {
  let cache: FileCache;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tmp = await tempDir('template');
    cache = new FileCache(tmp.dir);
    cleanup = tmp.cleanup;
  });

  afterEach(() => cleanup());

  const files: Record<string, string> = {
    'android/build.gradle': 'buildscript {\n  ext {\n    buildToolsVersion = "37.0.0"\n    minSdkVersion = 24\n    compileSdkVersion = 37\n    targetSdkVersion = 36\n    ndkVersion = "27.1.12297006"\n    kotlinVersion = "2.2.0"\n  }\n}\n',
    'android/app/build.gradle': 'android {\n  defaultConfig {\n    minSdkVersion rootProject.ext.minSdkVersion\n  }\n}\n',
    'android/gradle.properties': 'newArchEnabled=true\nhermesEnabled=true\n',
    'android/gradle/wrapper/gradle-wrapper.properties': 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.1-bin.zip\n',
    'ios/Podfile': 'platform :ios, min_ios_version_supported\n',
  };

  const fakeFetch = () =>
    vi.fn<typeof fetchText>(async (url) => {
      const diff = /release\/0\.87\.1\/RnDiffApp\/(.+)$/.exec(url);
      if (diff && files[diff[1]]) return { status: 200, text: files[diff[1]] };
      if (url.endsWith('/v0.87.1/packages/react-native/scripts/cocoapods/helpers.rb')) {
        return { status: 200, text: "def self.min_ios_version_supported\n  return '15.1'\nend" };
      }
      return { status: 404, text: '404: Not Found' };
    });

  it('reads the template, resolves min_ios_version_supported and caches it permanently', async () => {
    const fetchText = fakeFetch();
    const result = await getTemplate('0.87.1', { offline: false, cache, fetchText });
    expect(result).toEqual({
      source: 'React Native template',
      value: {
        version: '0.87.1',
        minIos: '15.1',
        android: {
          minSdk: 24,
          compileSdk: 37,
          targetSdk: 36,
          buildToolsVersion: '37.0.0',
          ndkVersion: '27.1.12297006',
          kotlinVersion: '2.2.0',
          gradleVersion: '9.4.1',
          newArchEnabled: true,
          hermesEnabled: true,
        },
      },
    });
    const calls = fetchText.mock.calls.length;
    expect((await getTemplate('0.87.1', { offline: true, cache, fetchText })).source).toBe('React Native template (cache)');
    expect(fetchText.mock.calls.length).toBe(calls);
  });

  it('reports a version without a template, offline without cache, and network failures', async () => {
    expect((await getTemplate('0.99.0', { offline: false, cache, fetchText: fakeFetch() })).source).toBe('no react native template for 0.99.0');
    expect(await getTemplate('0.86.0', { offline: true, cache })).toEqual({ source: 'offline, not cached' });
    const failing = vi.fn<typeof fetchText>(async () => {
      throw new Error('ENOTFOUND');
    });
    expect(await getTemplate('0.86.0', { offline: false, cache, fetchText: failing })).toEqual({ source: 'React Native template unreachable' });
  });
});

describe('exit code', () => {
  it('returns 2 in CI when the React Native template could not be reached', () => {
    const report = {
      summary: { blockers: 0, warnings: 0, info: 0 },
      dependencies: [],
      native: { currentSource: 'React Native template unreachable', targetSource: 'React Native template unreachable', rows: [] },
    } as unknown as Report;
    expect(exitCodeFor(report, { ci: true })).toBe(2);
    expect(exitCodeFor(report, { ci: false })).toBe(0);
  });
});
