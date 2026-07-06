import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle } from "./deliver.js";
import { fileToArticle, isSupported } from "./dropconvert.js";

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

const DEFAULT_SETTINGS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  translationKey: "",
  translationModel: "z-ai/glm-5.2",
  translationFallbackModel: "deepseek-ai/deepseek-v4-pro",
  translationEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
};

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}

function sanitizeFilename(name) {
  return (
    (name || "document").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) ||
    "document"
  );
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
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
    if (!settings.translationKey) throw new Error("أضف مفتاح NVIDIA في إعدادات الإضافة لتفعيل الترجمة.");
    setStatus("working", '<span class="spinner"></span>جارٍ الترجمة بالذكاء الاصطناعي…');
    const out = await translateHtml(
      { title: art.title, html: art.content, targetLang: els.targetLang.value },
      {
        apiKey: settings.translationKey,
        model: settings.translationModel,
        fallbackModel: settings.translationFallbackModel,
        endpoint: settings.translationEndpoint,
      }
    );
    art = { ...art, title: out.title || art.title, content: out.html || art.content, dir: out.dir || art.dir, lang: out.lang || art.lang };
  }
  setStatus("working", '<span class="spinner"></span>جارٍ بناء ملفّ EPUB…');
  const blob = await buildEpub(art);
  return { art, blob };
}

async function onSend() {
  if (!article) return;
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    const { art, blob } = await prepareArticle();
    setStatus("working", '<span class="spinner"></span>جارٍ الإرسال إلى كندل…');
    await sendEpubToKindle({ blob, title: art.title, author: "", domain: settings.amazonDomain });
    setStatus("ok", "تم الإرسال إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
  } catch (e) {
    const msg = e.message || String(e);
    if (/سجّل الدخول|مسجّل/.test(msg)) {
      setStatus("err", "لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة.");
    } else {
      setStatus("err", msg);
    }
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
    const { art, blob } = await prepareArticle();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(art.title) + ".epub";
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

loadSettings();
