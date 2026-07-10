/*
 * Build a clean EPUB3 file (as a Blob) from an extracted article.
 * Depends on the global JSZip (loaded via lib/jszip.min.js).
 *
 * Design notes:
 *  - EPUB3 with a nav.xhtml + a legacy toc.ncx for older Kindle firmware.
 *  - RTL articles get page-progression-direction="rtl" and dir="rtl" so
 *    Arabic renders correctly on Kindle.
 *  - Images are embedded only when the caller passes { embedImages: true },
 *    which the options page gates behind an explicit opt-in that requests the
 *    optional all-sites host permission (see settings.js / options.js). When
 *    off (the default) images are stripped and the EPUB is text-only. Even when
 *    on, an image that fails to fetch is dropped rather than left as a dead
 *    remote link.
 */

import { fetchWithTimeout } from "./net.js";

// Embedding guards: keep opt-in image embedding from blowing past the 50 MB
// Send-to-Kindle limit or exhausting memory on a gallery page.
const MAX_IMAGES = 40;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
const IMAGE_MAX_DIM = 1600;

function canUseCanvas() {
  return typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

function uuidv4() {
  // Not cryptographically important — just a stable book id.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extFromMime(mime) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return map[mime] || "img";
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/*
 * Downscale/re-encode a raster image so EPUBs stay small and dark-mode safe
 * (Amazon recompresses anyway; transparent PNGs misbehave on dark backgrounds).
 * Flattens transparency onto white and outputs JPEG. Returns the original blob
 * untouched for vector/animated formats or when canvas isn't available (tests).
 */
async function processImageBlob(blob, mime) {
  if (mime === "image/svg+xml" || mime === "image/gif" || !canUseCanvas()) {
    return { blob, mime };
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && mime === "image/jpeg" && blob.size <= MAX_IMAGE_BYTES) {
      if (bitmap.close) bitmap.close();
      return { blob, mime };
    }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
    if (scale < 1 || out.size < blob.size) return { blob: out, mime: "image/jpeg" };
    return { blob, mime };
  } catch (e) {
    return { blob, mime };
  }
}

/*
 * Turn the Readability HTML string into well-formed XHTML body content,
 * embedding images into the zip. Returns { xhtml, images:[{path,base64,mime}] }.
 */
async function normalizeContent(htmlString, baseUrl, embedImages, imgPrefix = "") {
  const doc = new DOMParser().parseFromString(htmlString, "text/html");
  const images = [];
  let imgIndex = 0;

  const imgEls = Array.from(doc.querySelectorAll("img"));
  // Text-only unless the user opted in (and granted the host permission).
  if (!embedImages) {
    imgEls.forEach((img) => img.remove());
  }
  let totalBytes = 0;
  for (const img of embedImages ? imgEls : []) {
    let src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (!src || images.length >= MAX_IMAGES) {
      img.remove();
      continue;
    }
    try {
      const absUrl = new URL(src, baseUrl).href;
      const resp = await fetchWithTimeout(absUrl, {});
      if (!resp.ok) throw new Error("bad status " + resp.status);
      let blob = await resp.blob();
      let mime = blob.type || "image/jpeg";
      if (!mime.startsWith("image/")) throw new Error("not an image");
      ({ blob, mime } = await processImageBlob(blob, mime));
      // Skip images that are still too big, or that would push the book over the
      // total budget — an oversize EPUB fails opaquely at Amazon's upload stage.
      if (blob.size > MAX_IMAGE_BYTES || totalBytes + blob.size > MAX_TOTAL_IMAGE_BYTES) {
        img.remove();
        continue;
      }
      totalBytes += blob.size;
      const ext = extFromMime(mime);
      const path = `images/${imgPrefix}img${imgIndex++}.${ext}`;
      const base64 = await blobToBase64(blob);
      images.push({ path, base64, mime });
      img.setAttribute("src", `../${path}`);
      img.removeAttribute("data-src");
      img.removeAttribute("srcset");
      // Ensure alt exists for valid XHTML/accessibility.
      if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
    } catch (e) {
      img.remove();
    }
  }

  // Strip attributes that break XHTML or are unsafe on e-readers. Keep `id`:
  // intra-document anchors (footnotes/endnotes, section links) need their
  // targets, and the TOC below links to heading ids.
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on") || n === "style" || n === "class") {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Code is left-to-right regardless of document direction. Marking it dir="ltr"
  // stops the bidi algorithm from flipping punctuation/brackets when code or
  // inline English sits inside Arabic prose — a real corruption source.
  doc.querySelectorAll("pre, code, samp, kbd").forEach((el) => el.setAttribute("dir", "ltr"));

  // Collect headings for a navigable TOC; give each a stable id to link to.
  const headings = [];
  let hIndex = 0;
  doc.querySelectorAll("h1, h2, h3").forEach((h) => {
    const text = (h.textContent || "").trim();
    if (!text) return;
    let id = h.getAttribute("id");
    if (!id) {
      id = "sec-" + hIndex;
      h.setAttribute("id", id);
    }
    hIndex += 1;
    headings.push({ id, level: Number(h.tagName[1]) || 2, text });
  });

  // Mark footnote references + their targets with epub:type so readers that
  // support it show a popup; the anchor still works as plain navigation on the
  // rest. Conservative: only numeric/superscript refs pointing at an existing id.
  Array.from(doc.querySelectorAll('a[href^="#"]')).forEach((a) => {
    const href = a.getAttribute("href") || "";
    const targetId = decodeURIComponent(href.slice(1));
    if (!targetId) return;
    const target = doc.getElementById(targetId);
    if (!target) return;
    const label = (a.textContent || "").trim();
    const looksLikeNote = /^\[?\d{1,3}\]?$/.test(label) || !!a.closest("sup");
    if (!looksLikeNote) return;
    a.setAttribute("epub:type", "noteref");
    if (/^(li|p|div|aside)$/.test(target.tagName.toLowerCase())) {
      target.setAttribute("epub:type", "footnote");
    }
  });

  // Serialize body as XHTML.
  const serializer = new XMLSerializer();
  let xhtml = "";
  const bodyChildren = doc.body ? Array.from(doc.body.childNodes) : [];
  for (const node of bodyChildren) {
    xhtml += serializer.serializeToString(node);
  }
  // XMLSerializer already produces XML-namespaced, self-closed tags.
  return { xhtml, images, headings };
}

function buildCss(isRtl, hasArabicFont) {
  // Belt-and-suspenders RTL: even though dir="rtl" is on the elements, some
  // Kindle firmware needs the CSS direction too.
  const fontFace =
    isRtl && hasArabicFont
      ? `@font-face {
  font-family: "A2K Arabic";
  src: url("../fonts/Amiri-Regular.ttf");
  font-weight: normal; font-style: normal;
}
`
      : "";
  const bodyFont =
    isRtl && hasArabicFont
      ? `"A2K Arabic", "Noto Naskh Arabic", serif`
      : "serif";
  // Arabic needs more leading (ascenders + optional marks stack tall) and must
  // re-declare direction on headings — some readers revert them to LTR when they
  // only inherit it. Never set letter-spacing on Arabic: it breaks letter joining.
  const lineHeight = isRtl ? "1.85" : "1.7";
  const rtlRules = isRtl
    ? `body { direction: rtl; text-align: right; }
h1, h2, h3 { direction: rtl; text-align: right; }
`
    : "";
  return `${fontFace}html, body { margin: 0; padding: 0; }
body { font-family: ${bodyFont}; line-height: ${lineHeight}; padding: 1em; letter-spacing: normal; }
${rtlRules}h1, h2, h3 { line-height: 1.35; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #555; }
blockquote { margin: 1em; padding-inline-start: 1em; border-inline-start: 3px solid #ccc; }
pre, code, samp, kbd { direction: ltr; unicode-bidi: isolate; }
pre { white-space: pre-wrap; word-wrap: break-word; text-align: left; background: #f6f7f8; padding: 0.6em 0.8em; }
code { font-size: 0.95em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95em; }
th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: start; vertical-align: top; }
th { background: #f2f3f5; }
a { color: inherit; text-decoration: underline; }
.a2k-meta { color: #666; font-size: 0.9em; margin-bottom: 1.5em; }
`;
}

/*
 * Fetch the bundled Arabic font from the extension package. Returns base64 or
 * null if unavailable (e.g. running outside the extension in a test harness).
 */
async function loadArabicFontBase64() {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      return null;
    }
    const url = chrome.runtime.getURL("lib/Amiri-Regular.ttf");
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await blobToBase64(blob);
  } catch (e) {
    return null;
  }
}

