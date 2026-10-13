import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PatchInfo } from '../types.js';
import type { PackageJson } from './packageJson.js';

/**
 * patch-package files in patches/ plus pnpm `patchedDependencies` in package.json.
 * patch-package names files "<name>+<version>.patch", with "/" in scoped names written as "+" and
 * nested dependencies joined with "++" (e.g. "parent++child+1.0.0.patch"; the last package is the patched one).
 */
export async function readPatches(
  cwd: string,
  pkg: PackageJson & { pnpm?: { patchedDependencies?: Record<string, string> } },
  /** Prefix for reported file paths, e.g. "../../" when reading a monorepo root from an app folder. */
  displayPrefix = '',
): Promise<PatchInfo[]> {
  const patches: PatchInfo[] = [];

  let files: string[] = [];
  try {
    files = await readdir(path.join(cwd, 'patches'));
  } catch {
    // no patches/ folder
  }
  for (const file of files.sort()) {
    const parsed = parsePatchFileName(file);
    if (parsed) patches.push({ file: `${displayPrefix}patches/${file}`, ...parsed });
  }

  for (const [key, file] of Object.entries(pkg.pnpm?.patchedDependencies ?? {})) {
    const at = key.indexOf('@', 1);
    const shown = `${displayPrefix}${file}`;
    patches.push(
      at === -1 ? { file: shown, package: key } : { file: shown, package: key.slice(0, at), version: key.slice(at + 1) },
    );
  }
  return patches;
}

export function parsePatchFileName(file: string): Omit<PatchInfo, 'file'> | undefined {
  const match = /^(.+)\+([^+]+?)(?:\.dev)?\.patch$/.exec(file);
  if (!match) return undefined;
  const chain = match[1].split('++');
  const last = chain[chain.length - 1];
  // "@scope+name" -> "@scope/name"
  const name = last.startsWith('@') ? last.replace('+', '/') : last;
  return { package: name, version: match[2] };
}
