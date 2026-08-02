import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle, checkAuth } from "./deliver.js";
import { loadSettings, saveSettings, sanitizeFilename, originPattern, bookOptions } from "./settings.js";
import { addHistoryEntry } from "./history.js";
import { addToList } from "./readinglist.js";
import { annotateHtml } from "./glossary.js";
import { createProgress, isCancel } from "./progress.js";
import { COVER_STYLES, coverStyle } from "./covers.js";

const els = {
  title: document.getElementById("articleTitle"),
  meta: document.getElementById("articleMeta"),
  authorInput: document.getElementById("authorInput"),
  translateToggle: document.getElementById("translateToggle"),
  translateOptions: document.getElementById("translateOptions"),
  selectionRow: document.getElementById("selectionRow"),
  selectionToggle: document.getElementById("selectionToggle"),
  selectionLabel: document.getElementById("selectionLabel"),
  bilingualToggle: document.getElementById("bilingualToggle"),
  glossaryToggle: document.getElementById("glossaryToggle"),
  targetLang: document.getElementById("targetLang"),
  deliveryInfo: document.getElementById("deliveryInfo"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  status: document.getElementById("status"),
  actions: document.getElementById("actions"),
  coverStyles: document.getElementById("coverStyles"),
  cover: document.querySelector(".cover"),
};

let article = null;
let settings = null;
const progress = createProgress({ mountAfter: document.getElementById("actions"), actions: document.getElementById("actions") });

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}
function clearStatus() {
  els.status.classList.add("hidden");
}



// Lightweight direction detector for picked regions (extract.js's own detector
// isn't reachable here). RTL when a meaningful share of letters are RTL.
function detectDir(text) {
  const sample = String(text || "").slice(0, 8000);
  const rtl = (sample.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿֐-׿]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  if (rtl + latin < 20) return "ltr";
  return rtl / (rtl + latin) >= 0.3 ? "rtl" : "ltr";
}

// Adopt a manually-picked region (from pick.js) as the article to send.
function adoptPicked(picked) {
  let host = "";
  try {
    host = new URL(picked.url).hostname;
  } catch (e) {
    host = "";
  }
  article = {
    ok: true,
    title: (picked.title || "مقال").trim(),
    content: picked.html,
    url: picked.url,
    dir: detectDir(picked.text),
    siteName: host,
    byline: "",
    lang: "",
    textLength: (picked.text || "").length,
  };
  els.title.textContent = article.title;
  els.title.classList.remove("skeleton");
  els.title.setAttribute("dir", article.dir);
  const words = Math.max(1, Math.round(article.textLength / 6));
  els.meta.textContent = `منطقة مختارة يدويًا · ${words.toLocaleString("ar")} كلمة`;
  els.sendBtn.disabled = false;
  els.downloadBtn.disabled = false;
  enableEditing();
}

function openAmazonLogin() {
  chrome.tabs.create({ url: settings.amazonDomain || "https://www.amazon.com" });
}

/*
 * The background picker. Each swatch paints its own pattern with the same CSS the
 * cover block uses, so the swatch is a miniature of the result rather than a
 * label for it. Choosing one repaints the cover immediately and persists the
 * preference, because the cover above IS the artifact being configured.
 */
function applyCoverStyle(id) {
  const style = coverStyle(id);
  els.cover.style.backgroundImage = style.css || "";
  els.cover.style.backgroundSize = style.size || "";
  for (const btn of els.coverStyles.children) {
    btn.setAttribute("aria-checked", String(btn.dataset.style === style.id));
  }
}

function buildCoverPicker() {
  els.coverStyles.textContent = "";
  for (const style of COVER_STYLES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cover-swatch";
    btn.dataset.style = style.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.title = style.label;
    btn.setAttribute("aria-label", style.label);
    btn.style.backgroundImage = style.css || "";
    btn.style.backgroundSize = style.size || "";
    btn.addEventListener("click", () => {
      settings.coverStyle = style.id;
      applyCoverStyle(style.id);
      saveSettings({ coverStyle: style.id });
    });
    els.coverStyles.appendChild(btn);
  }
  applyCoverStyle(settings.coverStyle);
}

async function initSettings() {
  settings = await loadSettings();
  els.translateToggle.checked = !!settings.translateByDefault;
  els.translateOptions.classList.toggle("hidden", !settings.translateByDefault);
  if (settings.defaultTargetLang) els.targetLang.value = settings.defaultTargetLang;
  buildCoverPicker();
}

// Show whether the user is signed in to Amazon (delivery is via their session).
async function refreshDeliveryInfo() {
  els.deliveryInfo.textContent = "…";
  const { isAuthed, offline } = await checkAuth(settings.amazonDomain);
  if (isAuthed) {
    els.deliveryInfo.textContent = "حساب أمازون ✓";
  } else if (offline) {
    // Reached nothing — don't send an offline user to a login page.
    els.deliveryInfo.textContent = "لا يوجد اتصال بالإنترنت";
  } else {
    els.deliveryInfo.innerHTML = '<a href="#" id="amazonLoginLink">سجّل الدخول في أمازون ←</a>';
    const link = document.getElementById("amazonLoginLink");
    if (link) link.addEventListener("click", (e) => { e.preventDefault(); openAmazonLogin(); });
  }
}

