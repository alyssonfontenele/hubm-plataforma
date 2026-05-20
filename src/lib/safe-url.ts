/**
 * URL safety helpers for resource links.
 *
 * Only http(s) URLs are considered safe to render or store.
 * Protocols like javascript:, data:, vbscript:, file:, etc. are rejected.
 */

const HTTP_RE = /^https?:\/\//i;

export const URL_INVALID_MESSAGE =
  "URL inválida. Use apenas endereços que comecem com https://";

/** Returns true if the value is a non-empty http(s) URL. */
export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return HTTP_RE.test(url.trim());
}

/** Returns the URL when safe, otherwise "#" so anchors do not execute scripts. */
export function safeUrl(url: string | null | undefined): string {
  return isSafeUrl(url) ? url.trim() : "#";
}

/**
 * Validates a URL string for storage. Returns an error message when invalid,
 * or null when valid. Empty values are considered valid (caller decides if
 * the field is required).
 */
export function validateResourceUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  return isSafeUrl(url) ? null : URL_INVALID_MESSAGE;
}
