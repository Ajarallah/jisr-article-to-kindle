import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// deliver.js parses the CSRF page with DOMParser in the browser; shim it here.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;

const { parseCsrf, sendEpubToKindle, isAmazonUploadUrl } = await import("../../extension/src/deliver.js");

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
    ["/sendtokindle/init", jsonResp({ uploadUrl: "https://stk-uploads.s3.amazonaws.com/put", stkToken: "STK-9" })],
    ["s3.amazonaws.com/put", { ok: true, status: 200, headers: { get: () => "" }, async text() { return ""; } }],
    ["/sendtokindle/send-v2", jsonResp({ ok: true, delivered: true })],
  ]);
  const res = await sendEpubToKindle({ blob: fakeBlob(1024), title: "My Article", domain: "https://www.amazon.com" });
  assert.deepEqual(res, { ok: true, delivered: true });
  assert.ok(seen.some((u) => u.includes("/init")), "called /init");
  assert.ok(seen.some((u) => u.includes("s3.amazonaws.com/put")), "PUT to S3");
  assert.ok(seen.indexOf(seen.find((u) => u.includes("s3.amazonaws.com"))) < seen.lastIndexOf(seen.find((u) => u.includes("send-v2"))), "S3 PUT before send-v2");
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

// --- endpoint pinning ----------------------------------------------------

test("isAmazonUploadUrl accepts Amazon's own hosts and nothing else", () => {
  assert.ok(isAmazonUploadUrl("https://stk-uploads.s3.amazonaws.com/abc?X-Amz-Signature=x"));
  assert.ok(isAmazonUploadUrl("https://www.amazon.com/upload"));
  assert.equal(isAmazonUploadUrl("https://evil.example/put"), false);
  // look-alikes that a naive substring check would let through
  assert.equal(isAmazonUploadUrl("https://amazonaws.com.evil.test/put"), false);
  assert.equal(isAmazonUploadUrl("https://notamazon.com/put"), false);
  assert.equal(isAmazonUploadUrl("http://s3.amazonaws.com/put"), false, "plaintext http is not acceptable");
  assert.equal(isAmazonUploadUrl("not a url"), false);
});

test("an /init reply pointing somewhere other than Amazon never gets the file", async () => {
  const seen = installRouter([
    ["/sendtokindle/empty", csrfPage],
    ["/sendtokindle/init", jsonResp({ uploadUrl: "https://exfil.example/put", stkToken: "STK-9" })],
    ["exfil.example", { ok: true, status: 200, headers: { get: () => "" }, async text() { return ""; } }],
  ]);
  await assert.rejects(
    () => sendEpubToKindle({ blob: fakeBlob(1024), title: "x", domain: "https://www.amazon.com" }),
    /غير معروف/
  );
  assert.equal(seen.some((u) => String(u).includes("exfil.example")), false, "the document was never uploaded");
});

test("a domain outside the known marketplaces falls back to amazon.com", async () => {
  const seen = installRouter([
    ["/sendtokindle/empty", csrfPage],
    ["/sendtokindle/init", jsonResp({ uploadUrl: "https://stk.s3.amazonaws.com/put", stkToken: "S" })],
    ["s3.amazonaws.com/put", { ok: true, status: 200, headers: { get: () => "" }, async text() { return ""; } }],
    ["/sendtokindle/send-v2", jsonResp({ ok: true })],
  ]);
  await sendEpubToKindle({ blob: fakeBlob(64), title: "x", domain: "https://amaz0n-sa.example" });
  assert.equal(seen.some((u) => String(u).includes("amaz0n-sa.example")), false, "never contacted the typo domain");
  assert.ok(seen.every((u) => !String(u).includes("/sendtokindle") || String(u).startsWith("https://www.amazon.com/")));
});