async function extractCurrentArticle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) {
    els.title.textContent = "افتح صفحة مقال ثم اضغط على الإضافة.";
    els.title.classList.remove("skeleton");
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib/Readability.js"] });
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/extract.js"] });
    const result = results && results[0] && results[0].result;
    if (!result || !result.ok) {
      els.title.textContent = "تعذر العثور على مقال قابل للقراءة في هذه الصفحة.";
      els.title.classList.remove("skeleton");
      return;
    }
    article = result;
    els.title.textContent = article.title;
    els.title.classList.remove("skeleton");
    els.title.setAttribute("dir", article.dir);
    const words = Math.max(1, Math.round(article.textLength / 6));
    const bits = [];
    if (article.siteName) bits.push(article.siteName);
    bits.push(`${words.toLocaleString("ar")} كلمة`);
    els.meta.textContent = bits.join(" · ");
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
    enableEditing();
    // Offer "send selection only" when the user had text selected on the page.
    if (article.selection && article.selection.text) {
      const selWords = Math.max(1, Math.round(article.selection.text.length / 6));
      els.selectionLabel.textContent = `أرسل التحديد فقط (${selWords.toLocaleString("ar")} كلمة)`;
      els.selectionRow.classList.remove("hidden");
    }
  } catch (e) {
    els.title.textContent = "فشل الاستخلاص: " + e.message;
    els.title.classList.remove("skeleton");
  }
}

// Let the user edit the title/author before sending (title is contenteditable,
// author is an input). Called once the article loads.
function enableEditing() {
  els.title.setAttribute("contenteditable", "true");
  els.title.setAttribute("spellcheck", "false");
  if (els.authorInput) {
    els.authorInput.value = (article && article.byline) || "";
    els.authorInput.classList.remove("hidden");
  }
}

// The article to actually build/send: the on-page selection when the user asked
// for "selection only", otherwise the full extracted article — with the user's
// edited title/author applied.
function activeArticle() {
  let a = article;
  if (els.selectionToggle.checked && article && article.selection) {
    a = { ...article, content: article.selection.html };
  }
  const editedTitle = (els.title.textContent || "").trim();
  const editedAuthor = els.authorInput ? els.authorInput.value.trim() : "";
  return { ...a, title: editedTitle || a.title, byline: editedAuthor || a.byline };
}

async function translateArticle(art, targetLang) {
  if (!settings.translationKey) throw new Error("الترجمة غير متاحة: لا مفتاح ترجمة في هذه النسخة.");
  const out = await translateHtml(
    { title: art.title, html: art.content, targetLang },
    {
      apiKey: settings.translationKey,
      model: settings.translationModel,
      fallbackModel: settings.translationFallbackModel,
      endpoint: settings.translationEndpoint,
    },
    {
      signal: progress.signal,
      bilingual: els.bilingualToggle && els.bilingualToggle.checked,
      onProgress: (done, total) => progress.stage("جارٍ الترجمة", done, total),
    }
  );
  return { ...art, title: out.title || art.title, content: out.html || art.content, dir: out.dir || art.dir, lang: out.lang || art.lang };
}

