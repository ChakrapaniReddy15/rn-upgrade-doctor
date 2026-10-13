import { describe, expect, it } from 'vitest';
import { googleCheck, scopeText, summarizeApk, verdictText } from '../src/report/apkSummary.js';
import type { NativeLib, Report } from '../src/types.js';

const lib = (name: string, abi: string, overrides: Partial<NativeLib> = {}): NativeLib => ({
  path: `lib/${abi}/${name}`,
  abi,
  name,
  is64Bit: abi === 'arm64-v8a' || abi === 'x86_64',
  loadAlign: 16384,
  elfOk: true,
  stored: true,
  zipAligned: true,
  package: 'react-native',
  packageSource: 'known table',
  ...overrides,
});

const report = (libs: NativeLib[], file = '/work/My App/android/app/release/app-release.apk', kind: 'apk' | 'aab' = 'apk') =>
  ({ meta: { cwd: '/work/My App' }, apk: { file, kind, libs } }) as unknown as Report;

describe('summarizeApk', () => {
  it('counts libraries once across ABIs and splits failures by reason and package', () => {
    const s = summarizeApk(
      report([
        lib('libreactnative.so', 'arm64-v8a', { zipAligned: false }),
        lib('libreactnative.so', 'x86_64', { zipAligned: false }),
        lib('libjsi.so', 'arm64-v8a', { zipAligned: false }),
        lib('libjsi.so', 'x86_64'),
        lib('libcamera.so', 'arm64-v8a', { package: 'react-native-camera-lib', elfOk: false, loadAlign: 4096 }),
        lib('libmystery.so', 'arm64-v8a', { package: undefined, elfOk: false, loadAlign: 4096, zipAligned: false }),
        lib('libok.so', 'arm64-v8a', { package: 'fine-lib' }),
        lib('libold32.so', 'armeabi-v7a', { elfOk: true, loadAlign: 4096 }),
      ]),
    )!;
    expect(s).toMatchObject({
      file: 'android/app/release/app-release.apk',
      abis: ['arm64-v8a', 'x86_64'],
      total: 5,
      ready: 1,
      elf: 2,
      zipOnly: 2,
      ok: false,
    });
    expect(s.byPackage).toEqual([
      { package: 'react-native', libs: ['libjsi.so', 'libreactnative.so'], problems: ['zip'] },
      { package: 'react-native-camera-lib', libs: ['libcamera.so'], problems: ['elf'] },
      { package: undefined, libs: ['libmystery.so'], problems: ['elf', 'zip'] },
    ]);
    expect(verdictText(s)).toBe('Not ready: from 1 Feb 2027, Google Play blocks app updates without 16 KB support');
    expect(scopeText(s)).toBe('android/app/release/app-release.apk · 5 native libraries × 2 ABIs (arm64-v8a, x86_64)');
  });

  it('gives a plain verdict when everything is ready', () => {
    const s = summarizeApk(report([lib('libreactnative.so', 'arm64-v8a')]))!;
    expect(s.ok).toBe(true);
    expect(verdictText(s)).toBe('Ready: the only native library supports 16 KB pages');
    expect(scopeText(s)).toBe('android/app/release/app-release.apk · 1 native library (arm64-v8a)');
  });

  it('keeps the full path for files outside the project and in the Google command', () => {
    const s = summarizeApk(report([lib('libreactnative.so', 'arm64-v8a')], '/downloads/app.apk'))!;
    expect(s.file).toBe('/downloads/app.apk');
    expect(googleCheck(s)).toBe('zipalign -c -P 16 -v 4 /downloads/app.apk');
    const inside = summarizeApk(report([lib('libreactnative.so', 'arm64-v8a')]))!;
    expect(googleCheck(inside)).toBe('zipalign -c -P 16 -v 4 "/work/My App/android/app/release/app-release.apk"');
  });

  it('has no zipalign command for an AAB', () => {
    expect(googleCheck(summarizeApk(report([lib('libreactnative.so', 'arm64-v8a')], '/work/My App/app.aab', 'aab'))!)).toBeUndefined();
  });

  it('is undefined without an APK scan', () => {
    expect(summarizeApk({ meta: { cwd: '/x' } } as unknown as Report)).toBeUndefined();
  });
});
