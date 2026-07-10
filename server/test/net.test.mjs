import { test } from "node:test";
import assert from "node:assert/strict";

const { fetchWithTimeout, isAbortError } = await import("../../extension/src/net.js");

test("fetchWithTimeout aborts a hung request and marks it an abort error", async () => {
  // A fetch that never resolves unless aborted.
  globalThis.fetch = (url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => reject(opts.signal.reason), { once: true });
    });
  let caught;
  try {
    await fetchWithTimeout("https://example.test", {}, 20);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "should reject");
  assert.equal(isAbortError(caught), true, "timeout is classified as an abort error");
});

test("fetchWithTimeout passes a fast response through untouched", async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  const resp = await fetchWithTimeout("https://example.test", {}, 1000);
  assert.equal(resp.ok, true);
});

test("isAbortError is false for ordinary errors", () => {
  assert.equal(isAbortError(new Error("boom")), false);
  assert.equal(isAbortError(null), false);
});
