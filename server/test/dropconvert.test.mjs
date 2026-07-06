import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createRequire } from "module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const dom = new JSDOM("", { url: "http://localhost" });
const w = dom.window;
for (const k of ["DOMParser", "XMLSerializer", "NodeFilter", "File", "FileReader", "Blob"]) {
  globalThis[k] = w[k];
}
globalThis.marked = require("../../extension/lib/marked.min.js");
globalThis.mammoth = require("../../extension/lib/mammoth.browser.min.js");
globalThis.JSZip = require("../../extension/lib/jszip.min.js");

const { fileToArticle, isSupported } = await import("../../extension/src/dropconvert.js");
const { buildEpub } = await import("../../extension/src/epub.js");

test("isSupported: md/docx yes, others no", () => {
  assert.ok(isSupported({ name: "a.md" }));
  assert.ok(isSupported({ name: "b.docx" }));
  assert.ok(isSupported({ name: "c.markdown" }));
  assert.ok(!isSupported({ name: "d.pdf" }));
  assert.ok(!isSupported({ name: "e.html" }));
});

test("markdown (Arabic + inline English) → RTL article → valid EPUB", async () => {
  const md =
    "# عنوان المقال العربي\n\nهذه فقرة عربية فيها مصطلح transformer وكلمة token في وسطها لاختبار الاتجاه.\n\n- بند أول\n- بند ثان\n\n**نص عريض** وكود `inline`.";
  const file = new w.File([md], "note.md", { type: "text/markdown" });
  const art = await fileToArticle(file);
  assert.equal(art.ok, true);
  assert.equal(art.strategy, "markdown");
  assert.equal(art.title, "عنوان المقال العربي");
  assert.equal(art.dir, "rtl");
  assert.ok(/<li>/.test(art.content) && /<strong>/.test(art.content));
  const blob = await buildEpub(art);
  assert.ok(blob.size > 0);
});

test("docx → article with headings/bold/lists → valid EPUB", async () => {
  const buf = fs.readFileSync(new URL("./fixtures/sample.docx", import.meta.url));
  const file = new w.File([buf], "sample.docx");
  const art = await fileToArticle(file);
  assert.equal(art.ok, true);
  assert.equal(art.strategy, "docx");
  assert.ok(/Sample Document Title/.test(art.content));
  assert.ok(/<strong>Bold run<\/strong>/.test(art.content));
  assert.ok(/<li>Bullet one<\/li>/.test(art.content));
  assert.equal(art.dir, "ltr");
  const blob = await buildEpub(art);
  assert.ok(blob.size > 0);
});

test("unsupported file → clear error", async () => {
  const file = new w.File(["x"], "photo.png");
  await assert.rejects(() => fileToArticle(file), /غير مدعومة|صيغة/);
});
