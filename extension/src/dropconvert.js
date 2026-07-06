/*
 * Convert a dropped/opened file (Markdown or Word .docx) into an article object
 * that epub.js can build. Markdown via marked, .docx via mammoth — both vendored
 * and loaded as globals by drop.html.
 *
 * Returns the same shape extract.js produces:
 *   { ok, title, content, dir, lang, byline, siteName, url, textLength }
 */

// Same whole-document direction heuristic as extract.js (kept local so this
// module has no cross-dependency on the injected content script).
function detectDirection(text) {
  if (!text) return "ltr";
  const sample = text.slice(0, 8000);
  const rtl = (sample.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿֐-׿]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const total = rtl + latin;
  if (total < 20) return "ltr";
  return rtl / total >= 0.3 ? "rtl" : "ltr";
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("تعذّرت قراءة الملف."));
    r.readAsText(file);
  });
}
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("تعذّرت قراءة الملف."));
    r.readAsArrayBuffer(file);
  });
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").trim();
}

function firstHeading(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const h = doc.querySelector("h1, h2");
  return h && h.textContent.trim() ? h.textContent.trim() : "";
}

function baseName(name) {
  return (name || "document").replace(/\.[^.]+$/, "").trim() || "document";
}

const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
const DOCX_EXT = /\.docx$/i;

export function isSupported(file) {
  return MD_EXT.test(file.name) || DOCX_EXT.test(file.name);
}

export async function fileToArticle(file) {
  let html;
  if (DOCX_EXT.test(file.name)) {
    if (!globalThis.mammoth) throw new Error("مكتبة تحويل docx غير محمّلة.");
    const arrayBuffer = await readAsArrayBuffer(file);
    // Map Word's Title style to h1 so document titles become headings.
    const styleMap = ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"];
    const res = await globalThis.mammoth.convertToHtml({ arrayBuffer }, { styleMap });
    html = res.value || "";
  } else if (MD_EXT.test(file.name)) {
    if (!globalThis.marked) throw new Error("مكتبة تحويل الماركداون غير محمّلة.");
    const text = await readAsText(file);
    html = globalThis.marked.parse(text);
  } else {
    throw new Error("صيغة غير مدعومة. ادعم: .md و .docx");
  }

  if (!html || !htmlToText(html)) throw new Error("الملف فارغ أو لا يحتوي نصًّا قابلًا للتحويل.");

  const text = htmlToText(html);
  const title = firstHeading(html) || baseName(file.name);
  return {
    ok: true,
    title,
    byline: "",
    siteName: "",
    lang: "",
    dir: detectDirection(text),
    url: "",
    excerpt: "",
    content: html,
    textLength: text.length,
    strategy: DOCX_EXT.test(file.name) ? "docx" : "markdown",
  };
}
