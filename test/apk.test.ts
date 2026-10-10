import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cmakeSharedLibraries, parseElf, programHeadersEnd, readNativeLibs, scanApk } from '../src/apk/index.js';
import { checkApk } from '../src/checks/index.js';
import type { ProjectContext } from '../src/types.js';
import { makeElf, makeZip, tempDir, writeTree } from './helpers.js';

const K16 = 16384;

describe('parseElf', () => {
  it('reads PT_LOAD alignment of a 64-bit library', () => {
    const elf = makeElf({ is64Bit: true, loadAligns: [K16, K16] });
    expect(programHeadersEnd(elf)).toBe(64 + 56 * 3);
    expect(parseElf(elf)).toEqual({ is64Bit: true, loadAligns: [K16, K16] });
  });

  it('reads a 32-bit library', () => {
    expect(parseElf(makeElf({ is64Bit: false, loadAligns: [4096] }))).toEqual({ is64Bit: false, loadAligns: [4096] });
  });

  it('rejects non-ELF data', () => {
    expect(programHeadersEnd(Buffer.alloc(64))).toBeUndefined();
    expect(() => parseElf(Buffer.from('hello'))).toThrow(/not an ELF/);
  });
});

describe('cmakeSharedLibraries', () => {
  it('resolves set() variables and PROJECT_NAME', () => {
    const cmake = `cmake_minimum_required(VERSION 3.13)
project(NativeThing)
set(PACKAGE_NAME "thing")
add_library(\${PACKAGE_NAME} SHARED src/a.cpp)
add_library(\${PROJECT_NAME}Extra SHARED src/b.cpp)
add_library(helper STATIC src/c.cpp)
`;
    expect(cmakeSharedLibraries(cmake)).toEqual(['thing', 'NativeThingExtra']);
  });
});

describe('scanApk', () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, cleanup } = await tempDir('apk'));
    // A fake library in node_modules whose CMake target produces libthing.so.
    await writeTree(dir, {
      'node_modules/react-native-thing/package.json': { name: 'react-native-thing' },
      'node_modules/react-native-thing/android/CMakeLists.txt': 'set(PACKAGE_NAME "thing")\nadd_library(${PACKAGE_NAME} SHARED a.cpp)\n',
    });
  });

  afterEach(() => cleanup());

  it('flags 4 KB ELF alignment and unaligned stored libs, and maps them to packages', async () => {
    const good = makeElf({ is64Bit: true, loadAligns: [K16] });
    const bad = makeElf({ is64Bit: true, loadAligns: [4096] });
    await writeTree(dir, {
      'app.apk': makeZip([
        { name: 'AndroidManifest.xml', data: Buffer.from('<manifest/>') },
        { name: 'lib/arm64-v8a/libreactnative.so', data: good, stored: true, alignTo: K16 },
        { name: 'lib/arm64-v8a/libthing.so', data: bad, stored: true, alignTo: K16 },
        { name: 'lib/arm64-v8a/libmystery.so', data: good, stored: true, alignTo: 4096 + 1 },
        { name: 'lib/armeabi-v7a/libthing.so', data: makeElf({ is64Bit: false, loadAligns: [4096] }) },
      ]),
    });

    const apk = await scanApk('app.apk', dir);
    expect(apk.kind).toBe('apk');
    const byPath = Object.fromEntries(apk.libs.map((l) => [l.path, l]));

    expect(byPath['lib/arm64-v8a/libreactnative.so']).toMatchObject({ elfOk: true, zipAligned: true, package: 'react-native' });
    expect(byPath['lib/arm64-v8a/libthing.so']).toMatchObject({
      elfOk: false,
      loadAlign: 4096,
      package: 'react-native-thing',
      packageSource: 'node_modules (CMakeLists.txt)',
    });
    expect(byPath['lib/arm64-v8a/libmystery.so']).toMatchObject({ elfOk: true, zipAligned: false, package: undefined });
    expect(byPath['lib/armeabi-v7a/libthing.so']).toMatchObject({ is64Bit: false, elfOk: true, stored: false });

    const findings = checkApk({ apk } as ProjectContext);
    expect(findings.map((f) => [f.severity, f.package, f.id])).toEqual([
      ['blocker', 'react-native-thing', 'apk-16kb:react-native-thing'],
      ['blocker', undefined, 'apk-16kb:libmystery.so'],
    ]);
  });

  it('reads libraries from every module of an AAB and skips zip alignment there', async () => {
    await writeTree(dir, {
      'app.aab': makeZip([
        { name: 'base/lib/arm64-v8a/libthing.so', data: makeElf({ is64Bit: true, loadAligns: [K16] }) },
        { name: 'feature/lib/x86_64/libthing.so', data: makeElf({ is64Bit: true, loadAligns: [K16] }), stored: true },
        { name: 'base/assets/lib/arm64-v8a/not-a-lib.so', data: Buffer.from('x') },
      ]),
    });
    const libs = await readNativeLibs(path.join(dir, 'app.aab'), 'aab');
    expect(libs.map((l) => l.path)).toEqual(['base/lib/arm64-v8a/libthing.so', 'feature/lib/x86_64/libthing.so']);

    const apk = await scanApk(path.join(dir, 'app.aab'), dir);
    expect(apk.libs.every((l) => l.elfOk && l.zipAligned === undefined)).toBe(true);
    expect(checkApk({ apk } as ProjectContext)).toMatchObject([{ id: 'apk-16kb-ok', severity: 'info' }]);
  });

  it('throws a clear error for a missing file', async () => {
    await expect(scanApk('missing.apk', dir)).rejects.toThrow(/APK\/AAB not found/);
  });
});
