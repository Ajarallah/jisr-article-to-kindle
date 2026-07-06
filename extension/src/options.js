const DEFAULTS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  translationKey: "",
  translationModel: "z-ai/glm-5.2",
  translationFallbackModel: "deepseek-ai/deepseek-v4-pro",
  translationEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
};

const els = {
  amazonDomain: document.getElementById("amazonDomain"),
  translationKey: document.getElementById("translationKey"),
  translateByDefault: document.getElementById("translateByDefault"),
  defaultTargetLang: document.getElementById("defaultTargetLang"),
  saveBtn: document.getElementById("saveBtn"),
  openAmazonBtn: document.getElementById("openAmazonBtn"),
  status: document.getElementById("status"),
};

function setStatus(kind, text) {
  els.status.className = "status " + kind;
  els.status.textContent = text;
  els.status.classList.remove("hidden");
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  els.amazonDomain.value = s.amazonDomain || DEFAULTS.amazonDomain;
  els.translationKey.value = s.translationKey || "";
  els.translateByDefault.checked = !!s.translateByDefault;
  els.defaultTargetLang.value = s.defaultTargetLang || "Arabic";
}

async function save() {
  let domain = (els.amazonDomain.value.trim() || DEFAULTS.amazonDomain).replace(/\/$/, "");
  if (!/^https:\/\/[^/]+/.test(domain)) {
    setStatus("err", "نطاق أمازون يجب أن يبدأ بـ https://");
    return;
  }
  await chrome.storage.sync.set({
    amazonDomain: domain,
    translationKey: els.translationKey.value.trim(),
    translationModel: DEFAULTS.translationModel,
    translationFallbackModel: DEFAULTS.translationFallbackModel,
    translationEndpoint: DEFAULTS.translationEndpoint,
    translateByDefault: els.translateByDefault.checked,
    defaultTargetLang: els.defaultTargetLang.value,
  });
  setStatus("ok", "تم حفظ الإعدادات.");
}

els.saveBtn.addEventListener("click", save);
els.openAmazonBtn.addEventListener("click", () => {
  const domain = (els.amazonDomain.value.trim() || DEFAULTS.amazonDomain).replace(/\/$/, "");
  chrome.tabs.create({ url: domain });
});
load();
