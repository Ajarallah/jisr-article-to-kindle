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

test("Arabic EPUB quality: RTL heading CSS, LTR code, lowercase lang, dc:date, TOC, valid XHTML", async () => {
  const blob = await buildEpub({
    title: "مقال عن الشيفرة",
    content:
      '<h2 id="intro">مقدّمة</h2>' +
      "<p>فقرة عربية فيها مصطلح token ورمز.</p>" +
      "<h2>القسم الثاني</h2>" +
      "<pre><code>const x = (a + b);</code></pre>" +
      '<p>انظر <a href="#intro">المقدّمة</a>.</p>',
    dir: "rtl",
    lang: "AR", // uppercase on purpose — must be normalized
    url: "https://example.com/ar-code",
    byline: "الكاتب",
  });
  const zip = await readZip(blob);

  const css = await zip.file("OEBPS/styles/style.css").async("string");
  assert.match(css, /h1, h2, h3 \{ direction: rtl/, "headings re-declare RTL");
  assert.match(css, /letter-spacing: normal/, "no letter-spacing that would break joining");
  assert.match(css, /pre, code, samp, kbd \{ direction: ltr/, "code isolated LTR");

  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /<dc:language>ar<\/dc:language>/, "lang lowercased");
  assert.match(opf, /<dc:date>/, "date metadata present");

  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.match(chapter, /<pre dir="ltr"|<code dir="ltr"/, "code marked dir=ltr");
  assert.match(chapter, /id="intro"/, "anchor id preserved");
  // Chapter must be well-formed XML (malformed XHTML makes Amazon drop the font).
  const parsed = new dom.window.DOMParser().parseFromString(chapter, "application/xml");
  assert.equal(parsed.getElementsByTagName("parsererror").length, 0, "chapter is well-formed XML");

  const nav = await zip.file("OEBPS/nav.xhtml").async("string");
  assert.match(nav, /chapter\.xhtml#intro/, "TOC links the id'd heading");
  assert.match(nav, /chapter\.xhtml#sec-/, "TOC links the auto-id'd heading");
});

test("cover generation: when canvas is available, EPUB carries a cover image + metadata", async () => {
  // Minimal OffscreenCanvas/createImageBitmap shims so generateCoverJpeg runs.
  const g = globalThis;
  g.createImageBitmap = async () => ({ width: 10, height: 10, close() {} });
  g.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      return {
        fillRect() {}, drawImage() {}, fillText() {},
        measureText(t) { return { width: String(t).length * 12 }; },
        set fillStyle(_v) {}, set font(_v) {}, set direction(_v) {}, set textAlign(_v) {},
      };
    }
    async convertToBlob() { return new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }); }
  };
  try {
    const blob = await buildEpub({
      title: "Covered Article",
      content: "<p>Body.</p>",
      dir: "ltr",
      lang: "en",
      url: "https://news.example.com/x",
      siteName: "Example News",
    });
    const zip = await readZip(blob);
    assert.ok(zip.file("OEBPS/images/cover.jpg"), "cover image written");
    const opf = await zip.file("OEBPS/content.opf").async("string");
    assert.match(opf, /properties="cover-image"/, "cover-image manifest property");
    assert.match(opf, /<meta name="cover" content="cover-img"\/>/, "EPUB2 cover meta");
  } finally {
    delete g.OffscreenCanvas;
    delete g.createImageBitmap;
  }
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
