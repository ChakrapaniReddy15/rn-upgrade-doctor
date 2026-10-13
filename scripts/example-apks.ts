/**
 * Synthetic APKs for examples/09-16kb-apk. The .so files are minimal ELF headers (no code), built with the same
 * helpers the unit tests use, so no binaries need to be committed.
 */
import { makeElf, makeZip } from '../test/helpers.js';

const K4 = 4096;
const K16 = 16384;

const elf64 = (align: number) => makeElf({ is64Bit: true, loadAligns: [align, align] });
const elf32 = () => makeElf({ is64Bit: false, loadAligns: [K4] });
const manifest = { name: 'AndroidManifest.xml', data: Buffer.from('<manifest package="com.demo.scanner"/>') };

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
  ]);

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
  ]);

  return { good, bad };
}
