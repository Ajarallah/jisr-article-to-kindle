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
    setStatus("err", "هذا لا يبدو عنوان @kindle.com صحيحًا.");
    return false;
  }
  await chrome.storage.sync.set(values);
  setStatus("ok", "تم حفظ الإعدادات.");
  return true;
}

async function sendTest() {
  if (!(await save())) return;
  const s = await chrome.storage.sync.get(DEFAULTS);
  if (!s.kindleEmail) {
    setStatus("err", "أدخل بريد كندل أولًا.");
    return;
  }
  setStatus("info", "جارٍ إرسال مستند تجريبي…");
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
      "تم إرسال المستند التجريبي. تحقق من كندل خلال دقائق. إن لم يصل شيء، فالمُرسِل ليس بعدُ ضمن قائمة أمازون المعتمدة (الخطوة ٣)."
    );
  } catch (e) {
    setStatus("err", "فشل الاختبار: " + e.message + " — هل خدمة الإرسال تعمل؟");
  }
}

els.saveBtn.addEventListener("click", save);
els.testBtn.addEventListener("click", sendTest);
load();
