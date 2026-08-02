/*
 * Reading list: articles the user queued to bundle into ONE EPUB (a compiled
 * "issue"). Stored in chrome.storage.local (needs unlimitedStorage — article
 * HTML is bulky). Never leaves the device.
 */

const KEY = "a2k_readinglist";
const MAX = 20;

// Keep only what buildBook needs, so entries stay as small as possible.
function slim(article) {
  return {
    title: article.title || "—",
    content: article.content || "",
    dir: article.dir === "rtl" ? "rtl" : "ltr",
    lang: article.lang || "",
    url: article.url || "",
    byline: article.byline || "",
    siteName: article.siteName || "",
    // Kept for the cover's footer plate and its optional lead-image background.
    date: article.date || "",
    leadImage: article.leadImage || "",
    strategy: article.strategy || "",
    at: Date.now(),
  };
}

export async function addToList(article) {
  const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
  list.push(slim(article));
  const next = list.slice(-MAX);
  await chrome.storage.local.set({ [KEY]: next });
  return next.length;
}

export async function getList() {
  const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
  return list;
}

export async function removeAt(index) {
  const { [KEY]: list = [] } = await chrome.storage.local.get(KEY);
  list.splice(index, 1);
  await chrome.storage.local.set({ [KEY]: list });
  return list;
}

export async function clearList() {
  await chrome.storage.local.remove(KEY);
}
