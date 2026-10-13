/**
 * Minimal semver helpers for x.y.z[-pre] strings (missing parts count as 0, so SDK levels like "35" compare too).
 * Enough for comparisons in rules; not a full semver implementation.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

export function parseVersion(version: string): Version | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(version.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2] ?? 0), patch: Number(match[3] ?? 0), prerelease: match[4] ?? '' };
}

/** Negative if a < b, 0 if equal, positive if a > b. Unparseable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return (va ? 1 : 0) - (vb ? 1 : 0);
  return (
    va.major - vb.major ||
    va.minor - vb.minor ||
    va.patch - vb.patch ||
    // A prerelease is lower than the release itself.
    (va.prerelease === vb.prerelease ? 0 : va.prerelease === '' ? 1 : vb.prerelease === '' ? -1 : va.prerelease < vb.prerelease ? -1 : 1)
  );
}

export function gte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

/** "Breaking" distance: majors for >= 1.0.0, minors for 0.x (where each minor is breaking, as in React Native). */
export function breakingDistance(from: string, to: string): number {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return 0;
  if (a.major === 0 && b.major === 0) return Math.max(0, b.minor - a.minor);
  return Math.max(0, b.major - a.major);
}
