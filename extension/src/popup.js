import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle, isSignedIn } from "./deliver.js";

const els = {
  title: document.getElementById("articleTitle"),
  meta: document.getElementById("articleMeta"),
  translateToggle: document.getElementById("translateToggle"),
  translateOptions: document.getElementById("translateOptions"),
  targetLang: document.getElementById("targetLang"),
  deliveryInfo: document.getElementById("deliveryInfo"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  status: document.getElementById("status"),
};

let article = null;
let settings = null;

const DEFAULT_SETTINGS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  openrouterKey: "",
  openrouterModel: "anthropic/claude-3.5-sonnet",
};

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}
function clearStatus() {
  els.status.classList.add("hidden");
}

function sanitizeFilename(name) {
  return (
    (name || "article").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "article"
  );
}

function openAmazonLogin() {
  chrome.tabs.create({ url: settings.amazonDomain || "https://www.amazon.com" });
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  els.translateToggle.checked = !!settings.translateByDefault;
  els.translateOptions.classList.toggle("hidden", !settings.translateByDefault);
  if (settings.defaultTargetLang) els.targetLang.value = settings.defaultTargetLang;
}

// Show whether the user is signed in to Amazon (delivery is via their session).
async function refreshDeliveryInfo() {
  els.deliveryInfo.textContent = "…";
  const ok = await isSignedIn(settings.amazonDomain);
  if (ok) {
    els.deliveryInfo.textContent = "حساب أمازون ✓";
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
  } catch (e) {
    els.title.textContent = "فشل الاستخلاص: " + e.message;
    els.title.classList.remove("skeleton");
  }
}

async function translateArticle(art, targetLang) {
  if (!settings.openrouterKey) throw new Error("أضف مفتاح OpenRouter في الإعدادات لتفعيل الترجمة.");
  const out = await translateHtml(
    { title: art.title, html: art.content, targetLang },
    { apiKey: settings.openrouterKey, model: settings.openrouterModel }
  );
  return { ...art, title: out.title || art.title, content: out.html || art.content, dir: out.dir || art.dir, lang: out.lang || art.lang };
}

async function prepareArticle() {
  let art = article;
  if (els.translateToggle.checked) {
    setStatus("working", '<span class="spinner"></span>جارٍ الترجمة بالذكاء الاصطناعي…');
    art = await translateArticle(article, els.targetLang.value);
  }
  setStatus("working", '<span class="spinner"></span>جارٍ بناء ملف EPUB…');
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
    await sendEpubToKindle({
      blob,
      title: art.title,
      author: art.byline || art.siteName || "",
      domain: settings.amazonDomain,
    });
    setStatus("ok", "تم الإرسال إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
    refreshDeliveryInfo();
  } catch (e) {
    const msg = e.message || String(e);
    if (/سجّل الدخول|مسجّل/.test(msg)) {
      setStatus(
        "err",
        'لست مسجّلًا دخولك في أمازون. <a href="#" id="loginNow">افتح amazon.com وسجّل الدخول</a> ثم أعد المحاولة.'
      );
      const l = document.getElementById("loginNow");
      if (l) l.addEventListener("click", (ev) => { ev.preventDefault(); openAmazonLogin(); });
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
    setStatus("ok", "تم تنزيل ملف EPUB.");
  } catch (e) {
    setStatus("err", e.message);
  } finally {
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  }
}

els.translateToggle.addEventListener("change", () => {
  els.translateOptions.classList.toggle("hidden", !els.translateToggle.checked);
  clearStatus();
});
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

(async function init() {
  await loadSettings();
  await Promise.all([extractCurrentArticle(), refreshDeliveryInfo()]);
})();
