import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// Shim the browser globals epub.js relies on, then import it.
const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.JSZip = JSZip;
const { buildEpub } = await import("../../extension/src/epub.js");

async function readZip(blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  return JSZip.loadAsync(buf);
}

test("real article -> valid EPUB3 (Arabic RTL)", async () => {
  const article = {
    title: "عنوان تجريبي عربي",
    content:
      '<p>الفقرة الأولى فيها نصّ عربي واضح.</p>' +
      '<h2>عنوان فرعي</h2>' +
      '<p>الفقرة الثانية مع <a href="https://example.com">رابط</a> بداخلها.</p>',
    dir: "rtl",
    lang: "ar",
    url: "https://example.com/article",
    byline: "الكاتب",
    siteName: "الموقع",
  };

  const blob = await buildEpub(article);
  assert.ok(blob && blob.size > 0, "produces a non-empty blob");

  const zip = await readZip(blob);

  // mimetype must exist and be exact.
  const mimetype = await zip.file("mimetype").async("string");
  assert.equal(mimetype, "application/epub+zip");

  // container points at the OPF.
  const container = await zip.file("META-INF/container.xml").async("string");
  assert.match(container, /OEBPS\/content\.opf/);

  // OPF has EPUB3 version + RTL page progression + Arabic language.
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /version="3\.0"/);
  assert.match(opf, /page-progression-direction="rtl"/);
  assert.match(opf, /<dc:language>ar<\/dc:language>/);
  assert.match(opf, /properties="nav"/);

  // Chapter carries the title, RTL direction, and the body content.
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.match(chapter, /dir="rtl"/);
  assert.match(chapter, /عنوان تجريبي عربي/);
  assert.match(chapter, /الفقرة الأولى/);
  assert.match(chapter, /عنوان فرعي/);
  // The link is preserved, but unsafe attributes (class/style/id) are stripped.
  assert.match(chapter, /<a href="https:\/\/example\.com"/);

  // Nav (EPUB3) and legacy ncx both present.
  assert.ok(zip.file("OEBPS/nav.xhtml"), "nav.xhtml exists");
  assert.ok(zip.file("OEBPS/toc.ncx"), "toc.ncx exists");
});

test("images are stripped by default (text-only, no fetch, no opt-in)", async () => {
  const blob = await buildEpub({
    title: "With an image",
    content: '<p>Before.</p><img src="https://example.com/pic.png" alt="x"/><p>After.</p>',
    dir: "ltr",
    lang: "en",
    url: "https://example.com/a",
  });
  const zip = await readZip(blob);
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.doesNotMatch(chapter, /<img/, "no img element survives");
  assert.match(chapter, /Before\./);
  assert.match(chapter, /After\./);
  // No image parts were added to the package.
  assert.equal(Object.keys(zip.files).some((p) => p.startsWith("OEBPS/images/")), false);
});

test("LTR article -> no RTL markers", async () => {
  const blob = await buildEpub({
    title: "A Test Title",
    content: "<p>First paragraph.</p><p>Second paragraph.</p>",
    dir: "ltr",
    lang: "en",
    url: "https://example.com/en",
  });
  const zip = await readZip(blob);
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.doesNotMatch(opf, /page-progression-direction="rtl"/);
  assert.match(opf, /<dc:language>en<\/dc:language>/);
});
