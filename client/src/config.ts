/**
 * Where the API is. By default it is relative ("api"), so it is reached on
 * whatever host, port and path prefix served the page (an SSH tunnel, a
 * Jupyter proxy; `npm run dev` proxies it to Flask). When the UI is served on
 * its own (`nt2gui client`), the server's URL is set in Settings — or by the
 * `?server=` link `nt2gui client` prints — and remembered by this browser.
 *
 * It is a per-browser connection setting, not part of the synced session:
 * the session lives on the server it would point to.
 */

const STORAGE_KEY = "nt2gui.serverUrl";
const QUERY_KEY = "server";

/**
 * A server URL as typed by the user, normalized: "" (this page's server), or
 * an http(s) origin with an optional path prefix, without a trailing slash.
 * Throws on anything else.
 */
export const normalizeServerUrl = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Not a valid URL: ${trimmed}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server URL must start with http:// or https://");
  }
  if (url.search || url.hash) {
    throw new Error("The server URL can't have a query (?…) or fragment (#…)");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

/** The API's base URL for a configured server URL. */
export const apiBaseFor = (serverUrl: string) =>
  serverUrl ? `${serverUrl}/api` : "api";

// Storage can be unavailable (private windows, blocked site data).
const readStored = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

/** The configured server URL ("" for this page's server). */
export const getServerUrl = (): string => readStored();

export const setServerUrl = (url: string): void => {
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted; the next load uses the default again.
  }
};

export const apiBase = () => apiBaseFor(getServerUrl());

/**
 * The server URL from a `?server=` link, and the address to show without it.
 * Returns null if the link has none (or an invalid one).
 */
export const serverFromLink = (
  href: string,
): { server: string; cleanHref: string } | null => {
  const url = new URL(href);
  const raw = url.searchParams.get(QUERY_KEY);
  if (raw === null) return null;
  url.searchParams.delete(QUERY_KEY);
  try {
    return { server: normalizeServerUrl(raw), cleanHref: url.toString() };
  } catch {
    return null;
  }
};

/** Adopt a `?server=` link's server, and drop it from the address bar. */
export const adoptServerFromLink = () => {
  const adopted = serverFromLink(window.location.href);
  if (!adopted) return;
  setServerUrl(adopted.server);
  window.history.replaceState(null, "", adopted.cleanHref);
};
