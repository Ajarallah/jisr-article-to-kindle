/*
 * Network helpers shared across the extension.
 *
 * Every fetch in the product (Amazon delivery, S3 upload, translation, image
 * embedding, auth checks) must be bounded: without a timeout a hung connection
 * (captive portal, stalled S3, unresponsive model) leaves the UI spinning
 * forever with no way out. fetchWithTimeout aborts after `ms` and also honors an
 * optional caller-supplied AbortSignal so a user "cancel" can tear the request
 * down early.
 */

export const DEFAULT_TIMEOUT_MS = 30000;

// True when the error is an abort (our timeout or a caller cancel), not a real
// network/HTTP error — lets callers phrase a clear "timed out / cancelled" message.
export function isAbortError(e) {
  return !!e && (e.name === "AbortError" || e.name === "TimeoutError");
}

export async function fetchWithTimeout(url, options = {}, ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), ms);
  const external = options.signal;
  if (external) {
    if (external.aborted) ctrl.abort(external.reason);
    else external.addEventListener("abort", () => ctrl.abort(external.reason), { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
