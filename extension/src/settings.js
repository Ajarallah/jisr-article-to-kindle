/*
 * Single source of truth for extension settings, shared by popup.js, drop.js
 * and options.js. A new default is added here once, not in three places.
 *
 * Storage split:
 *  - Preferences (non-secret) live in chrome.storage.sync so they roam across
 *    the user's Chrome profiles.
 *  - The NVIDIA API key is a secret: it lives in chrome.storage.local ONLY and
 *    must never sync to Google's cloud or to the user's other devices.
 */

export const DEFAULT_SETTINGS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  translationModel: "z-ai/glm-5.2",
  translationFallbackModel: "deepseek-ai/deepseek-v4-pro",
  translationEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
  embedImages: false,
};

// Origins requested (behind the embedImages opt-in) so epub.js can fetch and
// embed <img> assets from any article host. Mirrors optional_host_permissions.
export const IMAGE_ORIGINS = ["https://*/*"];

/*
 * Load merged settings. Reads preferences from sync and the key from local.
 * Migrates a key left in sync by an older build: moves it to local, then scrubs
 * it from sync so the secret stops roaming.
 */
export async function loadSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get({ ...DEFAULT_SETTINGS, translationKey: "" }),
    chrome.storage.local.get({ translationKey: "" }),
  ]);
  const { translationKey: syncedKey, ...prefs } = synced;
  let translationKey = local.translationKey || "";
  if (!translationKey && syncedKey) {
    translationKey = syncedKey;
    await chrome.storage.local.set({ translationKey });
  }
  if (syncedKey) await chrome.storage.sync.remove("translationKey");
  return { ...DEFAULT_SETTINGS, ...prefs, translationKey };
}

/*
 * Persist a partial settings patch. Routes translationKey to local storage and
 * everything else to sync.
 */
export async function saveSettings(patch) {
  const { translationKey, ...prefs } = patch;
  const ops = [];
  if (Object.keys(prefs).length) ops.push(chrome.storage.sync.set(prefs));
  if (translationKey !== undefined) {
    ops.push(chrome.storage.local.set({ translationKey }));
  }
  await Promise.all(ops);
}

export function sanitizeFilename(name, fallback = "article") {
  return (
    (name || fallback)
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || fallback
  );
}
