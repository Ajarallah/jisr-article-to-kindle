/*
 * Local send history (chrome.storage.local, newest first, capped). Lets the user
 * see what was sent and re-open the source to resend — the extension can't store
 * the EPUB blob to "retry" directly, but reopening the article is the practical
 * retry path. Never leaves the device.
 */

const KEY = "a2k_history";
const MAX = 50;

export async function addHistoryEntry(entry) {
  try {
    const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
    list.unshift({
      title: entry.title || "—",
      url: entry.url || "",
      site: entry.site || "",
      status: entry.status || "sent",
      at: Date.now(),
    });
    await chrome.storage.local.set({ [KEY]: list.slice(0, MAX) });
  } catch {
    /* history is best-effort; never block a send on it */
  }
}

export async function getHistory() {
  const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
  return list;
}

export async function clearHistory() {
  await chrome.storage.local.remove(KEY);
}
