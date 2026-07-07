import { buildEpub } from "./epub.js";
import { sendEpubToKindle } from "./deliver.js";

const els = {
  frame: document.getElementById("preview"),
  dirBadge: document.getElementById("dirBadge"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  status: document.getElementById("status"),
};

let article = null;

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

function sanitizeFilename(name) {
  return (
    (name || "article").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "article"
  );
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
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    setStatus("working", '<span class="spinner"></span>جارٍ بناء ملفّ EPUB…');
    const blob = await buildEpub(article);
    setStatus("working", '<span class="spinner"></span>جارٍ الإرسال إلى كندل…');
    await sendEpubToKindle({ blob, title: article.title, author: article.author || "", domain: article.domain });
    setStatus("ok", "تم الإرسال إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
  } catch (e) {
    const msg = e.message || String(e);
    setStatus("err", /سجّل الدخول|مسجّل/.test(msg) ? "لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة." : msg);
  } finally {
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  }
}

async function onDownload() {
  if (!article) return;
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    setStatus("working", '<span class="spinner"></span>جارٍ بناء ملفّ EPUB…');
    const blob = await buildEpub(article);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(article.title) + ".epub";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus("ok", "تم تنزيل ملفّ EPUB.");
  } catch (e) {
    setStatus("err", e.message);
  } finally {
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  }
}

els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

(async function init() {
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
