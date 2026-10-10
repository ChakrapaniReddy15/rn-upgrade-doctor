import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Report, ReportFormat } from '../types.js';
import { renderHtml } from './html.js';
import { renderMarkdown } from './markdown.js';
import { renderTerminal } from './terminal.js';

export { renderHtml, renderMarkdown, renderTerminal };

export const REPORT_BASENAME = 'rn-upgrade-doctor-report';
const EXTENSIONS: Record<Exclude<ReportFormat, 'terminal'>, string> = { html: 'html', md: 'md', json: 'json' };

export function renderReport(report: Report, format: ReportFormat, options: { color?: boolean } = {}): string {
  switch (format) {
    case 'terminal':
      return renderTerminal(report, { color: options.color ?? false });
    case 'md':
      return renderMarkdown(report);
    case 'html':
      return renderHtml(report);
    case 'json':
      return `${JSON.stringify(report, null, 2)}\n`;
  }
}

/** Write each file format to `outDir` and return the paths written. The terminal format is not a file. */
export async function writeReports(report: Report, formats: ReportFormat[], outDir: string): Promise<string[]> {
  const written: string[] = [];
  for (const format of formats) {
    if (format === 'terminal') continue;
    await mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${REPORT_BASENAME}.${EXTENSIONS[format]}`);
    await writeFile(file, renderReport(report, format));
    written.push(file);
  }
  return written;
}
