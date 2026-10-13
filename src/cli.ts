#!/usr/bin/env node
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { TOOL_VERSION, exitCodeFor, renderReport, runScan, writeReports, type ReportFormat } from './index.js';

const FORMATS: readonly ReportFormat[] = ['terminal', 'html', 'md', 'json'];

function parseFormats(value: string): ReportFormat[] {
  const formats = value.split(',').map((f) => f.trim()).filter(Boolean);
  const unknown = formats.filter((f) => !FORMATS.includes(f as ReportFormat));
  if (unknown.length > 0) throw new InvalidArgumentError(`unknown format ${unknown.join(', ')} (use ${FORMATS.join(', ')})`);
  return formats as ReportFormat[];
}

interface ScanFlags {
  cwd?: string;
  apk?: string;
  format: ReportFormat[];
  out?: string;
  ci: boolean;
  offline: boolean;
  cacheDir?: string;
}

/**
 * Colours follow the usual conventions: FORCE_COLOR (not "0") turns them on even when output is piped,
 * NO_COLOR turns them off, otherwise only an interactive terminal gets colours.
 */
export function useColor(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false') return true;
  if (env.NO_COLOR) return false;
  return isTTY;
}

const program = new Command();

program
  .name('rn-upgrade-doctor')
  .description('See what breaks when you upgrade a React Native app, and what to fix first.')
  .version(TOOL_VERSION, '-v, --version', 'print the version')
  .argument('[path]', 'React Native project folder (default: current folder)')
  .option('--cwd <path>', 'same as [path]')
  .option('--apk <path>', 'built APK or AAB to scan for 16 KB page-size support (relative to the current folder)')
  .option('--format <list>', 'comma-separated: terminal,html,md,json', parseFormats, ['terminal'] as ReportFormat[])
  .option('--out <dir>', 'folder for html/md/json reports (default: the project folder)')
  .option('--ci', 'CI mode: no colours; exit 2 if npm or React Native Directory cannot be reached', false)
  .option('--offline', 'no network: use cached registry data only', false)
  .option('--cache-dir <dir>', 'registry cache folder (default: $RN_UPGRADE_DOCTOR_CACHE_DIR or ~/.cache/rn-upgrade-doctor)')
  .addHelpText(
    'after',
    `
Exit codes: 0 no blockers, 1 blockers found, 2 the tool could not run (or, with --ci, a registry was unreachable).

Examples:
  rn-upgrade-doctor                                  scan the current folder
  rn-upgrade-doctor ./apps/mobile --format terminal,html
  rn-upgrade-doctor --apk android/app/build/outputs/apk/release/app-release.apk`,
  )
  .action(async (projectPath: string | undefined, opts: ScanFlags) => {
    try {
      const report = await runScan({
        cwd: projectPath ?? opts.cwd ?? process.cwd(),
        apk: opts.apk,
        format: opts.format,
        ci: opts.ci,
        offline: opts.offline,
        cacheDir: opts.cacheDir === undefined ? undefined : path.resolve(opts.cacheDir),
      });

      if (opts.format.includes('terminal')) {
        const color = !opts.ci && useColor(process.env, Boolean(process.stdout.isTTY));
        console.log(renderReport(report, 'terminal', { color }));
      }
      const written = await writeReports(report, opts.format, path.resolve(opts.out ?? report.meta.cwd));
      for (const file of written) console.log(`Report written: ${file}`);

      process.exitCode = exitCodeFor(report, { ci: opts.ci });
    } catch (err) {
      console.error(`rn-upgrade-doctor: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    }
  });

// `rn-upgrade-doctor scan [path]` was the original form; keep accepting it.
const argv = process.argv.slice(2);
program.parseAsync(argv[0] === 'scan' ? argv.slice(1) : argv, { from: 'user' });
