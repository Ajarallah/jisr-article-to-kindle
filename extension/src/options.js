const DEFAULTS = {
  backendUrl: "http://localhost:8787",
  kindleEmail: "",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  openrouterKey: "",
  openrouterModel: "anthropic/claude-3.5-sonnet",
};

const els = {
  kindleStatus: document.getElementById("kindleStatus"),
  devicesList: document.getElementById("devicesList"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  openrouterKey: document.getElementById("openrouterKey"),
  translateByDefault: document.getElementById("translateByDefault"),
  defaultTargetLang: document.getElementById("defaultTargetLang"),
  backendUrl: document.getElementById("backendUrl"),
  kindleEmail: document.getElementById("kindleEmail"),
  saveBtn: document.getElementById("saveBtn"),
  testBtn: document.getElementById("testBtn"),
  status: document.getElementById("status"),
};

function setStatus(kind, text) {
  els.status.className = "status " + kind;
  els.status.textContent = text;
  els.status.classList.remove("hidden");
}

function backend() {
  return (els.backendUrl.value.trim() || DEFAULTS.backendUrl).replace(/\/$/, "");
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  els.backendUrl.value = s.backendUrl || DEFAULTS.backendUrl;
  els.kindleEmail.value = s.kindleEmail || "";
  els.translateByDefault.checked = !!s.translateByDefault;
  els.defaultTargetLang.value = s.defaultTargetLang || "Arabic";
  els.openrouterKey.value = s.openrouterKey || "";
  checkKindleStatus();
}

async function save() {
  const values = {
    backendUrl: (els.backendUrl.value.trim() || DEFAULTS.backendUrl).replace(/\/$/, ""),
    kindleEmail: els.kindleEmail.value.trim(),
    translateByDefault: els.translateByDefault.checked,
    defaultTargetLang: els.defaultTargetLang.value,
    openrouterKey: els.openrouterKey.value.trim(),
    openrouterModel: DEFAULTS.openrouterModel,
  };
  if (values.kindleEmail && !/@(kindle|free\.kindle)\.com$/i.test(values.kindleEmail)) {
    setStatus("err", "هذا لا يبدو عنوان @kindle.com صحيحًا.");
    return false;
  }
  await chrome.storage.sync.set(values);
  setStatus("ok", "تم حفظ الإعدادات.");
  return true;
}

function showConnected(devices) {
  els.kindleStatus.textContent = "مربوط ✓";
  els.kindleStatus.className = "account-status connected";
  els.connectBtn.textContent = "إعادة الربط";
  els.disconnectBtn.classList.remove("hidden");
  els.devicesList.textContent = "";
  if (devices && devices.length) {
    for (const d of devices) {
      const chip = document.createElement("span");
      chip.className = "device-chip";
      chip.textContent = d.name || d.serial || "Kindle";
      els.devicesList.appendChild(chip);
    }
  }
}

function showDisconnected() {
  els.kindleStatus.textContent = "غير مربوط";
  els.kindleStatus.className = "account-status disconnected";
  els.connectBtn.textContent = "ربط حساب كندل";
  els.disconnectBtn.classList.add("hidden");
  els.devicesList.textContent = "";
}

async function checkKindleStatus() {
  try {
    const r = await fetch(backend() + "/stk/status", { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    if (d.connected) showConnected(d.devices);
    else showDisconnected();
  } catch (e) {
    showDisconnected();
    els.kindleStatus.textContent = "خدمة التوصيل غير متاحة";
  }
}

async function connectKindle() {
  const b = backend();
  let url;
  try {
    const r = await fetch(b + "/stk/signin-url", { method: "POST" });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "فشل الطلب");
    url = d.url;
  } catch (e) {
    setStatus("err", "تعذّر الوصول لخدمة التوصيل: " + e.message + " — هل هي تعمل؟");
    return;
  }
  const tab = await chrome.tabs.create({ url });
  setStatus("info", "سجّل الدخول في أمازون ووافق على الطلب. سنكمل الربط تلقائيًا…");

  const listener = async (tabId, changeInfo, t) => {
    if (tabId !== tab.id) return;
    const u = changeInfo.url || (t && t.url) || "";
    if (u.startsWith("https://www.amazon.com/gp/sendtokindle") && u.includes("authorization_code")) {
      chrome.tabs.onUpdated.removeListener(listener);
      try {
        const reg = await fetch(b + "/stk/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ redirectUrl: u }),
        });
        const data = await reg.json();
        if (!reg.ok || !data.ok) throw new Error(data.error || "فشل التسجيل");
        try {
          await chrome.tabs.remove(tab.id);
        } catch {
          /* tab may already be closed */
        }
        showConnected(data.devices || []);
        setStatus("ok", "تم ربط حساب كندل بنجاح.");
      } catch (e) {
        setStatus("err", "فشل الربط: " + e.message);
      }
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

async function disconnectKindle() {
  try {
    await fetch(backend() + "/stk/disconnect", { method: "POST" });
  } catch {
    /* best effort */
  }
  showDisconnected();
  setStatus("ok", "أُلغي ربط الحساب.");
}

async function sendTest() {
  if (!(await save())) return;
  const s = await chrome.storage.sync.get(DEFAULTS);
  if (!s.kindleEmail) {
    setStatus("err", "أدخل بريد كندل أولًا (في قسم الطريقة البديلة).");
    return;
  }
  setStatus("info", "جارٍ إرسال مستند تجريبي…");
  try {
    const resp = await fetch(backend() + "/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kindleEmail: s.kindleEmail }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    setStatus(
      "ok",
      "تم إرسال المستند التجريبي. تحقق من كندل خلال دقائق. إن لم يصل، فالمُرسِل ليس بعدُ ضمن قائمة أمازون المعتمدة."
    );
  } catch (e) {
    setStatus("err", "فشل الاختبار: " + e.message + " — هل خدمة التوصيل تعمل؟");
  }
}

els.saveBtn.addEventListener("click", save);
els.connectBtn.addEventListener("click", connectKindle);
els.disconnectBtn.addEventListener("click", disconnectKindle);
els.testBtn.addEventListener("click", sendTest);
els.backendUrl.addEventListener("change", checkKindleStatus);
load();
