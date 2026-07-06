const DEFAULTS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  openrouterKey: "",
  openrouterModel: "anthropic/claude-3.5-sonnet",
};

const els = {
  amazonDomain: document.getElementById("amazonDomain"),
  openrouterKey: document.getElementById("openrouterKey"),
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
  els.openrouterKey.value = s.openrouterKey || "";
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
    openrouterKey: els.openrouterKey.value.trim(),
    openrouterModel: DEFAULTS.openrouterModel,
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
