#!/usr/bin/env node
import { Command } from 'commander';
import { runScan } from './index.js';

const program = new Command();

program
  .name('rn-upgrade-doctor')
  .description('See what breaks when you upgrade a React Native app, and what to fix first.')
  .option('--cwd <path>', 'React Native project folder', process.cwd())
  .option('--apk <path>', 'built APK or AAB to scan for 16 KB page-size support')
  .option('--format <list>', 'terminal,html,md,json', 'terminal,html')
  .option('--ci', 'CI mode: no colours, exit 1 on blockers', false)
  .option('--offline', 'skip network lookups (use cache only)', false)
  .action(async (opts) => {
    try {
      const report = await runScan({
        cwd: opts.cwd,
        apk: opts.apk,
        format: String(opts.format).split(',') as never,
        ci: Boolean(opts.ci),
        offline: Boolean(opts.offline),
      });
      // TODO (week 1): render with src/report/terminal.ts
      console.log(JSON.stringify(report.summary));
      process.exitCode = report.summary.blockers > 0 ? 1 : 0;
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 2;
    }
  });

program.parseAsync();
