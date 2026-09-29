export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed: ${status} ${JSON.stringify(body)}`);
  }
}

/** Sends a JSON request and parses the JSON response; throws HttpError on non-2xx. */
export const requestJson = async <T>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> => {
  const response = await fetch(url, {
    method: init.method ?? "GET",
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

  if (!response.ok) {
    throw new HttpError(response.status, body);
  }
  return body as T;
};
