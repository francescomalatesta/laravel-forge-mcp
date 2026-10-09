export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type MockHandler = MockResponse | Error | ((request: RecordedRequest) => MockResponse | Error);

/**
 * A fetch replacement that answers with queued responses (in order) and
 * records every request for assertions.
 */
export function createMockFetch(...queue: MockHandler[]) {
  const requests: RecordedRequest[] = [];

  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);

    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }
    const handled = typeof next === 'function' ? next(request) : next;
    if (handled instanceof Error) throw handled;

    const status = handled.status ?? 200;
    const hasBody = handled.body !== undefined && status !== 204;
    return new Response(hasBody ? JSON.stringify(handled.body) : null, {
      status,
      headers: { ...(hasBody ? { 'content-type': 'application/vnd.api+json' } : {}), ...handled.headers },
    });
  };

  return { fetch: fetchImpl as typeof fetch, requests, pending: () => queue.length };
}
