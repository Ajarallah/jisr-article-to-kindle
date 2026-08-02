import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle } from "./deliver.js";
import { fileToArticle, isSupported } from "./dropconvert.js";
import { loadSettings, sanitizeFilename, bookOptions } from "./settings.js";
import { addHistoryEntry } from "./history.js";
import { createProgress, isCancel } from "./progress.js";

const els = {
  dropzone: document.getElementById("dropzone"),
  pickBtn: document.getElementById("pickBtn"),
  fileInput: document.getElementById("fileInput"),
  articleCard: document.getElementById("articleCard"),
  articleTitle: document.getElementById("articleTitle"),
  articleMeta: document.getElementById("articleMeta"),
  translatePanel: document.getElementById("translatePanel"),
  translateToggle: document.getElementById("translateToggle"),
  translateOptions: document.getElementById("translateOptions"),
  targetLang: document.getElementById("targetLang"),
  actions: document.getElementById("actions"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  status: document.getElementById("status"),
};

let article = null;
let settings = null;
// Shared waiting state — a real tab, so no "keep this open" warning is needed.
const progress = createProgress({ mountAfter: els.actions, actions: els.actions, warn: false });

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}

async function initSettings() {
  settings = await loadSettings();
  els.translateToggle.checked = !!settings.translateByDefault;
  els.translateOptions.classList.toggle("hidden", !settings.translateByDefault);
  if (settings.defaultTargetLang) els.targetLang.value = settings.defaultTargetLang;
}

async function handleFile(file) {
  if (!file) return;
  if (!isSupported(file)) {
    setStatus("err", "صيغة غير مدعومة. المدعوم: ملفّات md و docx.");
    return;
  }
  setStatus("working", '<span class="spinner"></span>جارٍ قراءة الملفّ وتحويله…');
  try {
    article = await fileToArticle(file);
    els.articleTitle.textContent = article.title;
    els.articleTitle.setAttribute("dir", article.dir);
    const words = Math.max(1, Math.round(article.textLength / 6));
    els.articleMeta.textContent = `${file.name} · ${words.toLocaleString("ar")} كلمة`;
    els.articleCard.classList.remove("hidden");
    els.translatePanel.classList.remove("hidden");
    els.actions.classList.remove("hidden");
    els.status.classList.add("hidden");
  } catch (e) {
    article = null;
    setStatus("err", e.message || String(e));
  }
}

async function prepareArticle() {
  let art = article;
  if (els.translateToggle.checked) {
    if (!settings.translationKey) throw new Error("الترجمة غير متاحة: لا مفتاح ترجمة في هذه النسخة.");
    progress.stage("جارٍ الترجمة");
    const out = await translateHtml(
      { title: art.title, html: art.content, targetLang: els.targetLang.value },
      {
        apiKey: settings.translationKey,
        model: settings.translationModel,
        fallbackModel: settings.translationFallbackModel,
        endpoint: settings.translationEndpoint,
      },
      {
        signal: progress.signal,
        bilingual: document.getElementById("bilingualToggle") && document.getElementById("bilingualToggle").checked,
        onProgress: (done, total) => progress.stage("جارٍ الترجمة", done, total),
      }
    );
    art = { ...art, title: out.title || art.title, content: out.html || art.content, dir: out.dir || art.dir, lang: out.lang || art.lang };
  }
  progress.stage("جارٍ بناء ملفّ EPUB");
  const blob = await buildEpub(art, bookOptions(settings, { embedImages: settings.embedImages }));
  return { art, blob };
}

async function onSend() {
  if (!article) return;
  progress.start("جارٍ التحضير");
  try {
    const { art, blob } = await prepareArticle();
    progress.stage("جارٍ الإرسال إلى كندل");
    await sendEpubToKindle({ blob, title: art.title, author: "", domain: settings.amazonDomain, signal: progress.signal });
    progress.end();
    setStatus("ok", "أُرسل إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
    addHistoryEntry({ title: art.title, site: "ملفّ" });
  } catch (e) {
    progress.end();
    if (isCancel(e)) {
      setStatus("info", "ألغيت الإرسال.");
      return;
    }
    const msg = e.message || String(e);
    if (/سجّل الدخول|مسجّل/.test(msg)) {
      setStatus("err", "لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة.");
    } else {
      setStatus("err", msg);
    }
  }
}

async function onDownload() {
  if (!article) return;
  progress.start("جارٍ التحضير");
  try {
    const { art, blob } = await prepareArticle();
    progress.end();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(art.title, "document") + ".epub";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus("ok", "نُزّل ملفّ EPUB.");
  } catch (e) {
    progress.end();
    setStatus(isCancel(e) ? "info" : "err", isCancel(e) ? "ألغيت التنزيل." : e.message);
  }
}

// Drag & drop
["dragenter", "dragover"].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  })
);
["dragleave", "dragend"].forEach((ev) =>
  els.dropzone.addEventListener(ev, () => els.dropzone.classList.remove("dragover"))
);
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("dragover");
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  handleFile(file);
});
// Prevent the whole page from navigating when a file is dropped outside the zone.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

els.dropzone.addEventListener("click", (e) => {
  if (e.target.id !== "pickBtn") els.fileInput.click();
});
els.pickBtn.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});
els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files[0]));
els.translateToggle.addEventListener("change", () =>
  els.translateOptions.classList.toggle("hidden", !els.translateToggle.checked)
);
els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

initSettings();
