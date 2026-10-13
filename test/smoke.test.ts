import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderReport, runScan, writeReports } from '../src/index.js';
import { groupFindings } from '../src/report/shared.js';
import { FileCache } from '../src/registry/index.js';
import { makeElf, makeZip, tempDir, writeTree } from './helpers.js';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir('smoke'));
  await writeTree(dir, {
    'package.json': { dependencies: { 'react-native': '^0.76.0', 'legacy-<lib>': '^1.0.0' } },
    'package-lock.json': {
      lockfileVersion: 3,
      packages: { 'node_modules/react-native': { version: '0.76.9' }, 'node_modules/legacy-<lib>': { version: '1.0.0' } },
    },
    'android/build.gradle': 'ext {\n  minSdkVersion = 24\n  compileSdkVersion = 36\n  targetSdkVersion = 36\n}\n',
  });
});

afterEach(() => cleanup());

/** Registry stub: no network in tests. */
const registry = (cacheDir: string) => ({
  cache: new FileCache(cacheDir),
  fetch: async (url: string) =>
    url.includes('reactnative.directory')
      ? { status: 200, body: { 'legacy-<lib>': { newArchitecture: 'unsupported', unmaintained: true } } }
      : url.endsWith('/react-native/latest')
        ? { status: 200, body: { version: '0.87.1' } }
        : { status: 200, body: { version: '1.0.0' } },
});

describe('runScan', () => {
  it('builds a ranked report from project files and registry data', async () => {
    const report = await runScan(
      { cwd: dir, format: ['json'], ci: true, offline: false },
      { registry: registry(path.join(dir, '.cache')) },
    );
    expect(report.meta).toMatchObject({
      reactNativeVersion: '0.76.9',
      reactNativeVersionSource: 'lockfile',
      latestReactNative: '0.87.1',
      packageManager: 'npm',
      upgradeHelperUrl: 'https://react-native-community.github.io/upgrade-helper/?from=0.76.9&to=0.87.1',
    });
    expect(report.findings[0]).toMatchObject({ severity: 'blocker', id: 'dep-new-arch:legacy-<lib>' });
    expect(report.summary.blockers).toBe(1);
    expect(report.android).toMatchObject({ targetSdk: 36 });
  });

  it('renders every format and escapes HTML', async () => {
    const report = await runScan(
      { cwd: dir, format: ['json'], ci: true, offline: false },
      { registry: registry(path.join(dir, '.cache')) },
    );
    const terminal = renderReport(report, 'terminal');
    expect(terminal).toContain('React Native 0.76.9 → 0.87.1');
    expect(terminal).not.toContain('\u001b['); // no colour codes unless asked

    const written = await writeReports(report, ['terminal', 'html', 'md', 'json'], path.join(dir, 'out'));
    expect(written.map((f) => path.basename(f))).toEqual([
      'rn-upgrade-doctor-report.html',
      'rn-upgrade-doctor-report.md',
      'rn-upgrade-doctor-report.json',
    ]);
    const html = await readFile(written[0], 'utf8');
    expect(html).toContain('legacy-&lt;lib&gt;');
    expect(html).not.toContain('legacy-<lib>');
    expect(JSON.parse(await readFile(written[2], 'utf8')).summary.blockers).toBe(1);
  });

  it('resolves a relative --apk path from the process folder, not from --cwd', async () => {
    const lib = makeElf({ is64Bit: true, loadAligns: [16384] });
    await writeTree(dir, { 'builds/app.apk': makeZip([{ name: 'lib/arm64-v8a/libreactnative.so', data: lib }]) });
    const apk = path.join(dir, 'builds', 'app.apk');
    const report = await runScan(
      { cwd: dir, apk: path.relative(process.cwd(), apk), format: ['json'], ci: true, offline: true },
      { registry: { cache: new FileCache(path.join(dir, '.empty-cache')) } },
    );
    expect(report.apk?.file).toBe(apk);
    expect(report.meta.apk).toBe(apk);
  });

  it('uses the cacheDir option for registry data', async () => {
    await writeTree(dir, {
      'snapshot/npm-latest/react-native.json': { fetchedAt: 0, value: { latest: '0.87.1' } },
    });
    const report = await runScan({ cwd: dir, format: ['json'], ci: true, offline: true, cacheDir: path.join(dir, 'snapshot') });
    expect(report.meta).toMatchObject({ latestReactNative: '0.87.1', latestReactNativeSource: 'npm registry (cache)' });
  });

  it('shows Android and iOS settings in every format', async () => {
    await writeTree(dir, { 'ios/Podfile': 'platform :ios, min_ios_version_supported\n' });
    const report = await runScan({ cwd: dir, format: ['json'], ci: true, offline: true, cacheDir: path.join(dir, '.empty-cache') });
    for (const format of ['terminal', 'md', 'html'] as const) {
      const text = renderReport(report, format);
      expect(text, format).toContain('Native config vs React Native template');
      expect(text, format).toContain('targetSdk');
      expect(text, format).toContain('follows React Native');
    }
  });

  it('says the 16 KB check did not run when an Android app is scanned without --apk', async () => {
    const options = { cwd: dir, format: ['json'] as const, ci: true, offline: true, cacheDir: path.join(dir, '.empty-cache') };
    const withoutApk = await runScan({ ...options, format: ['json'] });
    for (const format of ['terminal', 'md', 'html'] as const) {
      expect(renderReport(withoutApk, format), format).toContain('Not checked: pass');
    }

    const lib = makeElf({ is64Bit: true, loadAligns: [16384] });
    await writeTree(dir, { 'app.apk': makeZip([{ name: 'lib/arm64-v8a/libreactnative.so', data: lib }]) });
    const withApk = await runScan({ ...options, format: ['json'], apk: path.join(dir, 'app.apk') });
    expect(renderReport(withApk, 'terminal')).not.toContain('Not checked: pass');
    expect(renderReport(withApk, 'terminal')).toContain('all compatible');
  });

  it('works offline with an empty cache', async () => {
    const report = await runScan(
      { cwd: dir, format: ['json'], ci: true, offline: true },
      { registry: { cache: new FileCache(path.join(dir, '.empty-cache')) } },
    );
    expect(report.meta.latestReactNative).toBeUndefined();
    expect(report.dependencies.every((d) => d.npm.source === 'offline, not cached')).toBe(true);
    expect(renderReport(report, 'md')).toContain('latest unknown, offline');
  });
});

