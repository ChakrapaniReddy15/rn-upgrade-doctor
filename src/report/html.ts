import type { Report } from '../types.js';
import {
  SEVERITY_LABEL,
  configSections,
  dataSources,
  headline,
  interestingDependencies,
  maintenanceLabel,
  newArchLabel,
} from './shared.js';

/** A single self-contained HTML page (inline CSS, no scripts), safe to attach to CI runs. */
export function renderHtml(report: Report): string {
  const { blockers, warnings, info } = report.summary;
  const deps = interestingDependencies(report);

  const findings = report.findings
    .map(
      (f, i) => `<li class="finding ${f.severity}">
  <div class="title"><span class="badge ${f.severity}">${SEVERITY_LABEL[f.severity]}</span> <span class="n">${i + 1}.</span> ${esc(f.title)}</div>
  ${f.detail ? `<p class="detail">${esc(f.detail)}</p>` : ''}
  ${f.fix ? `<p class="fix">→ ${linkify(f.fix)}</p>` : ''}
  <p class="source">source: ${esc(f.source)}</p>
</li>`,
    )
    .join('\n');

  const depRows = deps
    .map(
      (d) =>
        `<tr><td>${esc(d.name)}${d.dev ? ' <span class="dim">(dev)</span>' : ''}</td><td>${esc(d.installed ?? d.declared)}</td><td>${esc(d.npm.value?.latest ?? '?')}</td><td class="s-${cls(newArchLabel(d))}">${esc(newArchLabel(d))}</td><td class="s-${cls(maintenanceLabel(d))}">${esc(maintenanceLabel(d))}</td></tr>`,
    )
    .join('\n');

  const config = configSections(report)
    .map((section) =>
      section.rows.length === 0
        ? `<h3>${section.platform}</h3><p class="dim">Not found.</p>`
        : `<h3>${section.platform} <span class="dim">(${section.files.map(esc).join(', ')})</span></h3>
<div class="table-wrap"><table><tbody>
${section.rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td${value.startsWith('not') ? ' class="dim"' : ''}>${esc(value)}</td></tr>`).join('\n')}
</tbody></table></div>`,
    )
    .join('\n');

  const apkLibs = report.apk?.libs.filter((l) => l.is64Bit) ?? [];
  const apkRows = apkLibs
    .map(
      (l) =>
        `<tr class="${l.elfOk && l.zipAligned !== false ? '' : 'bad'}"><td>${esc(l.name)}</td><td>${esc(l.abi)}</td><td>${esc(l.package ?? '?')}</td><td>${l.loadAlign === undefined ? '?' : `${l.loadAlign / 1024} KB`}</td><td>${l.zipAligned === undefined ? '–' : l.zipAligned ? 'yes' : 'no'}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RN Upgrade Report</title>
<style>
:root { --bg:#fff; --fg:#1b1f24; --dim:#626b75; --line:#d8dee4; --card:#f6f8fa; --red:#cf222e; --yellow:#9a6700; --blue:#0969da; --green:#1a7f37; }
@media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --dim:#8d96a0; --line:#30363d; --card:#161b22; --red:#ff7b72; --yellow:#d29922; --blue:#58a6ff; --green:#3fb950; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; } h2 { font-size: 1.15rem; margin: 32px 0 12px; } h3 { font-size: 1rem; margin: 16px 0 8px; }
.dim, .meta, .source { color: var(--dim); } .meta { margin: 0; font-size: .9rem; word-break: break-all; }
.summary { display:flex; gap:12px; flex-wrap:wrap; margin: 16px 0; }
.summary div { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 14px; }
.summary strong { font-size: 1.3rem; display:block; }
.b { color: var(--red); } .w { color: var(--yellow); } .i { color: var(--blue); }
ol { list-style: none; padding: 0; margin: 0; }
.finding { border:1px solid var(--line); border-left-width:4px; border-radius:6px; padding:10px 14px; margin-bottom:10px; background: var(--card); }
.finding.blocker { border-left-color: var(--red); } .finding.warning { border-left-color: var(--yellow); } .finding.info { border-left-color: var(--blue); }
.finding p { margin: 4px 0 0; } .title { font-weight: 600; } .n { color: var(--dim); }
.badge { font-size:.75rem; font-weight:600; padding:1px 6px; border-radius:10px; color:#fff; }
.badge.blocker { background: var(--red); } .badge.warning { background: var(--yellow); } .badge.info { background: var(--blue); }
.source { font-size: .8rem; } a { color: var(--blue); word-break: break-all; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .9rem; }
th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); white-space: nowrap; }
tr.bad td { color: var(--red); font-weight: 600; }
.s-no, .s-deprecated, .s-unmaintained { color: var(--red); } .s-untested { color: var(--yellow); } .s-yes, .s-yes-only, .s-ok { color: var(--green); }
footer { margin-top: 32px; font-size: .8rem; color: var(--dim); }
</style>
</head>
<body>
<main>
<h1>${esc(headline(report))}</h1>
<p class="meta">${esc(report.meta.cwd)}${report.meta.packageManager ? ` · ${esc(report.meta.packageManager)}` : ''}</p>
${report.meta.upgradeHelperUrl ? `<p class="meta">Upgrade diff: ${linkify(report.meta.upgradeHelperUrl)}</p>` : ''}
<div class="summary">
  <div class="b"><strong>${blockers}</strong>blockers</div>
  <div class="w"><strong>${warnings}</strong>warnings</div>
  <div class="i"><strong>${info}</strong>info</div>
</div>
${report.findings.length > 0 ? `<h2>What to fix first</h2>\n<ol>\n${findings}\n</ol>` : '<p>No findings.</p>'}
${deps.length > 0 ? `<h2>Dependencies to review <span class="dim">(${deps.length} of ${report.dependencies.length})</span></h2>
<div class="table-wrap"><table><thead><tr><th>Package</th><th>Installed</th><th>Latest</th><th>New Arch</th><th>Maintenance</th></tr></thead><tbody>
${depRows}
</tbody></table></div>` : ''}
<h2>Project config</h2>
${config}
${report.apk ? `<h2>16 KB page size</h2><p class="meta">${esc(report.apk.file)}</p>
<div class="table-wrap"><table><thead><tr><th>Library</th><th>ABI</th><th>Package</th><th>ELF align</th><th>Zip aligned</th></tr></thead><tbody>
${apkRows}
</tbody></table></div>` : ''}
<h2>Data sources</h2>
<ul class="dim">${dataSources(report).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<footer>Generated by rn-upgrade-doctor ${esc(report.meta.version)} on ${esc(report.meta.scannedAt)}</footer>
</main>
</body>
</html>
`;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape, then turn https URLs into links. */
function linkify(text: string): string {
  return esc(text).replace(/https:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}

function cls(label: string): string {
  return label.replace(/[^a-z]+/g, '-').replace(/-$/, '');
}