// Greedy word-wrap against the canvas' current font. Returns lines.
function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(t).width > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/*
 * Generate a simple typographic cover (brand blue, RTL-aware) so the Kindle
 * library shows a real thumbnail with the title + source instead of a generic
 * placeholder. Returns { base64, mime } or null when canvas isn't available
 * (test harness / older environments) — in which case the book ships coverless.
 */
async function generateCoverJpeg(article, isRtl) {
  if (!canUseCanvas()) return null;
  try {
    const W = 1600;
    const H = 2400;
    const margin = 150;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3644ED";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#AEF769";
    ctx.fillRect(0, H - 170, W, 26);

    const family = isRtl ? '"Noto Naskh Arabic", "Amiri", serif' : "Georgia, serif";
    ctx.direction = isRtl ? "rtl" : "ltr";
    ctx.textAlign = isRtl ? "right" : "left";
    const x = isRtl ? W - margin : margin;

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 100px ${family}`;
    const lines = wrapText(ctx, article.title || "بدون عنوان", W - margin * 2).slice(0, 8);
    let y = 560;
    for (const ln of lines) {
      ctx.fillText(ln, x, y);
      y += 140;
    }

    let host = article.siteName || "";
    if (!host && article.url) {
      try {
        host = new URL(article.url).hostname.replace(/^www\./, "");
      } catch (e) {
        host = "";
      }
    }
    if (host) {
      ctx.font = `52px ${family}`;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillText(host, x, H - 280);
    }

    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return { base64: await blobToBase64(out), mime: "image/jpeg" };
  } catch (e) {
    return null;
  }
}

/*
 * Public API. article = object from extract.js (possibly with translated
 * title/content already substituted).
 */
async function buildEpub(article, opts = {}) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip not loaded");
  }
  const embedImages = !!opts.embedImages;
  const zip = new JSZip();
  const bookId = uuidv4();
  const isRtl = article.dir === "rtl";
  // Lowercase the language tag: Amazon's Send-to-Kindle rejects case-mismatched
  // BCP-47 tags (e.g. "AR"), which silently fails the whole send.
  const lang = (article.lang || (isRtl ? "ar" : "en")).toLowerCase();
  const dirAttr = isRtl ? "rtl" : "ltr";
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const dateIso = nowIso.slice(0, 10);

  const { xhtml, images, headings } = await normalizeContent(
    article.content,
    article.url || "",
    embedImages
  );

  // Embed an Arabic font for RTL articles — the differentiator. Without a
  // shaping-capable font, Kindle shows "tofu" boxes for Arabic.
  const arabicFontB64 = isRtl ? await loadArabicFontBase64() : null;
  const hasArabicFont = !!arabicFontB64;

  // Auto-generated typographic cover (null outside the extension / in tests).
  const cover = await generateCoverJpeg(article, isRtl);

  // 1) mimetype — MUST be first and stored (uncompressed).
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2) container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // 3) styles + images + font
  zip.file("OEBPS/styles/style.css", buildCss(isRtl, hasArabicFont));
  for (const img of images) {
    zip.file("OEBPS/" + img.path, img.base64, { base64: true });
  }
  if (hasArabicFont) {
    zip.file("OEBPS/fonts/Amiri-Regular.ttf", arabicFontB64, { base64: true });
  }
  if (cover) {
    zip.file("OEBPS/images/cover.jpg", cover.base64, { base64: true });
  }

  // 4) chapter xhtml
  const metaLine = [
    article.byline ? escapeXml(article.byline) : "",
    article.siteName ? escapeXml(article.siteName) : "",
  ]
    .filter(Boolean)
    .join(" — ");
  const sourceLine = article.url
    ? `<div class="a2k-meta">${escapeXml(article.url)}</div>`
    : "";

  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(
    lang
  )}" xml:lang="${escapeXml(lang)}" dir="${dirAttr}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(article.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body dir="${dirAttr}">
  <h1>${escapeXml(article.title)}</h1>
  ${metaLine ? `<div class="a2k-meta">${metaLine}</div>` : ""}
  ${sourceLine}
  ${xhtml}
</body>
</html>`;
  zip.file("OEBPS/text/chapter.xhtml", chapter);

  // 5) nav.xhtml (EPUB3 navigation) — build a real TOC from the article's
  // headings so long reads are navigable, not a single flat entry.
  const navItems = [
    `<li><a href="text/chapter.xhtml">${escapeXml(article.title)}</a></li>`,
  ].concat(
    headings.map(
      (h) => `<li><a href="text/chapter.xhtml#${escapeXml(h.id)}">${escapeXml(h.text)}</a></li>`
    )
  );
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(
    lang
  )}" dir="${dirAttr}">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      ${navItems.join("\n      ")}
    </ol>
  </nav>
</body>
</html>`;
  zip.file("OEBPS/nav.xhtml", nav);

  // 6) toc.ncx (legacy, for older Kindle firmware)
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
  </head>
  <docTitle><text>${escapeXml(article.title)}</text></docTitle>
  <navMap>
    <navPoint id="ch1" playOrder="1">
      <navLabel><text>${escapeXml(article.title)}</text></navLabel>
      <content src="text/chapter.xhtml"/>
    </navPoint>
${headings
    .map(
      (h, i) =>
        `    <navPoint id="np${i}" playOrder="${i + 2}"><navLabel><text>${escapeXml(
          h.text
        )}</text></navLabel><content src="text/chapter.xhtml#${escapeXml(h.id)}"/></navPoint>`
    )
    .join("\n")}
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncx);

  // 7) images + font manifest entries
  const imageManifest = images
    .map(
      (img, i) =>
        `    <item id="img${i}" href="${img.path}" media-type="${img.mime}"/>`
    )
    .join("\n");
  const fontManifest = hasArabicFont
    ? `    <item id="arfont" href="fonts/Amiri-Regular.ttf" media-type="font/ttf"/>\n`
    : "";
  const coverManifest = cover
    ? `    <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n`
    : "";
  // EPUB2-style cover meta too — Kindle's library thumbnail keys off it.
  const coverMeta = cover ? `    <meta name="cover" content="cover-img"/>\n` : "";

  // 8) content.opf
  const ppd = isRtl ? ' page-progression-direction="rtl"' : "";
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(
    lang
  )}" dir="${dirAttr}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(article.title)}</dc:title>
    <dc:language>${escapeXml(lang)}</dc:language>
    <dc:creator>${escapeXml(article.byline || article.siteName || "Article to Kindle")}</dc:creator>
    <dc:source>${escapeXml(article.url || "")}</dc:source>
    <dc:date>${escapeXml(article.date || dateIso)}</dc:date>
${coverMeta}    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
${coverManifest}${fontManifest}${imageManifest}
  </manifest>
  <spine toc="ncx"${ppd}>
    <itemref idref="chapter"/>
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
  });
  return blob;
}

// Book-level CSS: direction is driven by each chapter's dir attribute (chapters
// can differ), so styling keys off [dir="rtl"]/[dir="ltr"] instead of a global
// body direction. Same Arabic-safety rules as buildCss.
function buildBookCss(hasArabicFont) {
  const fontFace = hasArabicFont
    ? `@font-face { font-family: "A2K Arabic"; src: url("../fonts/Amiri-Regular.ttf"); font-weight: normal; font-style: normal; }\n`
    : "";
  const arFamily = hasArabicFont ? `"A2K Arabic", "Noto Naskh Arabic", serif` : "serif";
  return `${fontFace}html, body { margin: 0; padding: 0; }
body { font-family: serif; line-height: 1.7; padding: 1em; letter-spacing: normal; }
[dir="rtl"] { direction: rtl; text-align: right; line-height: 1.85; font-family: ${arFamily}; }
[dir="ltr"] { direction: ltr; text-align: left; }
h1, h2, h3 { line-height: 1.35; }
[dir="rtl"] h1, [dir="rtl"] h2, [dir="rtl"] h3 { direction: rtl; text-align: right; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #555; }
blockquote { margin: 1em; padding-inline-start: 1em; border-inline-start: 3px solid #ccc; }
pre, code, samp, kbd { direction: ltr; unicode-bidi: isolate; }
pre { white-space: pre-wrap; word-wrap: break-word; text-align: left; background: #f6f7f8; padding: 0.6em 0.8em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95em; }
th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; text-align: start; vertical-align: top; }
a { color: inherit; text-decoration: underline; }
.a2k-meta { color: #666; font-size: 0.9em; margin-bottom: 1.5em; }`;
}

/*
 * Build ONE EPUB from several articles (a reading list). Each article becomes a
 * chapter with its own direction; the book gets a combined nav/ncx and a cover.
 * opts: { title?, embedImages? }
 */
async function buildBook(articles, opts = {}) {
  if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
  if (!articles || !articles.length) throw new Error("no articles");
  const embedImages = !!opts.embedImages;
  const anyRtl = articles.some((a) => a.dir === "rtl");
  const bookDir = articles[0].dir === "rtl" ? "rtl" : "ltr";
  const lang = (articles[0].lang || (bookDir === "rtl" ? "ar" : "en")).toLowerCase();
  const bookTitle =
    opts.title ||
    (articles.length === 1 ? articles[0].title : `مجموعة قراءة · ${articles.length} مقالات`);

  const zip = new JSZip();
  const bookId = uuidv4();
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const dateIso = nowIso.slice(0, 10);

  const arabicFontB64 = anyRtl ? await loadArabicFontBase64() : null;
  const hasArabicFont = !!arabicFontB64;
  const cover = await generateCoverJpeg(
    { title: bookTitle, siteName: articles.length > 1 ? `${articles.length} مقالات` : articles[0].siteName, url: articles[0].url },
    bookDir === "rtl"
  );

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file("OEBPS/styles/style.css", buildBookCss(hasArabicFont));
  if (hasArabicFont) zip.file("OEBPS/fonts/Amiri-Regular.ttf", arabicFontB64, { base64: true });
  if (cover) zip.file("OEBPS/images/cover.jpg", cover.base64, { base64: true });

  const chapters = [];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const cdir = a.dir === "rtl" ? "rtl" : "ltr";
    const clang = (a.lang || (cdir === "rtl" ? "ar" : "en")).toLowerCase();
    const { xhtml, images, headings } = await normalizeContent(a.content, a.url || "", embedImages, `c${i}-`);
    for (const img of images) zip.file("OEBPS/" + img.path, img.base64, { base64: true });
    const src = a.url ? `<div class="a2k-meta">${escapeXml(a.url)}</div>` : "";
    const file = `text/chapter${i}.xhtml`;
    zip.file(
      "OEBPS/" + file,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(clang)}" xml:lang="${escapeXml(clang)}" dir="${cdir}">
<head><meta charset="utf-8"/><title>${escapeXml(a.title)}</title><link rel="stylesheet" type="text/css" href="../styles/style.css"/></head>
<body dir="${cdir}"><h1 id="ch${i}">${escapeXml(a.title)}</h1>${src}${xhtml}</body>
</html>`
    );
    chapters.push({ i, file, title: a.title, headings, images });
  }

  const navItems = chapters
    .map((c) => {
      const subs = c.headings
        .map((h) => `<li><a href="${c.file}#${escapeXml(h.id)}">${escapeXml(h.text)}</a></li>`)
        .join("");
      const sub = subs ? `<ol>${subs}</ol>` : "";
      return `<li><a href="${c.file}">${escapeXml(c.title)}</a>${sub}</li>`;
    })
    .join("\n      ");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}" dir="${bookDir}">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>المحتويات</h1><ol>
      ${navItems}
</ol></nav></body></html>`
  );

  const ncxPoints = chapters
    .map(
      (c, idx) =>
        `    <navPoint id="np${idx}" playOrder="${idx + 1}"><navLabel><text>${escapeXml(c.title)}</text></navLabel><content src="${c.file}"/></navPoint>`
    )
    .join("\n");
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:${bookId}"/></head>
  <docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
  <navMap>
${ncxPoints}
  </navMap>
</ncx>`
  );

  const chapterManifest = chapters
    .map((c) => `    <item id="chapter${c.i}" href="${c.file}" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const imageManifest = chapters
    .flatMap((c) => c.images)
    .map((img, i) => `    <item id="img${i}" href="${img.path}" media-type="${img.mime}"/>`)
    .join("\n");
  const spine = chapters.map((c) => `    <itemref idref="chapter${c.i}"/>`).join("\n");
  const fontManifest = hasArabicFont
    ? `    <item id="arfont" href="fonts/Amiri-Regular.ttf" media-type="font/ttf"/>\n`
    : "";
  const coverManifest = cover
    ? `    <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n`
    : "";
  const coverMeta = cover ? `    <meta name="cover" content="cover-img"/>\n` : "";
  const ppd = bookDir === "rtl" ? ' page-progression-direction="rtl"' : "";

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(lang)}" dir="${bookDir}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>${escapeXml(lang)}</dc:language>
    <dc:creator>جسر</dc:creator>
    <dc:date>${escapeXml(dateIso)}</dc:date>
${coverMeta}    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
${coverManifest}${fontManifest}${chapterManifest}
${imageManifest}
  </manifest>
  <spine toc="ncx"${ppd}>
${spine}
  </spine>
</package>`
  );

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

export { buildEpub, buildBook, uuidv4 };
