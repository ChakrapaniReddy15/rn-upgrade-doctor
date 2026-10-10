import type { NpmPackageInfo, Sourced } from '../types.js';
import { FileCache } from './cache.js';
import { fetchJson, mapLimit } from './http.js';

const REGISTRY = 'https://registry.npmjs.org';
const NAMESPACE = 'npm-latest';
const TTL_MS = 12 * 60 * 60 * 1000;
const SOURCE = 'npm registry';

export interface RegistryOptions {
  offline: boolean;
  cache?: FileCache;
  /** Replaceable in tests. */
  fetch?: typeof fetchJson;
}

/**
 * Latest version and deprecation notice for each package, from `/<name>/latest` (a few KB, unlike the full document).
 * Fresh cache entries are used first; on network failure a stale entry is used; with --offline only the cache is read.
 */
export async function getNpmInfo(names: string[], options: RegistryOptions): Promise<Record<string, Sourced<NpmPackageInfo>>> {
  const cache = options.cache ?? new FileCache();
  const fetcher = options.fetch ?? fetchJson;

  const results = await mapLimit(names, 8, async (name): Promise<[string, Sourced<NpmPackageInfo>]> => {
    // null in the cache records "not on npm" (private or unpublished package).
    const cached = await cache.get<NpmPackageInfo | null>(NAMESPACE, name);
    const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
    if (cached && (fresh || options.offline)) return [name, fromValue(cached.value, `${SOURCE} (cache)`)];
    if (options.offline) return [name, { source: 'offline, not cached' }];

    try {
      const { status, body } = await fetcher(`${REGISTRY}/${encodeName(name)}/latest`);
      if (status === 404) {
        await cache.set(NAMESPACE, name, null);
        return [name, fromValue(null, SOURCE)];
      }
      if (status !== 200 || typeof body !== 'object' || body === null) throw new Error(`HTTP ${status}`);
      const doc = body as { version?: string; deprecated?: string };
      if (!doc.version) throw new Error('no version in response');
      const value: NpmPackageInfo = { latest: doc.version, ...(doc.deprecated ? { deprecated: doc.deprecated } : {}) };
      await cache.set(NAMESPACE, name, value);
      return [name, { value, source: SOURCE }];
    } catch {
      if (cached) return [name, fromValue(cached.value, `${SOURCE} (stale cache)`)];
      return [name, { source: 'npm registry unreachable' }];
    }
  });
  return Object.fromEntries(results);
}

function fromValue(value: NpmPackageInfo | null, source: string): Sourced<NpmPackageInfo> {
  return value ? { value, source } : { source: 'not on npm' };
}

/** "@scope/name" -> "@scope%2fname", the form the registry expects. */
function encodeName(name: string): string {
  return name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}
