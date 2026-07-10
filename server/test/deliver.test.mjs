import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// deliver.js parses the CSRF page with DOMParser in the browser; shim it here.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;

const { parseCsrf, sendEpubToKindle } = await import("../../extension/src/deliver.js");

// --- CSRF parsing --------------------------------------------------------

test("parseCsrf tolerates attribute order / quoting / spacing changes", () => {
  // Original byte-exact shape.
  assert.equal(parseCsrf(`<input name='csrfToken' value='ABC123' />`), "ABC123");
  // Double quotes, reordered attributes, extra attrs — the old regex would miss these.
  assert.equal(
    parseCsrf(`<input type="hidden" id="x" name="csrfToken" class="y" value="TOK-42">`),
    "TOK-42"
  );
  // Absent → null (caller treats as logged-out).
  assert.equal(parseCsrf(`<html><body>please sign in</body></html>`), null);
});

// --- send flow -----------------------------------------------------------

// Minimal fake blob: sendEpubToKindle only needs arrayBuffer()/byteLength.
function fakeBlob(byteLength) {
  return { arrayBuffer: async () => new ArrayBuffer(byteLength) };
}

// Route fetch by URL substring; record the call order.
function installRouter(routes) {
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    seen.push(url);
    for (const [needle, resp] of routes) {
      if (String(url).includes(needle)) return typeof resp === "function" ? resp(url, opts) : resp;
    }
    throw new Error("unrouted fetch: " + url);
  };
  return seen;
}
const jsonResp = (obj) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  async json() { return obj; },
  async text() { return JSON.stringify(obj); },
});
const csrfPage = () => ({
  ok: true,
  status: 200,
  headers: { get: () => "text/html" },
  async text() { return `<input name='csrfToken' value='CSRF-1' />`; },
});

test("sendEpubToKindle: happy path runs empty→init→S3 PUT→send-v2 in order", async () => {
  const seen = installRouter([
    ["/sendtokindle/empty", csrfPage],
    ["/sendtokindle/init", jsonResp({ uploadUrl: "https://s3.example/put", stkToken: "STK-9" })],
    ["s3.example/put", { ok: true, status: 200, headers: { get: () => "" }, async text() { return ""; } }],
    ["/sendtokindle/send-v2", jsonResp({ ok: true, delivered: true })],
  ]);
  const res = await sendEpubToKindle({ blob: fakeBlob(1024), title: "My Article", domain: "https://www.amazon.com" });
  assert.deepEqual(res, { ok: true, delivered: true });
  assert.ok(seen.some((u) => u.includes("/init")), "called /init");
  assert.ok(seen.some((u) => u.includes("s3.example/put")), "PUT to S3");
  assert.ok(seen.indexOf(seen.find((u) => u.includes("s3.example"))) < seen.lastIndexOf(seen.find((u) => u.includes("send-v2"))), "S3 PUT before send-v2");
});

test("sendEpubToKindle: rejects oversize file before any network call", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return jsonResp({}); };
  await assert.rejects(
    () => sendEpubToKindle({ blob: fakeBlob(51 * 1024 * 1024), title: "big" }),
    /كبير جدًّا|٥٠/
  );
  assert.equal(called, false, "no fetch on oversize");
});

test("sendEpubToKindle: logged-out /empty (no csrfToken) surfaces the sign-in message", async () => {
  installRouter([
    ["/sendtokindle/empty", { ok: true, status: 200, headers: { get: () => "text/html" }, async text() { return "<html>sign in</html>"; } }],
  ]);
  await assert.rejects(
    () => sendEpubToKindle({ blob: fakeBlob(1024), title: "x" }),
    /مسجّل|الدخول/
  );
});
