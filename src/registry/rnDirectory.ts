import type { DirectoryInfo, NewArchStatus, Sourced } from '../types.js';
import { FileCache } from './cache.js';
import { fetchJson } from './http.js';
import type { RegistryOptions } from './npm.js';

/**
 * React Native Directory bulk check endpoint (verified 2026-10):
 * POST {"packages": [...]} -> {"<name>": {"newArchitecture": "supported" | "unsupported" | "untested" | "new-arch-only",
 * "unmaintained"?: true}}. Packages the directory does not list are left out of the response.
 */
const CHECK_URL = 'https://reactnative.directory/api/libraries/check';
const NAMESPACE = 'rn-directory';
const TTL_MS = 24 * 60 * 60 * 1000;
const SOURCE = 'React Native Directory';
const BATCH = 100;
const STATUSES: readonly string[] = ['supported', 'unsupported', 'untested', 'new-arch-only'];

export async function getDirectoryInfo(
  names: string[],
  options: RegistryOptions,
): Promise<Record<string, Sourced<DirectoryInfo>>> {
  const cache = options.cache ?? new FileCache();
  const fetcher = options.fetch ?? fetchJson;
  const result: Record<string, Sourced<DirectoryInfo>> = {};
  const stale = new Map<string, DirectoryInfo | null>();
  const toFetch: string[] = [];

  for (const name of names) {
    // null in the cache records "not listed in the directory".
    const cached = await cache.get<DirectoryInfo | null>(NAMESPACE, name);
    if (cached && (options.offline || Date.now() - cached.fetchedAt < TTL_MS)) {
      result[name] = fromValue(cached.value, `${SOURCE} (cache)`);
    } else if (options.offline) {
      result[name] = { source: 'offline, not cached' };
    } else {
      if (cached) stale.set(name, cached.value);
      toFetch.push(name);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    try {
      const { status, body } = await fetcher(CHECK_URL, { method: 'POST', body: { packages: batch } });
      if (status !== 200 || typeof body !== 'object' || body === null) throw new Error(`HTTP ${status}`);
      const listed = body as Record<string, { newArchitecture?: string; unmaintained?: boolean }>;
      for (const name of batch) {
        const entry = listed[name];
        const value: DirectoryInfo | null = entry
          ? {
              unmaintained: entry.unmaintained === true,
              ...(entry.newArchitecture && STATUSES.includes(entry.newArchitecture)
                ? { newArchitecture: entry.newArchitecture as NewArchStatus }
                : {}),
            }
          : null;
        await cache.set(NAMESPACE, name, value);
        result[name] = fromValue(value, SOURCE);
      }
    } catch {
      for (const name of batch) {
        result[name] = stale.has(name)
          ? fromValue(stale.get(name) ?? null, `${SOURCE} (stale cache)`)
          : { source: 'React Native Directory unreachable' };
      }
    }
  }
  return result;
}

function fromValue(value: DirectoryInfo | null, source: string): Sourced<DirectoryInfo> {
  return value ? { value, source } : { source: `not listed in ${SOURCE}` };
}
