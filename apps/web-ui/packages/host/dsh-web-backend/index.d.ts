/**
 * Host-side DSH backend embedded by the CodexHost Web server.
 *
 * The Web server owns HTTP, authentication, and the WebSocket mux. This module
 * owns only the DSH plugin context and the two DSH-defined seams the right
 * Sidebar needs: a local Thread's working directory and the sandbox policy's
 * workspace root.
 */

/** Minimal host facts the DSH services consume. */
export interface DshWebBackendOptions {
  /** Absolute fallback root the DSH sandbox policy reports. */
  readonly workspaceRoot: string;
  /**
   * Resolve one local Thread's working directory.
   * @param sessionId - DSH Session identity received from the browser.
   * @returns the Host-recorded directory, or undefined when this Thread has none.
   */
  readonly threadWorkspace: (sessionId: string) => string | undefined;
}

/** One Remote failure in the DSH wire vocabulary. */
export interface DshRemoteFailure {
  readonly code: string;
  readonly message: string;
  readonly details: object;
}

/** The embedded DSH backend. */
export interface DshWebBackend {
  /**
   * Whether this backend owns a Remote endpoint.
   * @param endpoint - canonical `<namespace>/<method>` endpoint.
   * @returns true when the DSH gateway mounted the namespace.
   */
  handles(endpoint: string): boolean;
  /**
   * Dispatch one unary Remote request through DSH Connection and the gateway.
   * @param request - Fetch request carrying the Connection `client-request` envelope.
   * @returns the DSH response, including binary attachment responses.
   */
  fetch(request: Request): Promise<Response>;
  /**
   * Open one DSH Remote stream.
   * @param endpoint - canonical `<namespace>/<method>` endpoint.
   * @param args - named wire arguments.
   * @param signal - stream cancellation.
   * @returns the stream's decoded values.
   */
  openStream(
    endpoint: string,
    args: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<AsyncIterable<unknown>>;
  /**
   * Convert one stream failure into the DSH wire vocabulary.
   * @param error - failure raised while opening or consuming a stream.
   * @returns the carrier-safe failure.
   */
  failure(error: unknown): DshRemoteFailure;
  /** Dispose the DSH context and every service it mounted. */
  close(): Promise<void>;
}

/**
 * Mount the DSH backend for the right Sidebar.
 * @param options - local Thread lookup and fallback workspace root.
 * @returns the embedded backend.
 */
export function createDshWebBackend(options: DshWebBackendOptions): Promise<DshWebBackend>;
