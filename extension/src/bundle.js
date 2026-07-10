import { buildBook } from "./epub.js";
import { sendEpubToKindle } from "./deliver.js";
import { loadSettings, sanitizeFilename } from "./settings.js";
import { getList, removeAt, clearList } from "./readinglist.js";
import { addHistoryEntry } from "./history.js";

const els = {
  listItems: document.getElementById("listItems"),
  sendBtn: document.getElementById("sendBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  status: document.getElementById("status"),
};

let settings = null;
let list = [];

function setStatus(kind, html) {
  els.status.className = "status " + kind;
  els.status.innerHTML = html;
  els.status.classList.remove("hidden");
}

function setBusy(busy) {
  els.sendBtn.disabled = busy || list.length === 0;
  els.downloadBtn.disabled = busy || list.length === 0;
  els.clearBtn.disabled = busy || list.length === 0;
}

// Render with DOM nodes (titles are untrusted — never innerHTML them).
function render() {
  els.listItems.textContent = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = "القائمة فارغة. أضِف مقالات من زرّ «أضِف للقائمة» في الإضافة.";
    els.listItems.appendChild(li);
    setBusy(false);
    return;
  }
  list.forEach((item, index) => {
    const li = document.createElement("li");
    li.style.flexDirection = "row";
    li.style.alignItems = "center";
    li.style.justifyContent = "space-between";
    li.style.gap = "12px";

    const box = document.createElement("div");
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = item.title || "—";
    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = [item.siteName, item.dir === "rtl" ? "عربي" : "لاتيني"].filter(Boolean).join(" · ");
    box.append(title, meta);

    const rm = document.createElement("button");
    rm.className = "btn ghost";
    rm.type = "button";
    rm.textContent = "إزالة";
    rm.addEventListener("click", async () => {
      list = await removeAt(index);
      render();
    });

    li.append(box, rm);
    els.listItems.appendChild(li);
  });
  setBusy(false);
}

async function buildBlob() {
  setStatus("working", '<span class="spinner"></span>جارٍ بناء الكتاب…');
  return buildBook(list, { title: list.length === 1 ? list[0].title : `مجموعة قراءة · ${list.length} مقالات` });
}

async function onSend() {
  if (!list.length) return;
  setBusy(true);
  try {
    const blob = await buildBlob();
    setStatus("working", '<span class="spinner"></span>جارٍ الإرسال إلى كندل…');
    const title = list.length === 1 ? list[0].title : `مجموعة قراءة (${list.length})`;
    await sendEpubToKindle({ blob, title, author: "جسر", domain: settings.amazonDomain });
    addHistoryEntry({ title, site: `كتاب · ${list.length} مقالات` });
    setStatus("ok", "أُرسل الكتاب إلى مكتبة كندل. سيظهر على جهازك خلال دقائق.");
  } catch (e) {
    const msg = e.message || String(e);
    setStatus("err", msg);
  } finally {
    setBusy(false);
  }
}

async function onDownload() {
  if (!list.length) return;
  setBusy(true);
  try {
    const blob = await buildBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = list.length === 1 ? list[0].title : `reading-list-${list.length}`;
    a.download = sanitizeFilename(name, "reading-list") + ".epub";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus("ok", "تم تنزيل الكتاب.");
  } catch (e) {
    setStatus("err", e.message || String(e));
  } finally {
    setBusy(false);
  }
}

els.sendBtn.addEventListener("click", onSend);
els.downloadBtn.addEventListener("click", onDownload);
els.clearBtn.addEventListener("click", async () => {
  await clearList();
  list = [];
  render();
  setStatus("ok", "مُسحت القائمة.");
});

(async function init() {
  settings = await loadSettings();
  list = await getList();
  render();
})();