describe('cli', () => {
  const cli = (...args: string[]) =>
    promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { cwd: path.resolve(__dirname, '..') });

  it('prints the version', async () => {
    const { version } = JSON.parse(await readFile(path.resolve(__dirname, '../package.json'), 'utf8')) as { version: string };
    expect((await cli('--version')).stdout.trim()).toBe(version);
  });

  it('shows every option in the top-level help', async () => {
    const { stdout } = await cli('--help');
    for (const flag of ['[path]', '--apk', '--format', '--out', '--ci', '--offline', '--cache-dir', 'Exit codes']) expect(stdout).toContain(flag);
  });

  it('still accepts the old "scan" form and defaults to terminal output only', async () => {
    const { stdout } = await cli('scan', 'examples/08-lockfiles/npm', '--offline', '--cache-dir', 'examples/registry-snapshot');
    expect(stdout).toContain('React Native 0.85.2 → 0.87.1');
    expect(stdout).not.toContain('Report written');
  });
});

describe('groupFindings', () => {
  it('lists findings for the same package together, at the position of the most severe one', () => {
    const f = (id: string, severity: 'blocker' | 'warning' | 'info', pkg?: string) => ({ id, severity, title: id, package: pkg, source: 't' });
    const groups = groupFindings([f('1', 'blocker', 'a'), f('2', 'warning'), f('3', 'warning', 'a'), f('4', 'info', 'b')]);
    expect(groups.map((g) => [g.severity, g.package, g.findings.map((x) => x.id)])).toEqual([
      ['blocker', 'a', ['1', '3']],
      ['warning', undefined, ['2']],
      ['info', 'b', ['4']],
    ]);
  });
});
