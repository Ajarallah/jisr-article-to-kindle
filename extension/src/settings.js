/*
 * Single source of truth for extension settings, shared by popup.js, drop.js
 * and options.js. A new default is added here once, not in three places.
 *
 * Storage split:
 *  - Preferences (non-secret) live in chrome.storage.sync so they roam across
 *    the user's Chrome profiles.
 *  - The translation API key is a secret: it lives in chrome.storage.local ONLY and
 *    must never sync to Google's cloud or to the user's other devices.
 */

export const DEFAULT_SETTINGS = {
  amazonDomain: "https://www.amazon.com",
  translateByDefault: false,
  defaultTargetLang: "Arabic",
  translationModel: "deepseek/deepseek-v4-flash",
  translationFallbackModel: "deepseek/deepseek-v4-pro",
  translationEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  embedImages: false,
  // Book customization (how the EPUB is styled — honored by Kindle via our CSS/OPF).
  bookFont: "amiri", // "amiri" = embed the Arabic font, "native" = Kindle's own font
  fontSize: "medium", // "small" | "medium" | "large" (baked default; Kindle may override)
  lineSpacing: "normal", // "compact" | "normal" | "relaxed"
  margin: "normal", // "tight" | "normal" | "wide" (page padding)
  justify: false, // justified text vs natural start-alignment (RTL justification is weak on Kindle)
  includeCover: true, // auto-generate a cover image
  cleanArabic: false, // strip decorative tatweel (kashida) from Arabic text
};

// Bundle the book-customization options for buildEpub/buildBook, merging any
// per-send extras (e.g. embedImages).
export function bookOptions(settings, extra = {}) {
  return {
    bookFont: settings.bookFont,
    fontSize: settings.fontSize,
    lineSpacing: settings.lineSpacing,
    margin: settings.margin,
    justify: settings.justify,
    includeCover: settings.includeCover,
    cleanArabic: settings.cleanArabic,
    ...extra,
  };
}

// Build a single-origin match pattern ("https://host/*") for a page URL, so the
// image-embed opt-in can request just that site's images instead of all sites.
// Returns null for non-http(s) URLs (nothing to request).
export function originPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

/*
 * The key bundled with the build (src/secrets.js, git-ignored). Imported
 * dynamically and tolerantly: a clone without the file must still run — there,
 * translation simply stays off instead of the module graph failing to load.
 */
async function bundledTranslationKey() {
  try {
    const mod = await import("./secrets.js");
    return (mod.TRANSLATION_KEY || "").trim();
  } catch {
    return "";
  }
}

/*
 * Load merged settings. Reads preferences from sync and the key from local,
 * falling back to the bundled key so translation works out of the box.
 * Migrates a key left in sync by an older build: moves it to local, then scrubs
 * it from sync so the secret stops roaming.
 */
export async function loadSettings() {
  const [synced, local, bundledKey] = await Promise.all([
    chrome.storage.sync.get({ ...DEFAULT_SETTINGS, translationKey: "" }),
    chrome.storage.local.get({ translationKey: "" }),
    bundledTranslationKey(),
  ]);
  const { translationKey: syncedKey, ...prefs } = synced;
  let translationKey = local.translationKey || "";
  if (!translationKey && syncedKey) {
    translationKey = syncedKey;
    await chrome.storage.local.set({ translationKey });
  }
  if (syncedKey) await chrome.storage.sync.remove("translationKey");
  // A key the user entered themselves outranks the bundled one.
  return { ...DEFAULT_SETTINGS, ...prefs, translationKey: translationKey || bundledKey };
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
