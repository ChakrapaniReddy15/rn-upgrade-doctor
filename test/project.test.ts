import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProjectError,
  buildProjectContext,
  detectPackageManager,
  detectReactNativeVersion,
  readPackageJson,
} from '../src/project/index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'rn-doctor-project-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeFiles(files: Record<string, string | object>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
}

describe('detectReactNativeVersion', () => {
  it.each([
    ['0.76.5', '0.76.5'],
    ['^0.74.0', '0.74.0'],
    ['~0.73.6', '0.73.6'],
    ['>=0.72.0 <0.73.0', '0.72.0'],
    ['0.77.0-rc.2', '0.77.0-rc.2'],
    ['0.75.x', '0.75.0'],
    ['0.71', '0.71.0'],
    ['npm:react-native-tvos@0.76.0-0', '0.76.0-0'],
  ])('reads %s as %s', (range, version) => {
    expect(detectReactNativeVersion({ dependencies: { 'react-native': range } })).toEqual({ range, version });
  });

  it('keeps the range but no version for non-semver specs', () => {
    expect(detectReactNativeVersion({ dependencies: { 'react-native': 'latest' } })).toEqual({ range: 'latest' });
  });

  it('falls back to devDependencies', () => {
    expect(detectReactNativeVersion({ devDependencies: { 'react-native': '0.79.2' } })?.version).toBe('0.79.2');
  });

  it('returns undefined when react-native is not a dependency', () => {
    expect(detectReactNativeVersion({ dependencies: { react: '18.3.1' } })).toBeUndefined();
  });
});

describe('detectPackageManager', () => {
  it.each([
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['pnpm-lock.yaml', 'pnpm'],
  ])('detects %s as %s', async (lockfile, manager) => {
    await writeFiles({ [lockfile]: '' });
    expect(await detectPackageManager(dir, {})).toBe(manager);
  });

  it('prefers the packageManager field over lockfiles', async () => {
    await writeFiles({ 'package-lock.json': '' });
    expect(await detectPackageManager(dir, { packageManager: 'yarn@4.5.0' })).toBe('yarn');
  });

  it('ignores an unknown packageManager value', async () => {
    await writeFiles({ 'yarn.lock': '' });
    expect(await detectPackageManager(dir, { packageManager: 'bun@1.1.0' })).toBe('yarn');
  });

  it('returns undefined without a lockfile', async () => {
    expect(await detectPackageManager(dir, {})).toBeUndefined();
  });
});

describe('readPackageJson', () => {
  it('throws ProjectError when package.json is missing', async () => {
    await expect(readPackageJson(dir)).rejects.toThrow(ProjectError);
  });

  it('throws ProjectError when package.json is invalid', async () => {
    await writeFiles({ 'package.json': '{ not json' });
    await expect(readPackageJson(dir)).rejects.toThrow(/Could not parse/);
  });
});

describe('buildProjectContext', () => {
  it('collects version and package manager', async () => {
    await writeFiles({
      'package.json': { name: 'SampleApp', dependencies: { react: '18.3.1', 'react-native': '0.76.5' } },
      'yarn.lock': '',
    });
    expect(await buildProjectContext(dir)).toEqual({
      cwd: path.resolve(dir),
      reactNativeVersion: '0.76.5',
      reactNativeVersionSource: 'package.json',
      reactNativeRange: '0.76.5',
      packageManager: 'yarn',
      installed: {},
    });
  });

  it('rejects a project without react-native', async () => {
    await writeFiles({ 'package.json': { name: 'web-app', dependencies: { react: '18.3.1' } } });
    await expect(buildProjectContext(dir)).rejects.toThrow(/does not look like a React Native app/);
  });
});
