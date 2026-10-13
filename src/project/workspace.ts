import { access } from 'node:fs/promises';
import path from 'node:path';
import { readPackageJson, type PackageJson } from './packageJson.js';

export const LOCKFILE_NAMES = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'npm-shrinkwrap.json'];
const MAX_LEVELS = 6;

export interface Workspace {
  /** Folder that holds the lockfile: the app itself, or the monorepo root. */
  root: string;
  /** App folder relative to `root`, with "/" separators; "." when the app is the root. */
  member: string;
  /** package.json of the monorepo root; undefined when the app is the root. */
  rootPkg?: PackageJson;
}

/**
 * Where the app's lockfile lives. In a monorepo (npm/yarn `workspaces`, pnpm-workspace.yaml) the lockfile,
 * hoisted node_modules and patches/ sit in the repository root, not in the app folder.
 * A parent folder is only used when it is a real workspace root, and the search never leaves the git repository.
 */
export async function findWorkspace(appDir: string): Promise<Workspace> {
  const self: Workspace = { root: appDir, member: '.' };
  if (await hasAny(appDir, LOCKFILE_NAMES)) return self;
  if (await exists(path.join(appDir, '.git'))) return self;

  let dir = appDir;
  for (let level = 0; level < MAX_LEVELS; level++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;

    if (await hasAny(dir, LOCKFILE_NAMES)) {
      const rootPkg = await readPackageJson(dir).catch(() => undefined);
      if (isWorkspaceRoot(rootPkg) || (await exists(path.join(dir, 'pnpm-workspace.yaml')))) {
        return { root: dir, member: path.relative(dir, appDir).split(path.sep).join('/'), rootPkg };
      }
    }
    if (await exists(path.join(dir, '.git'))) break;
  }
  return self;
}

function isWorkspaceRoot(pkg: (PackageJson & { workspaces?: unknown }) | undefined): boolean {
  const workspaces = pkg?.workspaces;
  return Array.isArray(workspaces) || (typeof workspaces === 'object' && workspaces !== null);
}

async function hasAny(dir: string, names: string[]): Promise<boolean> {
  for (const name of names) if (await exists(path.join(dir, name))) return true;
  return false;
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}
