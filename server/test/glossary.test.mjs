import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.NodeFilter = dom.window.NodeFilter;

const { annotateHtml } = await import("../../extension/src/glossary.js");

function mockGlossary(pairs) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    async json() {
      return { choices: [{ message: { content: JSON.stringify(pairs) } }] };
    },
    async text() { return ""; },
  });
}

test("annotateHtml injects popup-footnote glossary for found terms", async () => {
  mockGlossary([
    { term: "transformer", gloss: "محوّل" },
    { term: "attention", gloss: "الانتباه" },
    { term: "notpresentword", gloss: "غير موجود" },
  ]);
  const html = "<p>The transformer uses an attention mechanism.</p>";
  const out = await annotateHtml(html, { apiKey: "k" }, { targetLang: "Arabic" });

  // Noteref anchors with epub:type, pointing at the glossary asides.
  assert.match(out, /epub:type="noteref"[^>]*href="#a2k-gloss-1"|href="#a2k-gloss-1"[^>]*epub:type="noteref"/);
  // Footnote asides carry the glosses.
  assert.match(out, /<aside[^>]*epub:type="footnote"[^>]*id="a2k-gloss-1"|id="a2k-gloss-1"[^>]*epub:type="footnote"/);
  assert.match(out, /محوّل/);
  assert.match(out, /الانتباه/);
  // Glossary section header (RTL target → Arabic label).
  assert.match(out, /مسرد المصطلحات/);
  // Only the two present terms get notes (the absent one is skipped).
  assert.equal((out.match(/epub:type="noteref"/g) || []).length, 2);
  // Original text preserved (the noteref <sup> splits the run, so check words).
  assert.match(out, /The transformer/);
  assert.match(out, /mechanism\./);
});

test("annotateHtml returns original html when no terms are found", async () => {
  mockGlossary([{ term: "absent", gloss: "x" }]);
  const html = "<p>Nothing to gloss here at all.</p>";
  const out = await annotateHtml(html, { apiKey: "k" }, { targetLang: "Arabic" });
  assert.doesNotMatch(out, /noteref/);
  assert.match(out, /Nothing to gloss/);
});

test("annotateHtml requires an API key", async () => {
  await assert.rejects(() => annotateHtml("<p>x</p>", { apiKey: "" }, {}), /مفتاح/);
});
