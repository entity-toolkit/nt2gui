import { SERVER_URL } from "../config";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed: ${status} ${JSON.stringify(body)}`);
  }
}

export const apiUrl = (path: string) => `${SERVER_URL}/${path}`;

export const simulationUrl = (simulationId: string, path = "") =>
  apiUrl(
    `simulations/${encodeURIComponent(simulationId)}${path ? `/${path}` : ""}`,
  );

/**
 * Sends a JSON request and parses the JSON response; throws HttpError on
 * non-2xx. The response is trusted to have type T (the server's contract).
 */
export const requestJson = async <T>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> => {
  const response = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers:
      init.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error bodies are kept as text.
  }
  if (!response.ok) throw new HttpError(response.status, body);
  return body as T;
};

/** The body of a JSON error response ({error, path?, …}), if it is one. */
export const errorBody = (
  error: unknown,
): { error?: string; path?: string } | null =>
  error instanceof HttpError &&
  typeof error.body === "object" &&
  error.body !== null
    ? (error.body as { error?: string; path?: string })
    : null;

/** A message for the user: the server's `{error}` (and path), else the error's own. */
export const serverErrorMessage = (error: unknown): string => {
  const body = errorBody(error);
  if (body?.error)
    return body.path ? `${body.error}: ${body.path}` : body.error;
  return error instanceof Error ? error.message : String(error);
};
