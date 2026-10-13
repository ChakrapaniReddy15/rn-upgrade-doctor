import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runScan } from '../src/index.js';
import { buildProjectContext, findWorkspace } from '../src/project/index.js';
import { FileCache } from '../src/registry/index.js';
import { tempDir, writeTree } from './helpers.js';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir('workspace'));
});

afterEach(() => cleanup());

const app = { name: 'mobile', dependencies: { 'react-native': '^0.85.0', 'native-lib': '^2.0.0' } };

describe('findWorkspace', () => {
  it('uses the app folder when it has its own lockfile', async () => {
    await writeTree(dir, { 'package.json': { workspaces: ['apps/*'] }, 'yarn.lock': '', 'apps/mobile/package.json': app, 'apps/mobile/yarn.lock': '' });
    expect(await findWorkspace(path.join(dir, 'apps/mobile'))).toEqual({ root: path.join(dir, 'apps/mobile'), member: '.' });
  });

  it('finds the monorepo root that declares workspaces', async () => {
    await writeTree(dir, { 'package.json': { workspaces: { packages: ['apps/*'] } }, 'yarn.lock': '', 'apps/mobile/package.json': app });
    expect(await findWorkspace(path.join(dir, 'apps/mobile'))).toMatchObject({ root: dir, member: 'apps/mobile' });
  });

  it('accepts pnpm-workspace.yaml as a workspace root', async () => {
    await writeTree(dir, { 'package.json': {}, 'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n", 'pnpm-lock.yaml': '', 'apps/mobile/package.json': app });
    expect(await findWorkspace(path.join(dir, 'apps/mobile'))).toMatchObject({ root: dir, member: 'apps/mobile' });
  });

  it('ignores a parent lockfile that is not a workspace root', async () => {
    await writeTree(dir, { 'package.json': { name: 'unrelated' }, 'package-lock.json': '{}', 'apps/mobile/package.json': app });
    expect(await findWorkspace(path.join(dir, 'apps/mobile'))).toEqual({ root: path.join(dir, 'apps/mobile'), member: '.' });
  });

  it('does not leave the git repository', async () => {
    await writeTree(dir, {
      'package.json': { workspaces: ['repo/apps/*'] },
      'yarn.lock': '',
      'repo/.git/HEAD': 'ref: refs/heads/main\n',
      'repo/apps/mobile/package.json': app,
    });
    expect(await findWorkspace(path.join(dir, 'repo/apps/mobile'))).toMatchObject({ member: '.' });
  });
});

describe('monorepo lockfiles', () => {
  it('npm: prefers the workspace node_modules over the hoisted copy', async () => {
    await writeTree(dir, {
      'package.json': { workspaces: ['apps/*'] },
      'package-lock.json': {
        lockfileVersion: 3,
        packages: {
          'node_modules/react-native': { version: '0.85.2' },
          'node_modules/native-lib': { version: '1.0.0' },
          'apps/mobile/node_modules/native-lib': { version: '2.3.0' },
        },
      },
      'apps/mobile/package.json': app,
    });
    expect(await buildProjectContext(path.join(dir, 'apps/mobile'))).toMatchObject({
      workspaceRoot: dir,
      lockfile: path.join(dir, 'package-lock.json'),
      packageManager: 'npm',
      reactNativeVersion: '0.85.2',
      reactNativeVersionSource: 'lockfile',
      installed: { 'react-native': '0.85.2', 'native-lib': '2.3.0' },
    });
  });

  it('pnpm: reads the importer for the app folder', async () => {
    await writeTree(dir, {
      'package.json': {},
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
      'pnpm-lock.yaml': `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      native-lib:
        specifier: ^1.0.0
        version: 1.0.0
  apps/mobile:
    dependencies:
      react-native:
        specifier: ^0.85.0
        version: 0.85.2(@babel/core@7.25.2)
      native-lib:
        specifier: ^2.0.0
        version: 2.3.0
`,
      'apps/mobile/package.json': app,
    });
    expect(await buildProjectContext(path.join(dir, 'apps/mobile'))).toMatchObject({
      packageManager: 'pnpm',
      installed: { 'react-native': '0.85.2', 'native-lib': '2.3.0' },
    });
  });

  it('yarn: uses the root packageManager field and yarn.lock', async () => {
    await writeTree(dir, {
      'package.json': { workspaces: ['apps/*'], packageManager: 'yarn@4.5.0' },
      'yarn.lock': '__metadata:\n  version: 8\n\n"react-native@npm:^0.85.0":\n  version: 0.85.2\n\n"native-lib@npm:^2.0.0":\n  version: 2.3.0\n',
      'apps/mobile/package.json': app,
    });
    expect(await buildProjectContext(path.join(dir, 'apps/mobile'))).toMatchObject({
      packageManager: 'yarn',
      installed: { 'react-native': '0.85.2', 'native-lib': '2.3.0' },
    });
  });

  it('runScan reads patches from the root and reports the lockfile path', async () => {
    await writeTree(dir, {
      'package.json': { workspaces: ['apps/*'] },
      'package-lock.json': { lockfileVersion: 3, packages: { 'node_modules/react-native': { version: '0.85.2' }, 'node_modules/native-lib': { version: '2.3.0' } } },
      'patches/native-lib+2.3.0.patch': '',
      'apps/mobile/package.json': app,
    });
    const report = await runScan(
      { cwd: path.join(dir, 'apps/mobile'), format: ['json'], ci: true, offline: true },
      { registry: { cache: new FileCache(path.join(dir, '.cache')) } },
    );
    expect(report.meta.lockfile).toBe('../../package-lock.json');
    expect(report.patches).toEqual([{ file: '../../patches/native-lib+2.3.0.patch', package: 'native-lib', version: '2.3.0' }]);
    expect(report.findings.map((f) => f.id)).not.toContain('data-lockfile-missing');
  });
});
