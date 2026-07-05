import { buildEpub } from "./epub.js";

const els = {
  title: document.getElementById("articleTitle"),
  meta: document.getElementById("articleMeta"),
  translateToggle: document.getElementById("translateToggle"),
  translateOptions: document.getElementById("translateOptions"),
  targetLang: document.getElementById("targetLang"),
  kindleEmail: document.getElementById("kindleEmail"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  status: document.getElementById("status"),
};

let article = null; // extracted article object
let settings = null;

const DEFAULT_SETTINGS = {
  backendUrl: "http://localhost:8787",
  kindleEmail: "",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
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
  return (name || "article")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "article";
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  els.translateToggle.checked = !!settings.translateByDefault;
  els.translateOptions.classList.toggle("hidden", !settings.translateByDefault);
  if (settings.defaultTargetLang) els.targetLang.value = settings.defaultTargetLang;
  if (settings.kindleEmail) {
    els.kindleEmail.textContent = settings.kindleEmail;
  } else {
    els.kindleEmail.innerHTML =
      '<a href="#" id="openSettingsLink">Set your Kindle email →</a>';
    document
      .getElementById("openSettingsLink")
      .addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
  }
}

async function extractCurrentArticle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) {
    els.title.textContent = "Open an article page, then click the extension.";
    els.title.classList.remove("skeleton");
    return;
  }
  try {
    // Inject Readability, then the extractor. The extractor's IIFE return
    // value becomes the executeScript result.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/Readability.js"],
    });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/extract.js"],
    });
    const result = results && results[0] && results[0].result;
    if (!result || !result.ok) {
      els.title.textContent =
        "Could not find a readable article on this page.";
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
    bits.push(`~${words.toLocaleString()} words`);
    if (article.dir === "rtl") bits.push("RTL");
    els.meta.textContent = bits.join(" · ");
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  } catch (e) {
    els.title.textContent = "Extraction failed: " + e.message;
    els.title.classList.remove("skeleton");
  }
}

async function translateArticle(art, targetLang) {
  const resp = await fetch(settings.backendUrl.replace(/\/$/, "") + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: art.title,
      html: art.content,
      targetLang,
      sourceLang: art.lang || "",
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Translation failed (${resp.status}). ${txt.slice(0, 140)}`);
  }
  const data = await resp.json();
  const rtlLangs = ["Arabic", "Hebrew", "Persian", "Urdu"];
  const newDir = rtlLangs.includes(targetLang) ? "rtl" : "ltr";
  return {
    ...art,
    title: data.title || art.title,
    content: data.html || art.content,
    dir: newDir,
    lang: data.lang || (targetLang === "Arabic" ? "ar" : art.lang),
  };
}

async function prepareArticle() {
  let art = article;
  if (els.translateToggle.checked) {
    setStatus("working", '<span class="spinner"></span>Translating with AI…');
    art = await translateArticle(article, els.targetLang.value);
  }
  setStatus("working", '<span class="spinner"></span>Building EPUB…');
  const blob = await buildEpub(art);
  return { art, blob };
}

async function onSend() {
  if (!article) return;
  if (!settings.kindleEmail) {
    setStatus("err", "Set your Kindle email in settings first.");
    return;
  }
  els.sendBtn.disabled = true;
  els.downloadBtn.disabled = true;
  try {
    const { art, blob } = await prepareArticle();
    setStatus("working", '<span class="spinner"></span>Sending to your Kindle…');
    const epubBase64 = await blobToBase64(blob);
    const filename = sanitizeFilename(art.title) + ".epub";
    const resp = await fetch(settings.backendUrl.replace(/\/$/, "") + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kindleEmail: settings.kindleEmail,
        filename,
        title: art.title,
        epubBase64,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `Send failed (${resp.status})`);
    }
    setStatus(
      "ok",
      `Sent to <b>${settings.kindleEmail}</b>. It appears on your Kindle within a few minutes — make sure the sender address is on your Amazon approved list (see settings).`
    );
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
    setStatus("ok", "EPUB downloaded.");
  } catch (e) {
    setStatus("err", e.message);
  } finally {
    els.sendBtn.disabled = false;
    els.downloadBtn.disabled = false;
  }
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

// Wire up
els.translateToggle.addEventListener("change", () => {
  els.translateOptions.classList.toggle("hidden", !els.translateToggle.checked);
  clearStatus();
});
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);

(async function init() {
  await loadSettings();
  await extractCurrentArticle();
})();
