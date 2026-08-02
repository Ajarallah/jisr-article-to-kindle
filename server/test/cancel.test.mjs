import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.NodeFilter = dom.window.NodeFilter;

const { translateHtml } = await import("../../extension/src/translate.js");
const CFG = { apiKey: "k", model: "A", fallbackModel: "B", endpoint: "https://example.test/v1" };

/*
 * Cancellation is the half of Nielsen's >10s rule that was missing: the popup
 * now builds an AbortController and hands its signal down. These pin the
 * contract translate.js must honour for that button to mean anything.
 */

test("an already-aborted signal stops the run before any request goes out", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("should not be reached"); };
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    () => translateHtml({ title: "T", html: "<p>Some text here.</p>", targetLang: "Arabic" }, CFG, { signal: ctrl.signal })
  );
  assert.equal(calls, 0, "no network call after abort");
});

test("aborting mid-flight rejects and does not retry", async () => {
  const ctrl = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    ctrl.abort(); // the user hits cancel while this request is open
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  await assert.rejects(
    () => translateHtml({ title: "T", html: "<p>Some text here.</p>", targetLang: "Arabic" }, CFG, { signal: ctrl.signal }),
    (e) => e.name === "AbortError" || /Abort/i.test(e.message)
  );
  // An abort is the user's decision — it must not burn the retry/fallback budget.
  assert.equal(calls, 1, "abort stops immediately instead of retrying");
});
