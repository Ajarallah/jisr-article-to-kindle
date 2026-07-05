/*
 * Injected into the active tab to extract the readable article.
 * Runs AFTER lib/Readability.js has been injected into the same context,
 * so the global `Readability` is available.
 *
 * Returns a plain, structured-clone-safe object (no DOM nodes) that the
 * popup turns into an EPUB.
 */
(function extractArticle() {
  function detectDirection(text) {
    // Count strong RTL characters (Arabic, Hebrew, etc.). If they dominate
    // the sampled text, treat the document as right-to-left.
    if (!text) return "ltr";
    const sample = text.slice(0, 2000);
    const rtl = (sample.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) || []).length;
    const ltr = (sample.match(/[A-Za-z]/g) || []).length;
    return rtl > ltr ? "rtl" : "ltr";
  }

  try {
    // Clone the document so Readability does not mutate the live page.
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone, { charThreshold: 250 });
    const article = reader.parse();

    if (!article || !article.content) {
      return { ok: false, error: "no-article" };
    }

    const htmlLang =
      document.documentElement.getAttribute("lang") ||
      article.lang ||
      "";
    const dir =
      document.documentElement.getAttribute("dir") ||
      detectDirection(article.textContent);

    return {
      ok: true,
      title: (article.title || document.title || "Untitled").trim(),
      byline: article.byline || "",
      siteName: article.siteName || location.hostname,
      lang: htmlLang,
      dir: dir === "rtl" ? "rtl" : "ltr",
      url: location.href,
      excerpt: article.excerpt || "",
      content: article.content, // sanitized HTML string from Readability
      textLength: (article.textContent || "").length,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})();
