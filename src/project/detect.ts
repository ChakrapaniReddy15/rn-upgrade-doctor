import { access } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectContext } from '../types.js';
import type { PackageJson } from './packageJson.js';

type PackageManager = NonNullable<ProjectContext['packageManager']>;

/** Checked in order: when several lockfiles exist, the first match wins. */
const LOCKFILES: Array<[file: string, manager: PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

const KNOWN_MANAGERS: readonly string[] = ['npm', 'yarn', 'pnpm'];

/**
 * Package manager from the `packageManager` field (e.g. "pnpm@9.12.0"), else from the lockfile present.
 * Returns undefined when neither gives an answer.
 */
export async function detectPackageManager(cwd: string, pkg: PackageJson): Promise<PackageManager | undefined> {
  const declared = pkg.packageManager?.split('@')[0];
  if (declared && KNOWN_MANAGERS.includes(declared)) return declared as PackageManager;

  for (const [file, manager] of LOCKFILES) {
    if (await exists(path.join(cwd, file))) return manager;
  }
  return undefined;
}

export interface ReactNativeVersion {
  /** The range as written in package.json, e.g. "^0.74.0". */
  range: string;
  /** Lowest version the range allows, e.g. "0.74.0"; undefined for ranges like "latest" or git URLs. */
  version?: string;
}

const VERSION_RE = /(\d+)\.(\d+)(?:\.(\d+|[xX*]))?(-[0-9A-Za-z.-]+)?/;

/**
 * React Native version declared in package.json. This is the declared range only;
 * the exact installed version comes from the lockfile.
 */
export function detectReactNativeVersion(pkg: PackageJson): ReactNativeVersion | undefined {
  const range = pkg.dependencies?.['react-native'] ?? pkg.devDependencies?.['react-native'];
  if (range === undefined) return undefined;

  // Aliases such as "npm:react-native-tvos@0.76.0-0" carry the version after the last "@".
  const spec = range.startsWith('npm:') ? range.slice(range.lastIndexOf('@') + 1) : range;
  const match = VERSION_RE.exec(spec);
  if (!match) return { range };

  const [, major, minor, patch, prerelease = ''] = match;
  const patchNumber = patch === undefined || /^[xX*]$/.test(patch) ? '0' : patch;
  return { range, version: `${major}.${minor}.${patchNumber}${prerelease}` };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
