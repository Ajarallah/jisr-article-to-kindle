import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { detectAmazonDomain } from "./deliver.js";
import { getHistory, clearHistory } from "./history.js";
import { KINDLE_DEVICES } from "./devices.js";

const els = {
  amazonDomain: document.getElementById("amazonDomain"),
  translateByDefault: document.getElementById("translateByDefault"),
  defaultTargetLang: document.getElementById("defaultTargetLang"),
  translationKey: document.getElementById("translationKey"),
  translateState: document.getElementById("translateState"),
  embedImages: document.getElementById("embedImages"),
  kindleDevice: document.getElementById("kindleDevice"),
  bookFont: document.getElementById("bookFont"),
  fontSize: document.getElementById("fontSize"),
  lineSpacing: document.getElementById("lineSpacing"),
  margin: document.getElementById("margin"),
  justify: document.getElementById("justify"),
  includeCover: document.getElementById("includeCover"),
  cleanArabic: document.getElementById("cleanArabic"),
  saveBtn: document.getElementById("saveBtn"),
  openAmazonBtn: document.getElementById("openAmazonBtn"),
  detectDomainBtn: document.getElementById("detectDomainBtn"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  status: document.getElementById("status"),
};

// Build the history list with DOM nodes (never innerHTML — titles are untrusted).
async function renderHistory() {
  const list = await getHistory();
  els.historyList.textContent = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = "لا يوجد سجلّ بعد.";
    els.historyList.appendChild(li);
    return;
  }
  for (const item of list) {
    const li = document.createElement("li");
    const title = document.createElement(item.url ? "a" : "span");
    title.className = "history-title";
    title.textContent = item.title || "—";
    if (item.url) {
      title.href = item.url;
      title.target = "_blank";
      title.rel = "noreferrer";
    }
    const meta = document.createElement("span");
    meta.className = "history-meta";
    const when = new Date(item.at).toLocaleString("ar");
    meta.textContent = [item.site, when].filter(Boolean).join(" · ");
    li.append(title, meta);
    els.historyList.appendChild(li);
  }
}

function setStatus(kind, text) {
  els.status.className = "status " + kind;
  els.status.textContent = text;
  els.status.classList.remove("hidden");
}

/*
 * Say plainly whether translation can run right now. The page used to assert it
 * was "built in, no key needed", which held only for a build carrying a key in
 * src/secrets.js — on a fresh clone translation and the glossary were simply
 * unreachable, and the README told people to enter a key in a field that did
 * not exist.
 */
function markTranslationReady(ready) {
  els.translateState.className = "state-chip " + (ready ? "on" : "off");
  els.translateState.textContent = ready
    ? "الترجمة والمسرد جاهزان."
    : "الترجمة والمسرد معطّلان — أضِف مفتاحًا لتشغيلهما.";
}

// Built once from the shared device table (devices.js) rather than hardcoded
// in options.html, so a device added there shows up here automatically.
function buildDeviceOptions() {
  els.kindleDevice.textContent = "";
  for (const device of KINDLE_DEVICES) {
    const opt = document.createElement("option");
    opt.value = device.id;
    opt.textContent = device.label;
    els.kindleDevice.appendChild(opt);
  }
}

async function load() {
  const s = await loadSettings();
  els.amazonDomain.value = s.amazonDomain || DEFAULT_SETTINGS.amazonDomain;
  els.translateByDefault.checked = !!s.translateByDefault;
  els.defaultTargetLang.value = s.defaultTargetLang || DEFAULT_SETTINGS.defaultTargetLang;
  els.translationKey.value = s.translationKey || "";
  markTranslationReady(!!s.translationKey);
  // Just a default preference now — the actual per-site permission is requested
  // from the popup at send time (only that article's origin, never all sites).
  els.embedImages.checked = !!s.embedImages;
  buildDeviceOptions();
  els.kindleDevice.value = s.kindleDevice || DEFAULT_SETTINGS.kindleDevice;
  els.bookFont.value = s.bookFont || DEFAULT_SETTINGS.bookFont;
  els.fontSize.value = s.fontSize || DEFAULT_SETTINGS.fontSize;
  els.lineSpacing.value = s.lineSpacing || DEFAULT_SETTINGS.lineSpacing;
  els.margin.value = s.margin || DEFAULT_SETTINGS.margin;
  els.justify.checked = !!s.justify;
  els.includeCover.checked = s.includeCover !== false;
  els.cleanArabic.checked = !!s.cleanArabic;
}

async function save() {
  let domain = (els.amazonDomain.value.trim() || DEFAULT_SETTINGS.amazonDomain).replace(/\/$/, "");
  if (!/^https:\/\/[^/]+/.test(domain)) {
    setStatus("err", "نطاق أمازون يجب أن يبدأ بـ https://");
    return;
  }
  await saveSettings({
    amazonDomain: domain,
    translateByDefault: els.translateByDefault.checked,
    defaultTargetLang: els.defaultTargetLang.value,
    translationKey: els.translationKey.value.trim(),
    embedImages: els.embedImages.checked,
    kindleDevice: els.kindleDevice.value,
    bookFont: els.bookFont.value,
    fontSize: els.fontSize.value,
    lineSpacing: els.lineSpacing.value,
    margin: els.margin.value,
    justify: els.justify.checked,
    includeCover: els.includeCover.checked,
    cleanArabic: els.cleanArabic.checked,
  });
  markTranslationReady(!!els.translationKey.value.trim());
  setStatus("ok", "حُفظت الإعدادات.");
}

els.detectDomainBtn.addEventListener("click", async () => {
  els.detectDomainBtn.disabled = true;
  setStatus("working", "جارٍ البحث عن نطاق أمازون الذي سجّلت الدخول فيه…");
  try {
    const found = await detectAmazonDomain();
    if (found) {
      els.amazonDomain.value = found;
      setStatus("ok", `وُجد: ${found}. اضغط «حفظ الإعدادات» لاعتماده.`);
    } else {
      setStatus("err", "لم أجد نطاقًا مسجّلًا. سجّل الدخول في أمازون أولًا.");
    }
  } finally {
    els.detectDomainBtn.disabled = false;
  }
});

els.clearHistoryBtn.addEventListener("click", async () => {
  await clearHistory();
  renderHistory();
});

els.saveBtn.addEventListener("click", save);
els.openAmazonBtn.addEventListener("click", () => {
  const domain = (els.amazonDomain.value.trim() || DEFAULT_SETTINGS.amazonDomain).replace(/\/$/, "");
  chrome.tabs.create({ url: domain });
});
load();
renderHistory();
