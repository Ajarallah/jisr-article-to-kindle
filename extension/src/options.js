import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { detectAmazonDomain } from "./deliver.js";

const els = {
  amazonDomain: document.getElementById("amazonDomain"),
  translationKey: document.getElementById("translationKey"),
  translateByDefault: document.getElementById("translateByDefault"),
  defaultTargetLang: document.getElementById("defaultTargetLang"),
  embedImages: document.getElementById("embedImages"),
  saveBtn: document.getElementById("saveBtn"),
  openAmazonBtn: document.getElementById("openAmazonBtn"),
  detectDomainBtn: document.getElementById("detectDomainBtn"),
  status: document.getElementById("status"),
};

function setStatus(kind, text) {
  els.status.className = "status " + kind;
  els.status.textContent = text;
  els.status.classList.remove("hidden");
}

async function load() {
  const s = await loadSettings();
  els.amazonDomain.value = s.amazonDomain || DEFAULT_SETTINGS.amazonDomain;
  els.translationKey.value = s.translationKey || "";
  els.translateByDefault.checked = !!s.translateByDefault;
  els.defaultTargetLang.value = s.defaultTargetLang || DEFAULT_SETTINGS.defaultTargetLang;
  // Just a default preference now — the actual per-site permission is requested
  // from the popup at send time (only that article's origin, never all sites).
  els.embedImages.checked = !!s.embedImages;
}

async function save() {
  let domain = (els.amazonDomain.value.trim() || DEFAULT_SETTINGS.amazonDomain).replace(/\/$/, "");
  if (!/^https:\/\/[^/]+/.test(domain)) {
    setStatus("err", "نطاق أمازون يجب أن يبدأ بـ https://");
    return;
  }
  await saveSettings({
    amazonDomain: domain,
    translationKey: els.translationKey.value.trim(),
    translateByDefault: els.translateByDefault.checked,
    defaultTargetLang: els.defaultTargetLang.value,
    embedImages: els.embedImages.checked,
  });
  setStatus("ok", "تم حفظ الإعدادات.");
}

els.detectDomainBtn.addEventListener("click", async () => {
  els.detectDomainBtn.disabled = true;
  setStatus("working", "جارٍ البحث عن نطاق أمازون الذي سجّلت الدخول فيه…");
  try {
    const found = await detectAmazonDomain();
    if (found) {
      els.amazonDomain.value = found;
      setStatus("ok", `وُجد: ${found} — اضغط «حفظ الإعدادات» لاعتماده.`);
    } else {
      setStatus("err", "لم أجد نطاقًا مسجّلًا. سجّل الدخول في أمازون أولًا.");
    }
  } finally {
    els.detectDomainBtn.disabled = false;
  }
});

els.saveBtn.addEventListener("click", save);
els.openAmazonBtn.addEventListener("click", () => {
  const domain = (els.amazonDomain.value.trim() || DEFAULT_SETTINGS.amazonDomain).replace(/\/$/, "");
  chrome.tabs.create({ url: domain });
});
load();
