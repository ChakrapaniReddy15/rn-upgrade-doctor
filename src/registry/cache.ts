import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
}

/** ~/.cache/rn-upgrade-doctor, overridable with RN_UPGRADE_DOCTOR_CACHE_DIR or XDG_CACHE_HOME. */
export function defaultCacheDir(): string {
  if (process.env.RN_UPGRADE_DOCTOR_CACHE_DIR) return process.env.RN_UPGRADE_DOCTOR_CACHE_DIR;
  const base = process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache');
  return path.join(base, 'rn-upgrade-doctor');
}

/** One JSON file per key. Failures to read or write are ignored: the cache is only an optimisation. */
export class FileCache {
  constructor(private readonly dir: string = defaultCacheDir()) {}

  private file(namespace: string, key: string): string {
    return path.join(this.dir, namespace, `${encodeURIComponent(key)}.json`);
  }

  async get<T>(namespace: string, key: string): Promise<CacheEntry<T> | undefined> {
    try {
      return JSON.parse(await readFile(this.file(namespace, key), 'utf8')) as CacheEntry<T>;
    } catch {
      return undefined;
    }
  }

  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    const file = this.file(namespace, key);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ fetchedAt: Date.now(), value } satisfies CacheEntry<T>));
    } catch {
      // Read-only home or full disk: carry on without caching.
    }
  }
}
