const DEFAULTS = {
  backendUrl: "http://localhost:8787",
  kindleEmail: "",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
};

const els = {
  kindleEmail: document.getElementById("kindleEmail"),
  backendUrl: document.getElementById("backendUrl"),
  translateByDefault: document.getElementById("translateByDefault"),
  defaultTargetLang: document.getElementById("defaultTargetLang"),
  saveBtn: document.getElementById("saveBtn"),
  testBtn: document.getElementById("testBtn"),
  status: document.getElementById("status"),
};

function setStatus(kind, text) {
  els.status.className = "status " + kind;
  els.status.textContent = text;
  els.status.classList.remove("hidden");
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  els.kindleEmail.value = s.kindleEmail || "";
  els.backendUrl.value = s.backendUrl || DEFAULTS.backendUrl;
  els.translateByDefault.checked = !!s.translateByDefault;
  els.defaultTargetLang.value = s.defaultTargetLang || "Arabic";
}

async function save() {
  const values = {
    kindleEmail: els.kindleEmail.value.trim(),
    backendUrl: (els.backendUrl.value.trim() || DEFAULTS.backendUrl).replace(/\/$/, ""),
    translateByDefault: els.translateByDefault.checked,
    defaultTargetLang: els.defaultTargetLang.value,
  };
  if (values.kindleEmail && !/@kindle\.com$/i.test(values.kindleEmail)) {
    setStatus("err", "That does not look like a @kindle.com address.");
    return false;
  }
  await chrome.storage.sync.set(values);
  setStatus("ok", "Settings saved.");
  return true;
}

async function sendTest() {
  if (!(await save())) return;
  const s = await chrome.storage.sync.get(DEFAULTS);
  if (!s.kindleEmail) {
    setStatus("err", "Enter your Kindle email first.");
    return;
  }
  setStatus("info", "Sending a test document…");
  try {
    const resp = await fetch(s.backendUrl + "/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kindleEmail: s.kindleEmail }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    setStatus(
      "ok",
      "Test document sent. Check your Kindle in a few minutes. If nothing arrives, the sender is not on your Amazon approved list yet (step 3)."
    );
  } catch (e) {
    setStatus("err", "Test failed: " + e.message + " — is the delivery service running?");
  }
}

els.saveBtn.addEventListener("click", save);
els.testBtn.addEventListener("click", sendTest);
load();