// If the user wants images, request permission for JUST this article's origin
// (not all sites). Runs inside the send/download click gesture and uses the
// already-known article URL, so no async precedes the request. Returns whether
// images may be embedded.
async function ensureImagePermission() {
  if (!settings.embedImages) return false;
  const pattern = originPattern(article && article.url);
  if (!pattern) return false;
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function prepareArticle(embedImages) {
  const base = activeArticle();
  let art = base;
  if (els.translateToggle.checked) {
    progress.stage("جارٍ الترجمة");
    art = await translateArticle(base, els.targetLang.value);
  }
  if (els.glossaryToggle && els.glossaryToggle.checked) {
    if (!settings.translationKey) throw new Error("المسرد غير متاح: لا مفتاح ترجمة في هذه النسخة.");
    progress.stage("جارٍ إعداد المسرد الدراسي");
    const annotated = await annotateHtml(
      art.content,
      { apiKey: settings.translationKey, model: settings.translationModel, endpoint: settings.translationEndpoint },
      { targetLang: els.targetLang.value, signal: progress.signal }
    );
    art = { ...art, content: annotated };
  }
  progress.stage("جارٍ بناء ملفّ EPUB");
  const blob = await buildEpub(art, bookOptions(settings, { embedImages }));
  return { art, blob };
}

async function onSend() {
  if (!article) return;
  const embedImages = await ensureImagePermission();
  progress.start("جارٍ التحضير");
  try {
    const { art, blob } = await prepareArticle(embedImages);
    progress.stage("جارٍ الإرسال إلى كندل");
    await sendEpubToKindle({
      blob,
      title: art.title,
      author: art.byline || art.siteName || "",
      domain: settings.amazonDomain,
      signal: progress.signal,
    });
    progress.end();
    setStatus("ok", "أُرسل إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
    addHistoryEntry({ title: art.title, url: art.url, site: art.siteName });
    refreshDeliveryInfo();
  } catch (e) {
    progress.end();
    if (isCancel(e)) {
      setStatus("info", "ألغيت الإرسال.");
      return;
    }
    const msg = e.message || String(e);
    if (/سجّل الدخول|مسجّل/.test(msg)) {
      setStatus(
        "err",
        'لست مسجّلًا دخولك في أمازون. <a href="#" id="loginNow">افتح amazon.com وسجّل الدخول</a> ثم أعد المحاولة.'
      );
      const l = document.getElementById("loginNow");
      if (l) l.addEventListener("click", (ev) => { ev.preventDefault(); openAmazonLogin(); });
    } else {
      // Delivery rides Amazon's own session flow; if it ever fails, the file is
      // still good — offer the resilient fallback (download + official S2K).
      setStatus(
        "err",
        `${msg}<br><a href="#" id="dlFallback">نزّل الملف</a> وأرسله عبر <a href="#" id="s2kOfficial">«Send to Kindle» الرسمي</a>.`
      );
      const d = document.getElementById("dlFallback");
      if (d) d.addEventListener("click", (ev) => { ev.preventDefault(); onDownload(); });
      const o = document.getElementById("s2kOfficial");
      if (o) o.addEventListener("click", (ev) => { ev.preventDefault(); chrome.tabs.create({ url: "https://www.amazon.com/sendtokindle" }); });
    }
  }
}

async function onDownload() {
  if (!article) return;
  const embedImages = await ensureImagePermission();
  progress.start("جارٍ التحضير");
  try {
    const { art, blob } = await prepareArticle(embedImages);
    progress.end();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(art.title) + ".epub";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus("ok", "نُزّل ملفّ EPUB.");
  } catch (e) {
    progress.end();
    setStatus(isCancel(e) ? "info" : "err", isCancel(e) ? "ألغيت التنزيل." : e.message);
  }
}

els.translateToggle.addEventListener("change", () => {
  els.translateOptions.classList.toggle("hidden", !els.translateToggle.checked);
  clearStatus();
});
async function onPreview() {
  if (!article) return;
  const embedImages = await ensureImagePermission();
  progress.start("جارٍ التحضير");
  try {
    let art = activeArticle();
    if (els.translateToggle.checked) {
      progress.stage("جارٍ الترجمة");
      art = await translateArticle(art, els.targetLang.value);
    }
    await chrome.storage.local.set({
      a2k_preview: {
        title: art.title,
        content: art.content,
        dir: art.dir,
        lang: art.lang,
        // Carry the source URL and image opt-in so the preview builds the SAME
        // EPUB the popup would (empty dc:source + unresolved image paths, and
        // silently-dropped images, were the parity bug).
        url: art.url,
        byline: art.byline,
        siteName: art.siteName,
        author: art.byline || art.siteName || "",
        embedImages,
        domain: settings.amazonDomain,
      },
    });
    progress.end();
    clearStatus();
    chrome.tabs.create({ url: chrome.runtime.getURL("src/preview.html") });
  } catch (e) {
    progress.end();
    setStatus(isCancel(e) ? "info" : "err", isCancel(e) ? "ألغيت المعاينة." : e.message || String(e));
  }
}

els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
const previewBtn = document.getElementById("previewBtn");
if (previewBtn) previewBtn.addEventListener("click", onPreview);
const fileBtn = document.getElementById("fileBtn");
if (fileBtn) fileBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/drop.html") }));
const addListBtn = document.getElementById("addListBtn");
if (addListBtn)
  addListBtn.addEventListener("click", async () => {
    if (!article) return;
    const n = await addToList(activeArticle());
    setStatus("ok", `أُضيف إلى قائمة القراءة (${n.toLocaleString("ar")} في القائمة).`);
  });
const bundleBtn = document.getElementById("bundleBtn");
if (bundleBtn)
  bundleBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/bundle.html") }));
const pickBtn = document.getElementById("pickBtn");
if (pickBtn)
  pickBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/pick.js"] });
    window.close(); // the picker runs on the page; reopen the popup after clicking a region
  });
els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

async function loadArticleSource() {
  // A freshly picked region (from pick.js) wins over auto-extraction.
  const { a2k_picked } = await chrome.storage.local.get("a2k_picked");
  if (a2k_picked && a2k_picked.html && Date.now() - a2k_picked.at < 5 * 60 * 1000) {
    await chrome.storage.local.remove("a2k_picked");
    adoptPicked(a2k_picked);
    return;
  }
  await extractCurrentArticle();
}

(async function init() {
  await initSettings();
  await Promise.all([loadArticleSource(), refreshDeliveryInfo()]);
})();
