import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Shim the browser globals translate.js relies on, BEFORE importing it.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.NodeFilter = dom.window.NodeFilter;

const { translateHtml } = await import("../../extension/src/translate.js");

// --- fetch mock helpers -------------------------------------------------
// Each handler receives (url, opts) and returns a fake Response.
function ok(arr) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    async json() {
      return { choices: [{ message: { content: JSON.stringify(arr) } }] };
    },
    async text() {
      return "";
    },
  };
}
function err(status, body = "") {
  return {
    ok: false,
    status,
    headers: { get: () => "text/plain" },
    async text() {
      return body;
    },
    async json() {
      return {};
    },
  };
}
// Parse the segment array the code sent, so we can echo the right length.
function sentSegments(opts) {
  const body = JSON.parse(opts.body);
  return JSON.parse(body.messages[1].content);
}
function sentModel(opts) {
  return JSON.parse(opts.body).model;
}
// Install a fetch that runs `handler` and counts calls.
function installFetch(handler) {
  const calls = { n: 0 };
  globalThis.fetch = async (url, opts) => {
    calls.n++;
    return handler(url, opts, calls.n);
  };
  return calls;
}

const CFG = { apiKey: "test-key", model: "A", fallbackModel: "B" };
const HTML = "<p>Hello world.</p><p>Second paragraph here.</p>";

test("happy path: replaces text nodes, preserves tags, sets ar/rtl", async () => {
  installFetch((url, opts) => ok(sentSegments(opts).map((s) => "AR:" + s)));
  const out = await translateHtml({ title: "Title", html: HTML, targetLang: "Arabic" }, CFG);
  assert.equal(out.lang, "ar");
  assert.equal(out.dir, "rtl");
  assert.match(out.title, /^AR:/);
  // structure preserved: still two <p> elements
  assert.equal((out.html.match(/<p>/g) || []).length, 2);
  // text replaced
  assert.match(out.html, /AR:Hello world\./);
  assert.match(out.html, /AR:Second paragraph here\./);
});

test("missing apiKey throws the settings message", async () => {
  await assert.rejects(
    () => translateHtml({ title: "t", html: HTML, targetLang: "Arabic" }, { apiKey: "" }),
    /مفتاح/
  );
});

test("json fences in the model output are tolerated", async () => {
  installFetch((url, opts) => {
    const arr = sentSegments(opts).map((s) => "X:" + s);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      async json() {
        return { choices: [{ message: { content: "```json\n" + JSON.stringify(arr) + "\n```" } }] };
      },
      async text() { return ""; },
    };
  });
  const out = await translateHtml({ title: "t", html: HTML, targetLang: "Arabic" }, CFG);
  assert.match(out.html, /X:Hello world\./);
});

test("retries a transient 503 on the same model, then succeeds", async () => {
  const calls = installFetch((url, opts, n) =>
    n === 1 ? err(503, "ResourceExhausted") : ok(sentSegments(opts).map((s) => "R:" + s))
  );
  const out = await translateHtml({ title: "t", html: HTML, targetLang: "Arabic" }, CFG);
  assert.ok(calls.n >= 2, "should have retried at least once");
  assert.match(out.html, /R:Hello world\./);
});

test("hard 400 on model A falls back to model B", async () => {
  const seenModels = new Set();
  installFetch((url, opts) => {
    const m = sentModel(opts);
    seenModels.add(m);
    if (m === "A") return err(400, "bad request");
    return ok(sentSegments(opts).map((s) => "B:" + s));
  });
  const out = await translateHtml({ title: "t", html: HTML, targetLang: "Arabic" }, CFG);
  assert.ok(seenModels.has("A") && seenModels.has("B"), "both models attempted");
  assert.match(out.html, /B:Hello world\./);
});

test("persistent length mismatch throws after retries+fallback", async () => {
  installFetch((url, opts) => ok(["only-one-item"])); // wrong length on purpose
  await assert.rejects(
    () => translateHtml({ title: "t", html: HTML, targetLang: "Arabic" }, CFG),
    /فشلت الترجمة/
  );
});
