import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderReport, runScan, writeReports } from '../src/index.js';
import { FileCache } from '../src/registry/index.js';
import { tempDir, writeTree } from './helpers.js';

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
    'android/build.gradle': 'ext {\n  minSdkVersion = 24\n  compileSdkVersion = 35\n  targetSdkVersion = 35\n}\n',
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
    expect(report.android).toMatchObject({ targetSdk: 35 });
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
