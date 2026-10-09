export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  /** Sent as JSON:API. */
  body?: unknown;
  /** Sent as is (e.g. CSV): set the content-type in `headers`. */
  text?: string;
  headers?: Record<string, string>;
}

export type MockHandler = MockResponse | Error | ((request: RecordedRequest) => MockResponse | Error);

/**
 * A fetch replacement that answers with queued responses (in order) and
 * records every request for assertions.
 */
export function createMockFetch(...queue: MockHandler[]) {
  const requests: RecordedRequest[] = [];
  const unexpected: RecordedRequest[] = [];

  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      // JSON bodies are parsed; FormData (multipart uploads) is recorded as is.
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body instanceof FormData ? init.body : undefined,
    };
    requests.push(request);

    const next = queue.shift();
    if (next === undefined) {
      unexpected.push(request);
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }
    const handled = typeof next === 'function' ? next(request) : next;
    if (handled instanceof Error) throw handled;

    const status = handled.status ?? 200;
    if (handled.text !== undefined) return new Response(handled.text, { status, headers: handled.headers });
    const hasBody = handled.body !== undefined && status !== 204;
    return new Response(hasBody ? JSON.stringify(handled.body) : null, {
      status,
      headers: { ...(hasBody ? { 'content-type': 'application/vnd.api+json' } : {}), ...handled.headers },
    });
  };

  return { fetch: fetchImpl as typeof fetch, requests, unexpected, pending: () => queue.length };
}
