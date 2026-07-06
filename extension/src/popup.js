import { buildEpub } from "./epub.js";
import { translateHtml } from "./translate.js";

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
let delivery = { mode: null }; // "kindle" | "email" | null

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:8787",
  kindleEmail: "",
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

function backend() {
  return (settings.backendUrl || "").replace(/\/$/, "");
}

function sanitizeFilename(name) {
  return (
    (name || "article")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "article"
  );
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  els.translateToggle.checked = !!settings.translateByDefault;
  els.translateOptions.classList.toggle("hidden", !settings.translateByDefault);
  if (settings.defaultTargetLang) els.targetLang.value = settings.defaultTargetLang;
}

// Decide how this send will be delivered, cheaply (no Amazon round-trip).
async function detectDelivery() {
  try {
    const resp = await fetch(backend() + "/health", { signal: AbortSignal.timeout(4000) });
    const h = await resp.json();
    if (h.kindleConnected) {
      delivery = { mode: "kindle" };
      els.deliveryInfo.textContent = "حساب كندل ✓";
    } else if (h.smtpConfigured && settings.kindleEmail) {
      delivery = { mode: "email" };
      els.deliveryInfo.textContent = settings.kindleEmail;
    } else {
      delivery = { mode: null };
      els.deliveryInfo.innerHTML = '<a href="#" id="openSettingsLink">اربط حساب كندل ←</a>';
      wireSettingsLink();
    }
  } catch (e) {
    delivery = { mode: null };
    els.deliveryInfo.innerHTML = '<a href="#" id="openSettingsLink">شغّل خدمة التوصيل ←</a>';
    wireSettingsLink();
  }
}

function wireSettingsLink() {
  const link = document.getElementById("openSettingsLink");
  if (link) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
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
  if (!settings.openrouterKey) {
    throw new Error("أضف مفتاح OpenRouter في الإعدادات لتفعيل الترجمة.");
  }
  const out = await translateHtml(
    { title: art.title, html: art.content, targetLang },
    { apiKey: settings.openrouterKey, model: settings.openrouterModel }
  );
  return {
    ...art,
    title: out.title || art.title,
    content: out.html || art.content,
    dir: out.dir || art.dir,
    lang: out.lang || art.lang,
  };
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

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sendViaKindle(art, blob) {
  setStatus("working", '<span class="spinner"></span>جارٍ الإرسال إلى كندل…');
  const epubBase64 = await blobToBase64(blob);
  const resp = await fetch(backend() + "/stk/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      epubBase64,
      title: art.title,
      author: art.byline || art.siteName || "",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) throw new Error(data.error || `فشل الإرسال (${resp.status})`);
  setStatus("ok", "تم الإرسال إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
}

async function sendViaEmail(art, blob) {
  setStatus("working", '<span class="spinner"></span>جارٍ الإرسال إلى كندل…');
  const epubBase64 = await blobToBase64(blob);
  const filename = sanitizeFilename(art.title) + ".epub";
  const resp = await fetch(backend() + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kindleEmail: settings.kindleEmail, filename, title: art.title, epubBase64 }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) throw new Error(data.error || `فشل الإرسال (${resp.status})`);
  setStatus(
    "ok",
    `تم الإرسال إلى <b>${settings.kindleEmail}</b>. سيظهر خلال دقائق — تأكد من اعتماد المُرسِل في أمازون (انظر الإعدادات).`
  );
}

async function onSend() {
  if (!article) return;
  if (!delivery.mode) {
    setStatus("err", "لا توجد وجهة إرسال بعد — اربط حساب كندل من الإعدادات، أو نزّل الملف.");
    return;
  }
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    const { art, blob } = await prepareArticle();
    if (delivery.mode === "kindle") await sendViaKindle(art, blob);
    else await sendViaEmail(art, blob);
  } catch (e) {
    setStatus("err", e.message);
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
  await Promise.all([extractCurrentArticle(), detectDelivery()]);
})();
