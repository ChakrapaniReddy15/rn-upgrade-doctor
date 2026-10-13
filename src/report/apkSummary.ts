import path from 'node:path';
import { PLAY_POLICY } from '../rules/index.js';
import type { NativeLib, Report } from '../types.js';

export type ApkProblem = 'zip' | 'elf';

export interface ApkPackageGroup {
  /** undefined when no package owns the libraries. */
  package?: string;
  libs: string[];
  problems: ApkProblem[];
}

/** The 16 KB scan in the terms people think in: libraries (not per-ABI copies), why they fail, and who owns them. */
export interface ApkSummary {
  /** Relative to the project when the file is inside it. */
  file: string;
  /** Full path, for commands that must work from any folder. */
  absolutePath: string;
  kind: 'apk' | 'aab';
  /** 64-bit ABIs present, e.g. ["arm64-v8a", "x86_64"]. */
  abis: string[];
  /** Distinct 64-bit library names. */
  total: number;
  ready: number;
  /** Libraries with 4 KB ELF segments: each owning package needs an upgrade. */
  elf: number;
  /** Libraries whose only problem is zip alignment: one build setting fixes all of them. */
  zipOnly: number;
  /** Failing libraries grouped by package, most libraries first. */
  byPackage: ApkPackageGroup[];
  ok: boolean;
}

export function summarizeApk(report: Report): ApkSummary | undefined {
  const apk = report.apk;
  if (!apk) return undefined;

  const libs64 = apk.libs.filter((l) => l.is64Bit);
  // A library counts once; it fails if any of its ABI copies fails, for every reason seen.
  const byName = new Map<string, { package?: string; problems: Set<ApkProblem> }>();
  for (const lib of libs64) {
    const entry = byName.get(lib.name) ?? { package: lib.package, problems: new Set<ApkProblem>() };
    for (const problem of problemsOf(lib)) entry.problems.add(problem);
    byName.set(lib.name, entry);
  }

  const failing = [...byName.entries()].filter(([, e]) => e.problems.size > 0);
  const groups = new Map<string, ApkPackageGroup>();
  for (const [name, entry] of failing) {
    const key = entry.package ?? '';
    const group = groups.get(key) ?? { package: entry.package, libs: [], problems: [] };
    group.libs.push(name);
    for (const problem of entry.problems) if (!group.problems.includes(problem)) group.problems.push(problem);
    groups.set(key, group);
  }

  const relative = path.relative(report.meta.cwd, apk.file);
  return {
    file: relative.startsWith('..') || path.isAbsolute(relative) ? apk.file : relative.split(path.sep).join('/'),
    absolutePath: apk.file,
    kind: apk.kind,
    abis: [...new Set(libs64.map((l) => l.abi))].sort(),
    total: byName.size,
    ready: byName.size - failing.length,
    elf: failing.filter(([, e]) => e.problems.has('elf')).length,
    zipOnly: failing.filter(([, e]) => !e.problems.has('elf')).length,
    byPackage: [...groups.values()]
      .map((g) => ({ ...g, libs: g.libs.sort(), problems: g.problems.sort() }))
      // Known packages by size; libraries without a known owner last.
      .sort((a, b) => Number(a.package === undefined) - Number(b.package === undefined) || b.libs.length - a.libs.length),
    ok: failing.length === 0,
  };
}

function problemsOf(lib: NativeLib): ApkProblem[] {
  return [...(lib.elfOk ? [] : ['elf' as const]), ...(lib.zipAligned === false ? ['zip' as const] : [])];
}

export function verdictText(s: ApkSummary): string {
  if (s.total === 0) return 'No 64-bit native libraries found';
  if (s.ok) return s.total === 1 ? 'Ready: the only native library supports 16 KB pages' : `Ready: all ${s.total} native libraries support 16 KB pages`;
  return `Not ready: ${PLAY_POLICY.sixteenKbShort}`;
}

export function scopeText(s: ApkSummary): string {
  const abis = s.abis.length > 1 ? ` × ${s.abis.length} ABIs (${s.abis.join(', ')})` : s.abis.length === 1 ? ` (${s.abis[0]})` : '';
  return `${s.file} · ${s.total} native ${plural(s.total, 'library', 'libraries')}${abis}`;
}

export const ELF_FIX = 'Upgrade each package below to a release built for 16 KB pages (NDK r28+, or linked with -Wl,-z,max-page-size=16384).';

export function problemText(problems: ApkProblem[]): string {
  return problems.map((p) => (p === 'zip' ? 'zip alignment' : '4 KB ELF segments')).join(' + ');
}

/**
 * Google's own check (zipalign from the Android SDK build-tools), for an APK only: an AAB is aligned by Google Play
 * when it builds the APKs. Uses the full path so the command works from any folder.
 */
export function googleCheck(s: ApkSummary): string | undefined {
  if (s.kind !== 'apk') return undefined;
  return `zipalign -c -P 16 -v 4 ${/[\s"'$`\\]/.test(s.absolutePath) ? `"${s.absolutePath.replace(/(["$`\\])/g, '\\$1')}"` : s.absolutePath}`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
