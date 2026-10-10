import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProjectContext } from '../types.js';
import { ProjectError, type PackageJson } from './packageJson.js';

/** Declared direct dependencies: name -> range from package.json. */
export type DeclaredDeps = Record<string, string>;
/** Installed versions of the direct dependencies: name -> exact version. */
export type InstalledVersions = Record<string, string>;

type PackageManager = NonNullable<ProjectContext['packageManager']>;

/** Keep every scalar a string, so a version like "1.10" is not read as the number 1.1. */
const YAML_OPTIONS = { schema: 'failsafe' } as const;

const LOCKFILES: Record<PackageManager, string[]> = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  yarn: ['yarn.lock'],
  pnpm: ['pnpm-lock.yaml'],
};

export function declaredDeps(pkg: PackageJson): DeclaredDeps {
  return { ...pkg.devDependencies, ...pkg.dependencies };
}

/**
 * Exact installed versions of the project's direct dependencies, read from the lockfile of `manager`.
 * Returns {} when there is no lockfile. Throws ProjectError when the lockfile cannot be parsed.
 */
export async function readInstalledVersions(
  cwd: string,
  manager: PackageManager | undefined,
  pkg: PackageJson,
): Promise<InstalledVersions> {
  if (!manager) return {};
  const deps = declaredDeps(pkg);

  for (const name of LOCKFILES[manager]) {
    const file = path.join(cwd, name);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    try {
      if (manager === 'npm') return parseNpmLock(text, deps);
      if (manager === 'yarn') return parseYarnLock(text, deps);
      return parsePnpmLock(text, deps);
    } catch (err) {
      throw new ProjectError(`Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {};
}

/** package-lock.json / npm-shrinkwrap.json, lockfileVersion 1, 2 and 3. */
export function parseNpmLock(text: string, deps: DeclaredDeps): InstalledVersions {
  const lock = JSON.parse(text) as {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string }>;
  };
  const installed: InstalledVersions = {};
  for (const name of Object.keys(deps)) {
    // v2/v3 list every install path; the root node_modules entry is what the app resolves. v1 only has `dependencies`.
    const version = lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version;
    if (version) installed[name] = version;
  }
  return installed;
}

interface YarnEntry {
  descriptors: string[];
  version: string;
}

/** yarn.lock from Yarn classic (v1, custom format) or Yarn Berry (v2+, YAML). */
export function parseYarnLock(text: string, deps: DeclaredDeps): InstalledVersions {
  const entries = /^__metadata:/m.test(text) ? yarnBerryEntries(text) : yarnClassicEntries(text);

  const byName = new Map<string, YarnEntry[]>();
  for (const entry of entries) {
    for (const descriptor of entry.descriptors) {
      const name = descriptorName(descriptor);
      const list = byName.get(name) ?? [];
      if (!list.includes(entry)) list.push(entry);
      byName.set(name, list);
    }
  }

  const installed: InstalledVersions = {};
  for (const [name, range] of Object.entries(deps)) {
    const candidates = byName.get(name) ?? [];
    // Yarn has no notion of "top level", so match the exact descriptor written in package.json.
    const wanted = [`${name}@${range}`, `${name}@npm:${range}`];
    const match = candidates.find((e) => e.descriptors.some((d) => wanted.includes(d)));
    const versions = new Set(candidates.map((e) => e.version));
    const version = match?.version ?? (versions.size === 1 ? [...versions][0] : undefined);
    if (version) installed[name] = version;
  }
  return installed;
}

function yarnClassicEntries(text: string): YarnEntry[] {
  const entries: YarnEntry[] = [];
  let current: YarnEntry | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('<<<<<<<') || line.startsWith('>>>>>>>')) {
      throw new Error('it contains merge conflict markers');
    }
    if (line === '' || line.startsWith('#')) continue;
    if (!line.startsWith(' ') && line.endsWith(':')) {
      const descriptors = line
        .slice(0, -1)
        .split(',')
        .map((d) => unquote(d.trim()));
      current = { descriptors, version: '' };
      entries.push(current);
      continue;
    }
    const version = /^ {2}version:? "?([^"\s]+)"?$/.exec(line);
    if (version && current) current.version = version[1];
  }
  return entries.filter((e) => e.version);
}

function yarnBerryEntries(text: string): YarnEntry[] {
  const doc = parseYaml(text, YAML_OPTIONS) as Record<string, { version?: string } | undefined> | null;
  const entries: YarnEntry[] = [];
  for (const [key, value] of Object.entries(doc ?? {})) {
    if (key === '__metadata' || value?.version === undefined) continue;
    entries.push({ descriptors: key.split(',').map((d) => d.trim()), version: String(value.version) });
  }
  return entries;
}

/** "@scope/pkg@npm:^1.0.0" -> "@scope/pkg". The search starts at 1 to skip a scope's leading "@". */
function descriptorName(descriptor: string): string {
  const at = descriptor.indexOf('@', 1);
  return at === -1 ? descriptor : descriptor.slice(0, at);
}

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

type PnpmDep = string | { version?: string };
interface PnpmSection {
  dependencies?: Record<string, PnpmDep>;
  devDependencies?: Record<string, PnpmDep>;
  optionalDependencies?: Record<string, PnpmDep>;
}

/** pnpm-lock.yaml, lockfileVersion 5.x, 6.0 and 9.0. */
export function parsePnpmLock(text: string, deps: DeclaredDeps): InstalledVersions {
  const lock = (parseYaml(text, YAML_OPTIONS) ?? {}) as PnpmSection & { importers?: Record<string, PnpmSection> };
  // Workspaces (and v9 always) list the root project under importers["."]; older single-project files put it at the top.
  const root = lock.importers?.['.'] ?? lock;
  const listed = { ...root.optionalDependencies, ...root.devDependencies, ...root.dependencies };

  const installed: InstalledVersions = {};
  for (const name of Object.keys(deps)) {
    const entry = listed[name];
    const raw = typeof entry === 'string' ? entry : entry?.version;
    if (raw === undefined) continue;
    const version = cleanPnpmVersion(String(raw));
    if (version) installed[name] = version;
  }
  return installed;
}

/** "0.76.5(@babel/core@7.25.2)" (v6+) or "7.0.0_@babel+core@7.25.2" (v5) -> plain version; local links -> undefined. */
function cleanPnpmVersion(raw: string): string | undefined {
  if (/^(link|file|workspace):/.test(raw)) return undefined;
  return raw.split('(')[0].split('_')[0];
}
