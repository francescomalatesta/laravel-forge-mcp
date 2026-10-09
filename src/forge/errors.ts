/** An HTTP error response returned by the Forge API. */
export class ForgeApiError extends Error {
  override name = 'ForgeApiError';

  constructor(
    readonly status: number,
    message: string,
    readonly method: string,
    readonly path: string,
    /** Field-level validation errors (422 responses). */
    readonly validationErrors: Record<string, string[]> | undefined = undefined,
    /** Seconds to wait before retrying, when Forge tells us (429). */
    readonly retryAfterSeconds: number | undefined = undefined,
  ) {
    super(message);
  }
}

/** The request never produced an HTTP response (network failure or timeout). */
export class ForgeConnectionError extends Error {
  override name = 'ForgeConnectionError';

  constructor(
    message: string,
    readonly method: string,
    readonly path: string,
    readonly timedOut: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
