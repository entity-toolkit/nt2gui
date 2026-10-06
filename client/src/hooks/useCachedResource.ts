import { useEffect, useState } from "react";
import { serverErrorMessage } from "../api/http";

// Every loader's cache, so entries can be dropped when their data changes.
const caches = new Set<Map<string, Promise<unknown>>>();

/** Drops cached results whose key `matches` from every loader. */
export const forgetCached = (matches: (key: string) => boolean) => {
  for (const cache of caches) {
    for (const key of [...cache.keys()]) if (matches(key)) cache.delete(key);
  }
};

/**
 * Memoizes `load` per key for the lifetime of the page (e.g. a loaded
 * simulation's metadata, which only changes when it is reloaded; see
 * `forgetCached`). Failures are not cached, so a later call retries.
 */
export const cachedLoader = <T>(load: (key: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  caches.add(cache as Map<string, Promise<unknown>>);
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
 * that belongs to a previous key. A new `version` (after `forgetCached`)
 * loads again, showing the previous data until the new one arrives.
 */
export const useCachedResource = <T>(
  key: string | null,
  get: (key: string) => Promise<T>,
  version = 0,
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
  }, [get, key, version]);

  return state.key === key && key !== null
    ? { data: state.data, error: state.error }
    : { data: null, error: null };
};
