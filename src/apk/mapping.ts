import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { FRESCO_LIBS, KNOWN_SO_PACKAGES, NDK_LIBS, REACT_NATIVE_CORE_LIBS } from '../rules/libraries.js';

export interface SoOwner {
  package: string;
  source: string;
}

const SKIP_DIRS = new Set(['build', '.cxx', '.gradle', 'node_modules', '.git', 'test', 'tests', 'example', 'examples']);
const MAX_DEPTH = 6;

/**
 * Index of "libX.so" -> npm package, built by looking inside each top-level package's android/ folder for
 * prebuilt .so files and CMake `add_library(<name> SHARED ...)` targets. `dirs` are the app folder and, in a
 * monorepo, the workspace root (where packages are usually hoisted); earlier folders win.
 */
export async function buildSoIndex(dirs: string | string[]): Promise<Map<string, SoOwner>> {
  const index = new Map<string, SoOwner>();
  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) await indexModules(path.join(dir, 'node_modules'), index);
  return index;
}

async function indexModules(modules: string, index: Map<string, SoOwner>): Promise<void> {
  for (const pkg of await listPackages(modules)) {
    // New Architecture libraries get a generated native library named after `codegenConfig.name` in package.json.
    const codegenName = await readCodegenName(path.join(modules, pkg, 'package.json'));
    const codegenLib = codegenName ? `libreact_codegen_${codegenName}.so` : undefined;
    if (codegenLib && !index.has(codegenLib)) index.set(codegenLib, { package: pkg, source: 'node_modules (codegenConfig)' });

    const androidDir = path.join(modules, pkg, 'android');
    if (!(await isDir(androidDir))) continue;
    await walk(androidDir, 0, async (file) => {
      const base = path.basename(file);
      if (base.endsWith('.so')) {
        if (!index.has(base)) index.set(base, { package: pkg, source: 'node_modules (prebuilt .so)' });
      } else if (base === 'CMakeLists.txt') {
        for (const target of cmakeSharedLibraries(await readFile(file, 'utf8').catch(() => ''))) {
          const so = `lib${target}.so`;
          if (!index.has(so)) index.set(so, { package: pkg, source: 'node_modules (CMakeLists.txt)' });
        }
      }
    });
  }
}

/** Owner of a native library: React Native core and the known table first, then the node_modules index. */
export function findSoOwner(name: string, index: Map<string, SoOwner>): SoOwner | undefined {
  // Generated code of a library (libreact_codegen_<name>.so) belongs to that library, not to React Native.
  if (name.startsWith('libreact_codegen_') && index.has(name)) return index.get(name);
  if (FRESCO_LIBS.includes(name)) return { package: 'react-native', source: 'known table (Fresco, bundled with React Native)' };
  if (REACT_NATIVE_CORE_LIBS.some((p) => (typeof p === 'string' ? p === name : p.test(name)))) {
    return { package: 'react-native', source: 'known table (React Native core)' };
  }
  if (NDK_LIBS.includes(name)) return { package: 'react-native', source: 'known table (NDK C++ runtime)' };
  return index.get(name) ?? (KNOWN_SO_PACKAGES[name] ? { package: KNOWN_SO_PACKAGES[name], source: 'known table' } : undefined);
}

/** Names of SHARED library targets, resolving simple set(VAR "value") variables and ${PROJECT_NAME}. */
export function cmakeSharedLibraries(text: string): string[] {
  const vars = new Map<string, string>();
  const project = /\bproject\s*\(\s*([\w.-]+)/i.exec(text)?.[1];
  if (project) vars.set('PROJECT_NAME', project);
  for (const match of text.matchAll(/\bset\s*\(\s*(\w+)\s+"?([\w.-]+)"?\s*\)/gi)) vars.set(match[1], match[2]);

  const names: string[] = [];
  for (const match of text.matchAll(/\badd_library\s*\(\s*([^\s)]+)\s+SHARED\b/gi)) {
    const name = match[1].replace(/\$\{(\w+)\}/g, (_, v: string) => vars.get(v) ?? `\${${v}}`);
    if (!name.includes('${')) names.push(name);
  }
  return names;
}

async function listPackages(modules: string): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await readdir(modules).catch(() => [] as string[])) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      for (const scoped of await readdir(path.join(modules, entry)).catch(() => [] as string[])) {
        names.push(`${entry}/${scoped}`);
      }
    } else {
      names.push(entry);
    }
  }
  return names;
}

async function walk(dir: string, depth: number, onFile: (file: string) => Promise<void>): Promise<void> {
  if (depth > MAX_DEPTH) return;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1, onFile);
    } else if (entry.isFile()) {
      await onFile(full);
    }
  }
}

async function isDir(dir: string): Promise<boolean> {
  // stat follows symlinks, which pnpm uses for every package in node_modules.
  return stat(dir).then((s) => s.isDirectory(), () => false);
}

async function readCodegenName(packageJson: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await readFile(packageJson, 'utf8')) as { codegenConfig?: { name?: unknown } };
    return typeof pkg.codegenConfig?.name === 'string' ? pkg.codegenConfig.name : undefined;
  } catch {
    return undefined;
  }
}
