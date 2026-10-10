import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileCache, getDirectoryInfo, getNpmInfo, mapLimit, type fetchJson } from '../src/registry/index.js';
import { tempDir } from './helpers.js';

let cache: FileCache;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const tmp = await tempDir('cache');
  cache = new FileCache(tmp.dir);
  cleanup = tmp.cleanup;
});

afterEach(() => cleanup());

function fakeFetch(handler: (url: string, body: unknown) => { status: number; body: unknown }) {
  return vi.fn<typeof fetchJson>(async (url, init) => handler(url, init?.body));
}

describe('getNpmInfo', () => {
  it('fetches /latest, encodes scoped names, records deprecations and 404s', async () => {
    const fetch = fakeFetch((url) => {
      if (url.endsWith('/react-native/latest')) return { status: 200, body: { version: '0.87.1' } };
      if (url.endsWith('/@scope%2Fold/latest')) return { status: 200, body: { version: '1.0.0', deprecated: 'use new' } };
      return { status: 404, body: 'Not Found' };
    });
    const info = await getNpmInfo(['react-native', '@scope/old', 'private-pkg'], { offline: false, cache, fetch });
    expect(info).toEqual({
      'react-native': { value: { latest: '0.87.1' }, source: 'npm registry' },
      '@scope/old': { value: { latest: '1.0.0', deprecated: 'use new' }, source: 'npm registry' },
      'private-pkg': { source: 'not on npm' },
    });

    // Second call is served from the cache.
    const again = await getNpmInfo(['react-native', 'private-pkg'], { offline: false, cache, fetch });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(again['react-native'].source).toBe('npm registry (cache)');
    expect(again['private-pkg'].source).toBe('not on npm');
  });

  it('uses only the cache when offline', async () => {
    const fetch = fakeFetch(() => ({ status: 200, body: { version: '1.0.0' } }));
    await getNpmInfo(['cached'], { offline: false, cache, fetch });
    const info = await getNpmInfo(['cached', 'unknown'], { offline: true, cache, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(info).toEqual({
      cached: { value: { latest: '1.0.0' }, source: 'npm registry (cache)' },
      unknown: { source: 'offline, not cached' },
    });
  });

  it('labels network failures', async () => {
    const fetch = vi.fn<typeof fetchJson>(async () => {
      throw new Error('ENOTFOUND');
    });
    expect(await getNpmInfo(['x'], { offline: false, cache, fetch })).toEqual({ x: { source: 'npm registry unreachable' } });
  });
});

describe('getDirectoryInfo', () => {
  it('posts names in one request and maps the response', async () => {
    const fetch = fakeFetch((_url, body) => {
      expect(body).toEqual({ packages: ['react-native-camera', 'react-native-mmkv', 'lodash-not-listed'] });
      return {
        status: 200,
        body: {
          'react-native-camera': { unmaintained: true, newArchitecture: 'untested' },
          'react-native-mmkv': { newArchitecture: 'supported' },
        },
      };
    });
    const info = await getDirectoryInfo(['react-native-camera', 'react-native-mmkv', 'lodash-not-listed'], {
      offline: false,
      cache,
      fetch,
    });
    expect(info).toEqual({
      'react-native-camera': { value: { unmaintained: true, newArchitecture: 'untested' }, source: 'React Native Directory' },
      'react-native-mmkv': { value: { unmaintained: false, newArchitecture: 'supported' }, source: 'React Native Directory' },
      'lodash-not-listed': { source: 'not listed in React Native Directory' },
    });

    const cached = await getDirectoryInfo(['react-native-mmkv'], { offline: true, cache, fetch });
    expect(cached['react-native-mmkv'].source).toBe('React Native Directory (cache)');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('mapLimit', () => {
  it('keeps order and limits concurrency', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
