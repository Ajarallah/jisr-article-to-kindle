/*
 * Shared waiting state for every screen that runs a long job.
 *
 * Why this exists as a module rather than markup copied into four pages:
 * translation runs 17-60s, and Nielsen's response-time limits put anything past
 * ten seconds in the category that needs a percent-done indicator AND a
 * signposted way to interrupt. Both parts have to behave identically wherever a
 * job runs, and the AbortController plumbing is the part that is easy to get
 * subtly wrong in a copy.
 *
 * It builds its own DOM, so a screen adopts it with one call and no markup.
 *
 *   const progress = createProgress({ mountAfter: actionsEl, actions: actionsEl });
 *   progress.start("جارٍ التحضير");
 *   progress.stage("جارٍ الترجمة", done, total);
 *   await work({ signal: progress.signal });
 *   progress.end();
 */

const WARN_TEXT = "أبقِ هذه النافذة مفتوحة";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/*
 * opts:
 *   mountAfter — the progress block is inserted right after this element, so it
 *                appears where the user's attention already is.
 *   actions    — hidden while a job runs. A disabled dark button goes muddy grey
 *                and reads as broken, and a dead button beside live progress
 *                splits attention; replacing it is calmer than dimming it.
 *   warn       — set false where the surface is a real tab rather than a popup,
 *                since only a popup dies when it loses focus.
 */
export function createProgress({ mountAfter, actions, warn = true } = {}) {
  const root = el("div", "progress hidden");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");

  const head = el("div", "progress-head");
  const stageEl = el("span", "progress-stage");
  const countEl = el("span", "progress-count");
  head.append(stageEl, countEl);

  const track = el("div", "progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = el("span", "progress-fill");
  track.appendChild(fill);

  const foot = el("div", "progress-foot");
  const cancelBtn = el("button", "progress-cancel", "إلغاء");
  cancelBtn.type = "button";
  foot.append(el("span", "progress-warn", warn ? WARN_TEXT : ""), cancelBtn);

  root.append(head, track, foot);
  if (mountAfter && mountAfter.parentNode) {
    mountAfter.parentNode.insertBefore(root, mountAfter.nextSibling);
  } else {
    document.body.appendChild(root);
  }

  let controller = null;
  cancelBtn.addEventListener("click", () => {
    if (controller) controller.abort();
  });

  return {
    get signal() {
      return controller ? controller.signal : undefined;
    },
    get running() {
      return !!controller;
    },
    start(stage) {
      controller = new AbortController();
      if (actions) actions.classList.add("hidden");
      root.classList.remove("hidden");
      this.stage(stage);
    },
    stage(label, done, total) {
      stageEl.textContent = label;
      const known = Number.isFinite(done) && Number.isFinite(total) && total > 1;
      track.classList.toggle("indeterminate", !known);
      // Base Web's documented a11y contract for indeterminate progress: a
      // screen reader has no percentage to announce, so it should at least
      // know the region is busy.
      track.setAttribute("aria-busy", String(!known));
      if (known) {
        const ratio = done / total;
        const pct = Math.round(ratio * 100);
        // A 0-1 ratio, not a percentage width: progress.css drives the fill
        // with `transform: scaleX(--p)` so the update is compositor-only.
        fill.style.setProperty("--p", ratio);
        countEl.textContent = `${done.toLocaleString("ar")}/${total.toLocaleString("ar")}`;
        track.setAttribute("aria-valuenow", String(pct));
      } else {
        fill.style.removeProperty("--p");
        countEl.textContent = "";
        track.removeAttribute("aria-valuenow");
      }
    },
    end() {
      controller = null;
      root.classList.add("hidden");
      fill.style.removeProperty("--p");
      track.removeAttribute("aria-busy");
      if (actions) actions.classList.remove("hidden");
    },
  };
}

// An aborted job is the user's own decision — callers report it as information,
// not as a failure.
export function isCancel(e) {
  return !!e && (e.name === "AbortError" || /ألغيت|cancelled/i.test(e.message || ""));
}
