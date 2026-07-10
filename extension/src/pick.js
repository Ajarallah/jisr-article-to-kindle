/*
 * Manual content-region picker (fallback when auto-extraction misses). Injected
 * into the page: hover highlights the element under the cursor, click captures
 * its HTML into chrome.storage.local (a2k_picked). The popup, reopened, uses it
 * as the article. Esc cancels. Runs in the page's isolated world.
 */
(function () {
  if (window.__a2kPicker) return;
  window.__a2kPicker = true;

  var last = null;
  var box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;border:2px solid #3644ED;background:rgba(54,68,237,0.10);pointer-events:none;border-radius:3px;";
  var hint = document.createElement("div");
  hint.textContent = "مرّر على منطقة المقال ثمّ انقر لاختيارها · Esc للإلغاء";
  hint.style.cssText =
    "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);" +
    "background:#111;color:#fff;padding:8px 14px;border-radius:8px;pointer-events:none;" +
    'font:14px "IBM Plex Sans Arabic",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);';
  document.body.appendChild(box);
  document.body.appendChild(hint);

  function onMove(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === hint) return;
    last = el;
    var r = el.getBoundingClientRect();
    box.style.top = r.top + "px";
    box.style.left = r.left + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    box.remove();
    hint.remove();
    window.__a2kPicker = false;
  }
  function onClick(e) {
    if (!last) return;
    e.preventDefault();
    e.stopPropagation();
    var text = (last.textContent || "").trim();
    chrome.storage.local.set(
      { a2k_picked: { html: last.innerHTML || "", text: text, url: location.href, title: document.title, at: Date.now() } },
      cleanup
    );
  }
  function onKey(e) {
    if (e.key === "Escape") cleanup();
  }
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
})();
