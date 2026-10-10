import { access } from 'node:fs/promises';
import path from 'node:path';
import type { ApkReport, NativeLib } from '../types.js';
import { PAGE_16K, parseElf } from './elf.js';
import { buildSoIndex, findSoOwner } from './mapping.js';
import { readNativeLibs } from './zip.js';

export { PAGE_16K, parseElf, programHeadersEnd } from './elf.js';
export { buildSoIndex, cmakeSharedLibraries, findSoOwner } from './mapping.js';
export { readNativeLibs } from './zip.js';

/** 16 KB page-size scan of a built APK or AAB, with each native library mapped to the npm package behind it. */
export async function scanApk(file: string, cwd: string): Promise<ApkReport> {
  const resolved = path.resolve(cwd, file);
  try {
    await access(resolved);
  } catch {
    throw new Error(`APK/AAB not found: ${resolved}`);
  }
  const kind = resolved.toLowerCase().endsWith('.aab') ? 'aab' : 'apk';
  const entries = await readNativeLibs(resolved, kind);
  const index = await buildSoIndex(cwd);

  const libs = entries.map((entry): NativeLib => {
    let loadAlign: number | undefined;
    let is64Bit = entry.abi === 'arm64-v8a' || entry.abi === 'x86_64';
    if (entry.elfPrefix) {
      try {
        const elf = parseElf(entry.elfPrefix);
        is64Bit = elf.is64Bit;
        loadAlign = elf.loadAligns.length > 0 ? Math.min(...elf.loadAligns) : undefined;
      } catch {
        // leave loadAlign undefined: reported as unreadable
      }
    }
    const owner = findSoOwner(entry.name, index);
    return {
      path: entry.path,
      abi: entry.abi,
      name: entry.name,
      is64Bit,
      loadAlign,
      // 16 KB pages exist only on 64-bit devices, so 32-bit libraries are not checked.
      elfOk: !is64Bit || (loadAlign !== undefined && loadAlign >= PAGE_16K),
      stored: entry.stored,
      // Bundletool aligns APKs it generates from an AAB, so zip alignment only applies to APKs.
      zipAligned: kind === 'apk' && entry.stored && is64Bit ? entry.dataOffset % PAGE_16K === 0 : undefined,
      package: owner?.package,
      packageSource: owner?.source,
    };
  });
  return { file: resolved, kind, libs };
}
