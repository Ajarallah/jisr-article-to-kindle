/*
 * Injected into the active tab to extract the readable article.
 * Runs AFTER lib/Readability.js has been injected, so global `Readability` exists.
 *
 * Robust two-strategy extraction:
 *   1) Mozilla Readability — excellent on blogs/news (single article container).
 *   2) Main-region fallback — for pages that split content across many sibling
 *      containers (e.g. AWS/AEM "what-is" pages), where Readability grabs only
 *      one section. We find the richest content landmark and take ALL of it.
 * We pick whichever captured more real article text.
 *
 * Returns a structured-clone-safe object (no DOM nodes).
 */
(function extractArticle() {
  function detectDirection(text) {
    if (!text) return "ltr";
    const sample = text.slice(0, 4000);
    const rtl = (sample.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿֐-׿]/g) || []).length;
    const ltr = (sample.match(/[A-Za-z]/g) || []).length;
    return rtl > ltr ? "rtl" : "ltr";
  }

  var CHROME_RE = /(^|[\s_-])(nav|navbar|header|footer|menu|sidebar|breadcrumb|cookie|consent|banner|masthead|social|share|related|promo|advert|subscrib|newsletter|comment|toc|pagination|disclaimer|legal|copyright)([\s_-]|$)/i;

  function isChrome(el) {
    var tag = el.tagName;
    if (tag === "NAV" || tag === "HEADER" || tag === "FOOTER" || tag === "ASIDE") return true;
    var role = el.getAttribute && el.getAttribute("role");
    if (role && /^(navigation|banner|contentinfo|complementary|search)$/i.test(role)) return true;
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    var s = ((el.id || "") + " " + cls).toLowerCase();
    return CHROME_RE.test(s);
  }

  // Total text carried by real content nodes (paragraphs, list items, headings).
  function contentText(el) {
    var n = 0;
    var nodes = el.querySelectorAll("p, li, h1, h2, h3, h4, blockquote, pre, td");
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || "").trim();
      if (t.length > 25) n += t.length;
    }
    return n;
  }

  // Find the richest content landmark, ignoring page chrome.
  function findMainRegion(doc) {
    var landmarks = [];
    var marks = doc.querySelectorAll("main, [role=main], article");
    for (var i = 0; i < marks.length; i++) if (!isChrome(marks[i])) landmarks.push(marks[i]);
    var pool = landmarks.length ? landmarks : Array.prototype.slice.call(doc.querySelectorAll("section, div"));
    var best = null, bestScore = 0;
    for (var j = 0; j < pool.length; j++) {
      var el = pool[j];
      if (!landmarks.length && isChrome(el)) continue;
      var score = contentText(el);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return { el: best, score: bestScore };
  }

  var DROP = "script, style, noscript, nav, header, footer, aside, form, button, iframe, svg, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true]";

  // Serialize a region to clean content HTML: remove chrome/interactive, keep flow.
  function serializeRegion(region) {
    var clone = region.cloneNode(true);
    var drop = clone.querySelectorAll(DROP);
    for (var i = drop.length - 1; i >= 0; i--) drop[i].remove();
    var all = clone.querySelectorAll("*");
    for (var j = all.length - 1; j >= 0; j--) {
      var el = all[j];
      if (isChrome(el)) el.remove();
    }
    return clone.innerHTML;
  }

  function metaTitle(doc) {
    var og = doc.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();
    var h1 = doc.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return (doc.title || "Untitled").trim();
  }

  try {
    var documentClone = document.cloneNode(true);
    var reader = new Readability(documentClone, { charThreshold: 250 });
    var article = reader.parse();
    var readText = article && article.textContent ? article.textContent.trim().length : 0;

    var main = findMainRegion(document);
    var mainText = main.el ? main.score : 0;

    // Choose the fuller extraction. The main-region wins only when it clearly
    // has more real content than Readability (guards normal articles).
    var useMain = main.el && mainText > 1200 && mainText > readText * 1.4;

    var content, title, byline, siteName, lang, dirText;
    if (useMain) {
      content = serializeRegion(main.el);
      title = (article && article.title) || metaTitle(document);
      byline = (article && article.byline) || "";
      siteName = (article && article.siteName) || location.hostname;
      dirText = main.el.textContent || "";
    } else if (article && article.content) {
      content = article.content;
      title = article.title || metaTitle(document);
      byline = article.byline || "";
      siteName = article.siteName || location.hostname;
      dirText = article.textContent || "";
    } else if (main.el && mainText > 400) {
      content = serializeRegion(main.el);
      title = metaTitle(document);
      byline = "";
      siteName = location.hostname;
      dirText = main.el.textContent || "";
    } else {
      return { ok: false, error: "no-article" };
    }

    var htmlLang = document.documentElement.getAttribute("lang") || (article && article.lang) || "";
    var dir = document.documentElement.getAttribute("dir") || detectDirection(dirText);

    return {
      ok: true,
      title: (title || "Untitled").trim(),
      byline: byline || "",
      siteName: siteName || location.hostname,
      lang: htmlLang,
      dir: dir === "rtl" ? "rtl" : "ltr",
      url: location.href,
      excerpt: (article && article.excerpt) || "",
      content: content,
      textLength: dirText.trim().length,
      strategy: useMain ? "main-region" : "readability",
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})();
