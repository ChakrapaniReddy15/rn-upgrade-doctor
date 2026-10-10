import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAndroidConfig } from '../src/android/index.js';
import { parsePodfile, parsePodfileLock, readIosConfig } from '../src/ios/index.js';
import { parsePatchFileName, readPatches } from '../src/project/patches.js';
import { tempDir, writeTree } from './helpers.js';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir('platforms'));
});

afterEach(() => cleanup());

describe('readAndroidConfig', () => {
  it('reads the Groovy template (values in root ext, app points at rootProject.ext)', async () => {
    await writeTree(dir, {
      'android/build.gradle': `buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 34 // bump next release
        // targetSdkVersion = 21
        /* minSdkVersion = 1 */
        ndkVersion = "27.1.12297006"
        kotlinVersion = "2.0.21"
    }
}`,
      'android/app/build.gradle': `android {
    ndkVersion rootProject.ext.ndkVersion
    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
    }
}`,
      'android/gradle.properties': '# comment\nnewArchEnabled=true\nhermesEnabled = false\n',
      'android/gradle/wrapper/gradle-wrapper.properties':
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-all.zip\n',
    });
    expect(await readAndroidConfig(dir)).toEqual({
      minSdk: 24,
      compileSdk: 35,
      targetSdk: 34,
      ndkVersion: '27.1.12297006',
      kotlinVersion: '2.0.21',
      gradleVersion: '8.10.2',
      newArchEnabled: true,
      hermesEnabled: false,
      files: [
        'android/build.gradle',
        'android/app/build.gradle',
        'android/gradle.properties',
        'android/gradle/wrapper/gradle-wrapper.properties',
      ],
    });
  });

  it('prefers literals in the app module and reads the Kotlin DSL', async () => {
    await writeTree(dir, {
      'android/build.gradle': 'ext { minSdkVersion = 23 }',
      'android/app/build.gradle.kts': 'android {\n  compileSdk = 36\n  defaultConfig {\n    minSdk = 26\n    targetSdk = 36\n  }\n}',
    });
    expect(await readAndroidConfig(dir)).toMatchObject({ minSdk: 26, compileSdk: 36, targetSdk: 36 });
  });

  it('returns undefined without an android folder', async () => {
    expect(await readAndroidConfig(dir)).toBeUndefined();
  });
});

describe('iOS', () => {
  it('parses a Podfile with a literal platform and flags', () => {
    const podfile = `# platform :ios, '9.0'
platform :ios, '13.4'
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
target 'App' do
  use_react_native!(:path => config[:reactNativePath], :hermes_enabled => false)
end`;
    expect(parsePodfile(podfile)).toEqual({ minIos: '13.4', usesRnMinIos: false, newArchEnabled: false, hermesEnabled: false });
  });

  it('recognises min_ios_version_supported', () => {
    expect(parsePodfile('platform :ios, min_ios_version_supported\n')).toEqual({
      minIos: undefined,
      usesRnMinIos: true,
      newArchEnabled: undefined,
      hermesEnabled: undefined,
    });
  });

  it('reads React-Core and CocoaPods versions from Podfile.lock', () => {
    const lock = 'PODS:\n  - React-Core (0.76.5):\n    - glog\n  - React-Core/Default (0.76.5)\n\nCOCOAPODS: 1.15.2\n';
    expect(parsePodfileLock(lock)).toEqual({ podsReactNativeVersion: '0.76.5', cocoapodsVersion: '1.15.2' });
  });

  it('reads both files from ios/', async () => {
    await writeTree(dir, { 'ios/Podfile': "platform :ios, '15.1'\n", 'ios/Podfile.lock': 'COCOAPODS: 1.16.2\n' });
    expect(await readIosConfig(dir)).toMatchObject({ minIos: '15.1', cocoapodsVersion: '1.16.2', files: ['ios/Podfile', 'ios/Podfile.lock'] });
    expect(await readIosConfig(`${dir}/missing`)).toBeUndefined();
  });
});

describe('patches', () => {
  it.each([
    ['react-native+0.76.5.patch', { package: 'react-native', version: '0.76.5' }],
    ['@scope+native-lib+2.1.4.patch', { package: '@scope/native-lib', version: '2.1.4' }],
    ['parent++@scope+child+1.0.0-beta.1.dev.patch', { package: '@scope/child', version: '1.0.0-beta.1' }],
  ])('parses %s', (file, expected) => {
    expect(parsePatchFileName(file)).toEqual(expected);
  });

  it('reads patches/ and pnpm patchedDependencies', async () => {
    await writeTree(dir, { 'patches/react-native-thing+1.2.3.patch': '', 'patches/README.md': '' });
    const pkg = { pnpm: { patchedDependencies: { '@scope/lib@2.0.0': 'patches/@scope__lib@2.0.0.patch' } } };
    expect(await readPatches(dir, pkg)).toEqual([
      { file: 'patches/react-native-thing+1.2.3.patch', package: 'react-native-thing', version: '1.2.3' },
      { file: 'patches/@scope__lib@2.0.0.patch', package: '@scope/lib', version: '2.0.0' },
    ]);
  });
});
