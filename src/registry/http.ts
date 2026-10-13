const USER_AGENT = 'rn-upgrade-doctor (+https://github.com/ChakrapaniReddy15/rn-upgrade-doctor)';

export interface JsonResponse {
  status: number;
  body: unknown;
}

/** fetch() with a timeout and JSON body. Throws on network errors and timeouts, not on HTTP error codes. */
export async function fetchJson(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<JsonResponse> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/** Map with at most `limit` promises in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface TextResponse {
  status: number;
  text: string;
}

/** fetch() for plain-text files (raw GitHub content). Throws on network errors and timeouts, not on HTTP error codes. */
export async function fetchText(url: string, init: { timeoutMs?: number } = {}): Promise<TextResponse> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  return { status: response.status, text: await response.text() };
}
