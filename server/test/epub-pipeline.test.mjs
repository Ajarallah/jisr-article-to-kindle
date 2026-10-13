import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// Shim the browser globals epub.js relies on, then import it.
const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.JSZip = JSZip;
const { buildEpub, buildBook } = await import("../../extension/src/epub.js");

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

test("code indentation and tables survive with styling", async () => {
  const blob = await buildEpub({
    title: "Docs page",
    content:
      "<pre><code>function f() {\n    return 1;\n}</code></pre>" +
      "<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>",
    dir: "ltr",
    lang: "en",
    url: "https://example.com/docs",
  });
  const zip = await readZip(blob);
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  // Indentation (leading spaces + newline) preserved inside <pre>.
  assert.match(chapter, /return 1;/);
  assert.ok(/\n {4}return 1;/.test(chapter) || /function f\(\) \{\n {4}return/.test(chapter), "code indentation kept");
  assert.match(chapter, /<table[^>]*>[\s\S]*<td>1<\/td>/, "table structure kept");
  const css = await zip.file("OEBPS/styles/style.css").async("string");
  assert.match(css, /th, td \{ border/, "tables styled");
});

test("footnote refs and targets get epub:type (popup floor)", async () => {
  const blob = await buildEpub({
    title: "Article with notes",
    content:
      '<p>A claim.<sup><a href="#fn1">1</a></sup> More text <a href="#sec">see section</a>.</p>' +
      '<h2 id="sec">A Section</h2>' +
      '<ol><li id="fn1">The footnote body.</li></ol>',
    dir: "ltr",
    lang: "en",
    url: "https://example.com/notes",
  });
  const zip = await readZip(blob);
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.match(chapter, /epub:type="noteref"[^>]*href="#fn1"|href="#fn1"[^>]*epub:type="noteref"/, "ref marked noteref");
  assert.match(chapter, /<li id="fn1" epub:type="footnote"|epub:type="footnote"[^>]*id="fn1"/, "target marked footnote");
  // The section link (non-numeric) is NOT treated as a footnote.
  assert.doesNotMatch(chapter, /href="#sec" epub:type="noteref"/, "section link not a noteref");
});

test("cover generation: when canvas is available, EPUB carries a cover image + metadata", async () => {
  // Minimal OffscreenCanvas/createImageBitmap shims so generateCoverJpeg runs.
  const g = globalThis;
  g.createImageBitmap = async () => ({ width: 10, height: 10, close() {} });
  g.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      // The cover painter uses clipping, transforms and gradients; a shim that
      // omits any of them throws, and generateCoverJpeg's catch would swallow
      // it into a silently coverless book — which is what this test guards.
      return {
        fillRect() {}, drawImage() {}, fillText() {}, strokeRect() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
        fill() {}, stroke() {}, clip() {}, rect() {}, save() {}, restore() {},
        createLinearGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: String(t).length * 12 }; },
        set fillStyle(_v) {}, set strokeStyle(_v) {}, set font(_v) {},
        set direction(_v) {}, set textAlign(_v) {}, set textBaseline(_v) {},
        set lineWidth(_v) {}, set lineCap(_v) {}, set globalAlpha(_v) {},
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

test("buildBook: multiple articles → one multi-chapter EPUB with combined TOC", async () => {
  const blob = await buildBook([
    { title: "المقال الأول", content: "<p>محتوى عربي.</p><h2>قسم</h2>", dir: "rtl", lang: "ar", url: "https://a.example/1" },
    { title: "Second Article", content: "<p>English body.</p>", dir: "ltr", lang: "en", url: "https://b.example/2" },
  ]);
  const zip = await readZip(blob);
  assert.ok(zip.file("OEBPS/text/chapter0.xhtml"), "chapter 0 exists");
  assert.ok(zip.file("OEBPS/text/chapter1.xhtml"), "chapter 1 exists");
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /idref="chapter0"[\s\S]*idref="chapter1"/, "both chapters in spine, in order");
  assert.match(opf, /page-progression-direction="rtl"/, "book direction from first article");
  const nav = await zip.file("OEBPS/nav.xhtml").async("string");
  assert.match(nav, /chapter0\.xhtml/, "TOC links chapter 0");
  assert.match(nav, /chapter1\.xhtml/, "TOC links chapter 1");
  assert.match(nav, /المقال الأول/);
  assert.match(nav, /Second Article/);
  // Per-chapter direction is preserved.
  const ch1 = await zip.file("OEBPS/text/chapter1.xhtml").async("string");
  assert.match(ch1, /dir="ltr"/, "English chapter stays LTR");
});

test("language tag is simplified (en-US → en) and U+FFFD is stripped", async () => {
  const blob = await buildEpub({
    title: "Region tagged",
    content: "<p>Clean text� with a bad char.</p>",
    dir: "ltr",
    lang: "en-US",
    url: "https://example.com/x",
  });
  const zip = await readZip(blob);
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /<dc:language>en<\/dc:language>/, "region subtag dropped");
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.doesNotMatch(chapter, /�/, "replacement char stripped");
  assert.match(chapter, /Clean text with a bad char/, "surrounding text intact");
});

test("document customization: font-size, spacing, justify, margin, native font, no cover, clean-arabic", async () => {
  const blob = await buildEpub(
    {
      title: "مقال",
      content: "<p>نصّ عربيّ فيه تطويــــل مزخرف.</p>",
      dir: "rtl",
      lang: "ar",
      url: "https://example.com/ar",
    },
    { bookFont: "native", fontSize: "large", lineSpacing: "relaxed", margin: "wide", justify: true, includeCover: false, cleanArabic: true }
  );
  const zip = await readZip(blob);
  const css = await zip.file("OEBPS/styles/style.css").async("string");
  assert.match(css, /font-size: 1\.18em/, "large font-size");
  assert.match(css, /line-height: 2\.1/, "relaxed RTL line-height");
  assert.match(css, /padding: 1\.6em/, "wide margin");
  assert.match(css, /text-align: justify/, "justified");
  assert.doesNotMatch(css, /@font-face/, "native font → no embedded @font-face");
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.doesNotMatch(opf, /cover-image/, "cover off → no cover in manifest");
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.doesNotMatch(chapter, /ـ/, "tatweel removed");
  assert.match(chapter, /نصّ عربيّ/, "text otherwise intact");
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

// --- direction resolution ------------------------------------------------

test("resolveDir prefers an explicit dir, then the language tag, then the text", async () => {
  const { resolveDir } = await import("../../extension/src/epub.js");
  assert.equal(resolveDir({ dir: "rtl" }), "rtl");
  assert.equal(resolveDir({ dir: "ltr", lang: "ar" }), "ltr", "an explicit dir wins over the tag");
  assert.equal(resolveDir({ lang: "ar-SA" }), "rtl", "region subtags still resolve");
  assert.equal(resolveDir({ lang: "he" }), "rtl");
  assert.equal(resolveDir({ lang: "en" }), "ltr");
  // nothing declared: read the text
  assert.equal(resolveDir({ content: "<p>هذه فقرة عربية كاملة بلا أي وسم لغة.</p>" }), "rtl");
  assert.equal(resolveDir({ content: "<p>A plain English paragraph.</p>" }), "ltr");
  assert.equal(resolveDir({}), "ltr");
  assert.equal(resolveDir(null), "ltr");
  // markup must not be counted as content
  assert.equal(resolveDir({ content: '<div class="article-body"><p>عربي</p></div>' }), "rtl");
});

test("an Arabic article with no dir still builds a right-to-left book", async () => {
  const { buildEpub } = await import("../../extension/src/epub.js");
  const blob = await buildEpub(
    { title: "عنوان", lang: "ar", content: "<p>نصّ عربي.</p>" },
    { includeCover: false, bookFont: "native" }
  );
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /page-progression-direction="rtl"/);
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.match(chapter, /<body dir="rtl"/);
});

test("a mixed reading list takes the majority direction, not the first article's", async () => {
  const { buildBook } = await import("../../extension/src/epub.js");
  const arabic = (n) => ({ title: "مقال " + n, lang: "ar", dir: "rtl", content: "<p>نصّ.</p>" });
  const english = { title: "An English piece", lang: "en", dir: "ltr", content: "<p>Text.</p>" };
  const blob = await buildBook([english, arabic(1), arabic(2), arabic(3)], "قائمتي", { includeCover: false });
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const opf = await zip.file("OEBPS/content.opf").async("string");
  assert.match(opf, /page-progression-direction="rtl"/, "three Arabic articles outvote one English one");
});

test("notes and the table of contents carry DPUB-ARIA roles, not just epub:type", async () => {
  const { buildEpub } = await import("../../extension/src/epub.js");
  const blob = await buildEpub(
    {
      title: "حواشٍ",
      lang: "ar",
      dir: "rtl",
      content: '<p>نصّ<a href="#fn1" id="ref1">1</a></p><aside id="fn1"><p>الحاشية.</p></aside>',
    },
    { includeCover: false, bookFont: "native" }
  );
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const chapter = await zip.file("OEBPS/text/chapter.xhtml").async("string");
  assert.match(chapter, /role="doc-noteref"/, "the reference is announced as a note reference");
  assert.match(chapter, /role="doc-footnote"/, "the note itself is announced as a footnote");
  const nav = await zip.file("OEBPS/nav.xhtml").async("string");
  assert.match(nav, /role="doc-toc"/);
});
