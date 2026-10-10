#!/usr/bin/env node
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { renderReport, runScan, writeReports, type ReportFormat } from './index.js';

const FORMATS: readonly ReportFormat[] = ['terminal', 'html', 'md', 'json'];

function parseFormats(value: string): ReportFormat[] {
  const formats = value.split(',').map((f) => f.trim()).filter(Boolean);
  const unknown = formats.filter((f) => !FORMATS.includes(f as ReportFormat));
  if (unknown.length > 0) throw new InvalidArgumentError(`unknown format ${unknown.join(', ')} (use ${FORMATS.join(', ')})`);
  return formats as ReportFormat[];
}

const program = new Command();

program
  .name('rn-upgrade-doctor')
  .description('See what breaks when you upgrade a React Native app, and what to fix first.');

program
  .command('scan', { isDefault: true })
  .description('scan a React Native project (default command)')
  .option('--cwd <path>', 'React Native project folder', process.cwd())
  .option('--apk <path>', 'built APK or AAB to scan for 16 KB page-size support')
  .option('--format <list>', 'comma-separated: terminal,html,md,json', parseFormats, ['terminal', 'html'] as ReportFormat[])
  .option('--out <dir>', 'folder for html/md/json reports (default: the project folder)')
  .option('--ci', 'CI mode: no colours, exit 1 on blockers', false)
  .option('--offline', 'skip network lookups (use cache only)', false)
  .action(async (opts: { cwd: string; apk?: string; format: ReportFormat[]; out?: string; ci: boolean; offline: boolean }) => {
    try {
      const report = await runScan({
        cwd: opts.cwd,
        apk: opts.apk,
        format: opts.format,
        ci: opts.ci,
        offline: opts.offline,
      });

      if (opts.format.includes('terminal')) {
        const color = !opts.ci && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
        console.log(renderReport(report, 'terminal', { color }));
      }
      const written = await writeReports(report, opts.format, path.resolve(opts.out ?? report.meta.cwd));
      for (const file of written) console.log(`Report written: ${file}`);

      process.exitCode = report.summary.blockers > 0 ? 1 : 0;
    } catch (err) {
      console.error(`rn-upgrade-doctor: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    }
  });

program.parseAsync();
