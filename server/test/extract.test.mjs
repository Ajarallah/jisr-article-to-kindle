import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createRequire } from "module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const Readability = require("../../extension/lib/Readability.js");
const SRC = fs.readFileSync(new URL("../../extension/src/extract.js", import.meta.url), "utf8")
  .trim()
  .replace(/;+\s*$/, "");

function extract(html, url) {
  const dom = new JSDOM(html, { url });
  const w = dom.window;
  const f = new Function("document", "location", "Readability", "navigator", "return (" + SRC + ")");
  return f(w.document, w.location, Readability, w.navigator);
}

const para = (n) =>
  `<p>Section paragraph ${n}. ` +
  "This is a substantial sentence about the topic with enough length to be scored as real content by the extractor and not discarded as boilerplate. ".repeat(2) +
  "</p>";

// Reproduces the AWS/AEM pattern: content split across sibling containers under
// <main>. Readability grabs one section; our main-region fallback grabs them all.
test("multi-container page (AEM-style) → captures ALL sections", () => {
  const sections = [];
  for (let i = 1; i <= 6; i++) {
    sections.push(
      `<div class="cmp-container"><h2>Heading ${i}</h2>${para(i * 2 - 1)}${para(i * 2)}</div>`
    );
  }
  const html = `<html lang="en"><body>
    <nav class="global-nav"><a>Home</a><a>Docs</a></nav>
    <main id="main-container-x"><div class="aem-Grid">${sections.join("")}</div></main>
    <footer class="site-footer">© 2026 · privacy · terms · cookie settings</footer>
  </body></html>`;

  // The regression guard is COMPLETENESS: every section's paragraphs survive,
  // and page chrome does not leak. (Whether Readability or the main-region
  // fallback achieves it is an implementation detail; the main-region path
  // itself is verified against the live AWS page — 60 paragraphs — in docs/06.)
  const r = extract(html, "https://example.com/what-is/thing");
  assert.equal(r.ok, true);
  assert.ok(["readability", "main-region"].includes(r.strategy));
  const pCount = (r.content.match(/<p[ >]/g) || []).length;
  assert.equal(pCount, 12, "captures all 12 paragraphs across 6 sections");
  assert.ok(!/privacy · terms|cookie settings/.test(r.content), "footer not leaked");
  assert.ok(!/global-nav|>Home</.test(r.content), "nav not leaked");
});

// A normal single-article page must still use Readability (no regression).
test("single-article blog → uses Readability, no chrome leak", () => {
  const paras = Array.from({ length: 8 }, (_, i) => para(i + 1)).join("");
  const html = `<html lang="en"><body>
    <nav class="navbar"><a>Home</a></nav>
    <article><h1>The Case for Slow Software</h1>${paras}</article>
    <footer class="footer">© 2026 · privacy · terms</footer>
  </body></html>`;
  const r = extract(html, "https://example.com/slow-software");
  assert.equal(r.ok, true);
  assert.equal(r.strategy, "readability");
  assert.ok(r.title.includes("Slow Software"));
  assert.ok(!/privacy · terms/.test(r.content), "footer not leaked");
});

// Mostly-Arabic prose with inline English technical terms → still RTL.
test("mostly-Arabic with inline English terms → rtl", () => {
  const p =
    "<p>يستخدم النموذج آليّة الانتباه attention لمعالجة الرموز tokens بكفاءة عالية في هذا السياق التقني المعقد.</p>";
  const html = `<html><body><article><h1>عنوان المقال التقني</h1>${p.repeat(6)}</article></body></html>`;
  const r = extract(html, "https://example.com/ar-tech");
  assert.equal(r.dir, "rtl");
});

// Mostly-English prose with a stray Arabic word → LTR.
test("mostly-English with a few Arabic words → ltr", () => {
  const p =
    "<p>The transformer architecture reshaped NLP. The Arabic word ذكاء appears once, yet the prose is English throughout this whole paragraph and section.</p>";
  const html = `<html><body><article><h1>Understanding Transformers</h1>${p.repeat(6)}</article></body></html>`;
  const r = extract(html, "https://example.com/en-tech");
  assert.equal(r.dir, "ltr");
});

// Arabic page → detected as RTL.
test("Arabic content → dir rtl", () => {
  const paras = Array.from(
    { length: 6 },
    () => "<p>هذا نص عربي طويل بما يكفي ليُحسب محتوى حقيقيا في عملية الاستخلاص ولا يُهمل باعتباره حشوا جانبيا في الصفحة.</p>"
  ).join("");
  const html = `<html lang="ar" dir="rtl"><body><article><h1>عنوان المقال</h1>${paras}</article></body></html>`;
  const r = extract(html, "https://example.com/ar");
  assert.equal(r.ok, true);
  assert.equal(r.dir, "rtl");
});
