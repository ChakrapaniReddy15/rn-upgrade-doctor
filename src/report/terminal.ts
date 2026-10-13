import Table from 'cli-table3';
import pc from 'picocolors';
import type { Report, Severity } from '../types.js';
import {
  NATIVE_STATUS_LABEL,
  dataSources,
  groupFindings,
  headline,
  interestingDependencies,
  maintenanceLabel,
  nativeSections,
  newArchLabel,
  templateColumns,
} from './shared.js';

export function renderTerminal(report: Report, options: { color: boolean }): string {
  const c = pc.createColors(options.color);
  const icon: Record<Severity, string> = { blocker: c.red('✖'), warning: c.yellow('▲'), info: c.blue('ℹ') };
  const out: string[] = [];

  out.push('', c.bold(`rn-upgrade-doctor · ${headline(report)}`));
  out.push(c.dim(`${report.meta.cwd}${report.meta.packageManager ? ` · ${report.meta.packageManager}` : ''}`));
  if (report.meta.upgradeHelperUrl) out.push(`Upgrade diff: ${c.cyan(report.meta.upgradeHelperUrl)}`);

  const { blockers, warnings, info } = report.summary;
  out.push(
    '',
    `${c.red(c.bold(`${blockers} blocker${blockers === 1 ? '' : 's'}`))}  ${c.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`)}  ${c.blue(`${info} info`)}`,
  );

  if (report.findings.length > 0) {
    out.push('', c.bold('What to fix first'));
    groupFindings(report.findings).forEach((group, i) => {
      const n = `${String(i + 1).padStart(3)}.`;
      if (group.findings.length === 1) {
        const f = group.findings[0];
        out.push(`${n} ${icon[f.severity]} ${f.title}`);
        if (f.detail) out.push(c.dim(`       ${oneLine(f.detail)}`));
        if (f.fix) out.push(`       ${c.green('→')} ${f.fix}`);
        out.push(c.dim(`       source: ${f.source}`));
        return;
      }
      out.push(`${n} ${icon[group.severity]} ${c.bold(group.package!)}: ${group.findings.length} problems`);
      for (const f of group.findings) {
        out.push(`       ${icon[f.severity]} ${f.title}`);
        if (f.detail) out.push(c.dim(`         ${oneLine(f.detail)}`));
        if (f.fix) out.push(`         ${c.green('→')} ${f.fix}`);
        out.push(c.dim(`         source: ${f.source}`));
      }
    });
  }

  const deps = interestingDependencies(report);
  if (deps.length > 0) {
    const table = new Table({
      head: ['Package', 'Installed', 'Latest', 'New Arch', 'Maintenance'],
      style: { head: options.color ? ['cyan'] : [], border: options.color ? ['grey'] : [] },
    });
    for (const d of deps) {
      const outdated = d.installed && d.npm.value && d.installed !== d.npm.value.latest;
      table.push([
        d.name + (d.dev ? c.dim(' (dev)') : ''),
        d.installed ?? c.dim(d.declared),
        d.npm.value ? (outdated ? c.yellow(d.npm.value.latest) : d.npm.value.latest) : c.dim('?'),
        colorStatus(newArchLabel(d), c),
        colorStatus(maintenanceLabel(d), c),
      ]);
    }
    out.push('', c.bold(`Dependencies to review (${deps.length} of ${report.dependencies.length})`), table.toString());
  }

  const columns = templateColumns(report);
  out.push('', c.bold('Native config vs React Native template'));
  for (const section of nativeSections(report)) {
    if (section.rows.length === 0) {
      out.push(`  ${section.platform}: ${c.dim(`no ${section.platform === 'Android' ? 'android/' : 'ios/Podfile'} found`)}`);
      continue;
    }
    const table = new Table({
      head: [`${section.platform}`, 'Yours', ...columns.map((col) => col.title), 'Status'],
      style: { head: options.color ? ['cyan'] : [], border: options.color ? ['grey'] : [] },
    });
    for (const row of section.rows) {
      const label = NATIVE_STATUS_LABEL[row.status];
      const status = row.status === 'below-required' ? c.red(label) : label.startsWith('▲') ? c.yellow(label) : label.startsWith('✓') ? c.green(label) : c.dim(label);
      table.push([row.label, row.yours.startsWith('not') ? c.dim(row.yours) : row.yours, ...columns.map((col) => row[col.key] ?? c.dim('–')), status]);
    }
    out.push(c.dim(`  ${section.files.join(', ')}`), table.toString());
  }

  if (report.apk) {
    const libs64 = report.apk.libs.filter((l) => l.is64Bit);
    const bad = libs64.filter((l) => !l.elfOk || l.zipAligned === false);
    out.push(
      '',
      c.bold('16 KB page size'),
      `${report.apk.file}: ${libs64.length} 64-bit native libraries, ${bad.length === 0 ? c.green('all compatible') : c.red(`${bad.length} not compatible`)}`,
    );
  }

  out.push('', c.dim('Data sources:'), ...dataSources(report).map((s) => c.dim(`  ${s}`)), '');
  return out.join('\n');
}

function colorStatus(label: string, c: ReturnType<typeof pc.createColors>): string {
  if (label === 'no' || label === 'deprecated' || label === 'unmaintained') return c.red(label);
  if (label === 'untested') return c.yellow(label);
  if (label.startsWith('yes') || label === 'ok') return c.green(label);
  return c.dim(label);
}

/** npm deprecation messages can span several lines; keep the terminal layout intact. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}
