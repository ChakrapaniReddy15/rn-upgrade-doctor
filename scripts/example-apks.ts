/**
 * Synthetic APKs for examples/09-16kb-apk. The .so files are minimal ELF headers (no code), built with the same
 * helpers the unit tests use, so no binaries need to be committed. Both APKs have a compiled manifest and a
 * v2/v3 signing block with a throwaway release test certificate, so only the 16 KB results differ.
 */
import { RELEASE_CERT, der } from '../test/certs.js';
import { makeAxml, makeElf, makeZip, signerBlockValue, type ZipOptions } from '../test/helpers.js';

const K4 = 4096;
const K16 = 16384;

const elf64 = (align: number) => makeElf({ is64Bit: true, loadAligns: [align, align] });
const elf32 = () => makeElf({ is64Bit: false, loadAligns: [K4] });
/** A release-ready manifest: target API 36, launcher activity with android:exported set. */
const manifest = {
  name: 'AndroidManifest.xml',
  data: makeAxml({
    name: 'manifest',
    attrs: { package: 'com.demo.scanner', 'android:versionCode': 1, 'android:versionName': '1.0' },
    children: [
      { name: 'uses-sdk', attrs: { 'android:minSdkVersion': 24, 'android:targetSdkVersion': 36 } },
      { name: 'uses-permission', attrs: { 'android:name': 'android.permission.INTERNET' } },
      {
        name: 'application',
        children: [
          {
            name: 'activity',
            attrs: { 'android:name': '.MainActivity', 'android:exported': true },
            children: [
              {
                name: 'intent-filter',
                children: [
                  { name: 'action', attrs: { 'android:name': 'android.intent.action.MAIN' } },
                  { name: 'category', attrs: { 'android:name': 'android.intent.category.LAUNCHER' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
};

/** v2 and v3 signatures carrying the release test certificate (valid until 2060). */
const releaseSigned: ZipOptions = {
  signingBlock: [
    { id: 0x7109871a, value: signerBlockValue([der(RELEASE_CERT)]) },
    { id: 0xf05368c0, value: signerBlockValue([der(RELEASE_CERT)]) },
  ],
};

export function exampleApks(): { good: Buffer; bad: Buffer } {
  // Every 64-bit library has 16 KB ELF segments; stored libraries start on a 16 KB boundary in the zip.
  const good = makeZip([
    manifest,
    { name: 'lib/arm64-v8a/libreactnative.so', data: elf64(K16), stored: true, alignTo: K16 },
    { name: 'lib/arm64-v8a/libreanimated.so', data: elf64(K16), stored: true, alignTo: K16 },
    { name: 'lib/arm64-v8a/libreactnativemmkv.so', data: elf64(K16), stored: true, alignTo: K16 },
    { name: 'lib/x86_64/libreactnative.so', data: elf64(K16), stored: true, alignTo: K16 },
    // 32-bit libraries are not affected by 16 KB pages and are not checked.
    { name: 'lib/armeabi-v7a/libreactnative.so', data: elf32() },
  ], releaseSigned);

  const bad = makeZip([
    manifest,
    // Passes: 16 KB ELF, compressed (extracted at install, so zip alignment does not matter).
    { name: 'lib/arm64-v8a/libc++_shared.so', data: elf64(K16) },
    // Fails ELF check: 4 KB segments. Mapped to react-native-reanimated through the known table.
    { name: 'lib/arm64-v8a/libreanimated.so', data: elf64(K4) },
    // Fails zip check: 16 KB ELF but stored uncompressed 4 KB past a 16 KB boundary. Mapped to react-native-mmkv.
    { name: 'lib/arm64-v8a/libreactnativemmkv.so', data: elf64(K16), stored: true, alignTo: K16, misalignBy: K4 },
    // Fails ELF check and no package owns it: reported by file name.
    { name: 'lib/arm64-v8a/libdemo_native.so', data: elf64(K4), stored: true, alignTo: K16 },
  ], releaseSigned);

  return { good, bad };
}
