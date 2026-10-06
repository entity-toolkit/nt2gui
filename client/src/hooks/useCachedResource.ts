import { useEffect, useState } from "react";
import { serverErrorMessage } from "../api/http";

/**
 * Memoizes `load` per key for the lifetime of the page (e.g. a loaded
 * simulation's metadata, which never changes). Failures are not cached, so a
 * later call retries.
 */
export const cachedLoader = <T>(load: (key: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    let request = cache.get(key);
    if (!request) {
      request = load(key);
      cache.set(key, request);
      request.catch(() => cache.delete(key));
    }
    return request;
  };
};

/**
 * `get(key)` as React state; `key = null` loads nothing. Never returns data
 * that belongs to a previous key.
 */
export const useCachedResource = <T>(
  key: string | null,
  get: (key: string) => Promise<T>,
) => {
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
  }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    get(key).then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error: unknown) =>
        !cancelled &&
        setState({ key, data: null, error: serverErrorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [get, key]);

  return state.key === key && key !== null
    ? { data: state.data, error: state.error }
    : { data: null, error: null };
};
