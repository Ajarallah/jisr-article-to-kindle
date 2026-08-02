import { buildEpub } from "./epub.js";
import { sendEpubToKindle } from "./deliver.js";
import { sanitizeFilename, loadSettings, bookOptions } from "./settings.js";
import { addHistoryEntry } from "./history.js";
import { createProgress, isCancel } from "./progress.js";

const els = {
  frame: document.getElementById("preview"),
  dirBadge: document.getElementById("dirBadge"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  status: document.getElementById("status"),
};

let article = null;
let settings = null;
// A real tab, so no "keep this open" warning; the bar's action row steps aside
// while the job runs.
const progress = createProgress({
  mountAfter: document.getElementById("status"),
  actions: document.getElementById("actions"),
  warn: false,
});

function buildOpts() {
  return bookOptions(settings || {}, { embedImages: !!article.embedImages });
}

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A reader-styled document for the sandboxed iframe. Scripts are disabled by the
// iframe's empty sandbox, so injecting the article HTML here is safe.
function renderDoc(art) {
  const rtl = art.dir === "rtl";
  const lang = art.lang || (rtl ? "ar" : "en");
  const bodyFont = rtl
    ? '"Noto Naskh Arabic", "Amiri", "Geeza Pro", serif'
    : "Georgia, Cambria, \"Times New Roman\", serif";
  const rtlRules = rtl ? "direction: rtl; text-align: right;" : "";
  return (
    "<!DOCTYPE html><html lang=\"" + esc(lang) + "\" dir=\"" + (rtl ? "rtl" : "ltr") + "\"><head><meta charset=\"utf-8\">" +
    "<style>" +
    "html,body{margin:0}" +
    "body{padding:36px 44px;font-family:" + bodyFont + ";line-height:1.9;color:#1b1e22;font-size:18px;" + rtlRules + "}" +
    "h1{font-size:26px;line-height:1.35;margin:0 0 6px}h2,h3{line-height:1.4}" +
    ".a2k-meta{color:#6b7280;font-size:0.85em;margin-bottom:1.5em}" +
    "img{max-width:100%;height:auto}a{color:#0f766e}" +
    "pre{white-space:pre-wrap;word-wrap:break-word;background:#f6f7f8;padding:12px 14px;border-radius:8px;overflow:auto}" +
    "blockquote{margin:1em;padding-inline-start:1em;border-inline-start:3px solid #d7dade;color:#555}" +
    "figure{margin:1em 0;text-align:center}figcaption{font-size:0.85em;color:#6b7280}" +
    "</style></head><body>" +
    "<h1>" + esc(art.title) + "</h1>" +
    (art.author ? '<div class="a2k-meta">' + esc(art.author) + "</div>" : "") +
    (art.content || "") +
    "</body></html>"
  );
}

async function onSend() {
  if (!article) return;
  progress.start("جارٍ بناء ملفّ EPUB");
  try {
    const blob = await buildEpub(article, buildOpts());
    progress.stage("جارٍ الإرسال إلى كندل");
    await sendEpubToKindle({ blob, title: article.title, author: article.author || "", domain: article.domain, signal: progress.signal });
    progress.end();
    setStatus("ok", "أُرسل إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
    addHistoryEntry({ title: article.title, url: article.url, site: article.siteName });
  } catch (e) {
    progress.end();
    if (isCancel(e)) {
      setStatus("info", "ألغيت الإرسال.");
      return;
    }
    const msg = e.message || String(e);
    setStatus("err", /سجّل الدخول|مسجّل/.test(msg) ? "لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة." : msg);
  }
}

async function onDownload() {
  if (!article) return;
  progress.start("جارٍ بناء ملفّ EPUB");
  try {
    const blob = await buildEpub(article, buildOpts());
    progress.end();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(article.title) + ".epub";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus("ok", "نُزّل ملفّ EPUB.");
  } catch (e) {
    progress.end();
    setStatus(isCancel(e) ? "info" : "err", isCancel(e) ? "ألغيت التنزيل." : e.message);
  }
}

els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

(async function init() {
  settings = await loadSettings();
  const { a2k_preview } = await chrome.storage.local.get("a2k_preview");
  if (!a2k_preview || !a2k_preview.content) {
    setStatus("err", "لا يوجد محتوى للمعاينة. افتح مقالًا واضغط «معاينة» من الإضافة.");
    els.sendBtn.disabled = true;
    els.downloadBtn.disabled = true;
    return;
  }
  article = a2k_preview;
  // Consume the handoff so it does not linger in storage.
  chrome.storage.local.remove("a2k_preview");
  els.dirBadge.textContent = article.dir === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين";
  els.frame.srcdoc = renderDoc(article);
})();
