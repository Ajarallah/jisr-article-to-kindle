import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle, isSignedIn } from "./deliver.js";
import { loadSettings, sanitizeFilename } from "./settings.js";

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

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}
function clearStatus() {
  els.status.classList.add("hidden");
}

function openAmazonLogin() {
  chrome.tabs.create({ url: settings.amazonDomain || "https://www.amazon.com" });
}

async function initSettings() {
  settings = await loadSettings();
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
  if (!settings.translationKey) throw new Error("أضف مفتاح NVIDIA في الإعدادات لتفعيل الترجمة.");
  const out = await translateHtml(
    { title: art.title, html: art.content, targetLang },
    {
      apiKey: settings.translationKey,
      model: settings.translationModel,
      fallbackModel: settings.translationFallbackModel,
      endpoint: settings.translationEndpoint,
    },
    {
      onProgress: (done, total) => {
        if (total > 1) {
          setStatus(
            "working",
            `<span class="spinner"></span>جارٍ الترجمة… ${done.toLocaleString("ar")}/${total.toLocaleString("ar")}`
          );
        }
      },
    }
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
  const blob = await buildEpub(art, { embedImages: settings.embedImages });
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
async function onPreview() {
  if (!article) return;
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    let art = article;
    if (els.translateToggle.checked) {
      setStatus("working", '<span class="spinner"></span>جارٍ الترجمة بالذكاء الاصطناعي…');
      art = await translateArticle(article, els.targetLang.value);
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
        embedImages: settings.embedImages,
        domain: settings.amazonDomain,
      },
    });
    clearStatus();
    chrome.tabs.create({ url: chrome.runtime.getURL("src/preview.html") });
  } catch (e) {
    setStatus("err", e.message || String(e));
  } finally {
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  }
}

els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
const previewBtn = document.getElementById("previewBtn");
if (previewBtn) previewBtn.addEventListener("click", onPreview);
const fileBtn = document.getElementById("fileBtn");
if (fileBtn) fileBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/drop.html") }));
els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

(async function init() {
  await initSettings();
  await Promise.all([extractCurrentArticle(), refreshDeliveryInfo()]);
})();
