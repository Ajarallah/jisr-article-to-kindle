/*
 * Cover motifs.
 *
 * Line-art icons, not photographs. A photo textures (paper, ink, concrete)
 * looked flat and generic in review — a texture has no idea what the article is
 * about. An icon does: one large glyph reads at a glance as "this book is about
 * science" or "about ideas," which is what a real cover's art does. Ten
 * categories span most nonfiction — see CATEGORIES below.
 *
 * Icons: Tabler Icons (github.com/tabler/tabler-icons), MIT licence, vendored as
 * plain SVG under icons/cover/. 34 candidates were pulled and ten kept; the
 * rest are not referenced from code and can be deleted freely. `currentColor`
 * strokes mean one file recolors for both the cover ink and any future theme
 * with no duplication. Total: ~40 KB for all ten — line art compresses to
 * almost nothing next to the 280 KB the photographic textures cost.
 *
 * The motif is drawn oversized and mostly off-canvas in one corner: large
 * enough to read as the cover's real art, quiet enough that the title stays the
 * loudest thing on the page. Same rule the earlier photo textures followed,
 * carried over because it is the right rule, not because the asset changed.
 */

export const COVER_INK = "#CB3F28";
export const COVER_TEXT = "#F7F2E7";

/*
 * Cover type: The Year of Handicrafts at Black, bundled with the extension
 * (lib/fonts/handicrafts-black.woff2, declared in fonts.css).
 */
export const COVER_FONT_RTL = '"The Year of Handicrafts", "IBM Plex Sans Arabic", sans-serif';
export const COVER_FONT_LTR = '"The Year of Handicrafts", "IBM Plex Sans", Georgia, serif';
export const COVER_FONT_WEIGHT = 900;

/*
 * A canvas draws with whatever faces the DOCUMENT has already loaded. @font-face
 * is lazy, so on the first cover — before any element has rendered in that face —
 * the draw silently falls back to Plex and the book ships with the wrong cover.
 * Force the load and wait for it.
 */
export async function ensureCoverFont() {
  try {
    if (typeof document === "undefined" || !document.fonts) return;
    await document.fonts.load(`${COVER_FONT_WEIGHT} 104px "The Year of Handicrafts"`, "جسر");
    await document.fonts.ready;
  } catch {
    /* falls back to Plex, which is still a correct cover */
  }
}

// id: matches icons/cover/<id>.svg. keywords: matched case-insensitively against
// the article title for "إنشاء غلاف" (see suggestCoverStyle below).
export const COVER_STYLES = [
  { id: "plain", label: "سادة", icon: null },
  {
    id: "science", label: "علوم", icon: "flask",
    keywords: ["علم", "علوم", "بحث", "دراسة", "تجربة", "فيزياء", "كيمياء", "أحياء", "طب", "دماغ", "جين",
      "science", "research", "study", "experiment", "physics", "chemistry", "biology", "medicine", "gene"],
  },
  {
    id: "mind", label: "فكر ونفس", icon: "brain",
    keywords: ["نفس", "عقل", "فكر", "وعي", "سلوك", "إدراك", "ذكاء", "تعلم", "دماغ",
      "mind", "psychology", "brain", "cognitive", "behavior", "consciousness", "thinking", "learning", "intelligence"],
  },
  {
    id: "history", label: "تاريخ وحضارة", icon: "scale",
    keywords: ["تاريخ", "حضارة", "قديم", "أثر", "إمبراطورية", "ملك", "حرب", "قرون",
      "history", "ancient", "civilization", "empire", "century", "medieval", "war", "dynasty"],
  },
  {
    id: "business", label: "اقتصاد وأعمال", icon: "coin",
    keywords: ["اقتصاد", "مال", "أعمال", "شركة", "سوق", "استثمار", "تجارة", "وظيفة",
      "economy", "business", "money", "market", "startup", "invest", "finance", "company", "job", "career"],
  },
  {
    id: "tech", label: "تقنية", icon: "code",
    keywords: ["تقنية", "برمجة", "ذكاء اصطناعي", "حاسوب", "خوارزم", "بيانات", "إنترنت", "روبوت", "نموذج",
      "technology", "software", "ai", "computer", "algorithm", "data", "internet", "robot", "code", "model", "llm"],
  },
  {
    id: "space", label: "فضاء وكون", icon: "telescope",
    keywords: ["فضاء", "كون", "نجم", "كوكب", "مجرة", "فلك",
      "space", "universe", "star", "planet", "galaxy", "astronomy", "cosmos", "nasa"],
  },
  {
    id: "nature", label: "طبيعة وبيئة", icon: "leaf",
    keywords: ["طبيعة", "بيئة", "مناخ", "حيوان", "نبات", "بحر", "غابة",
      "nature", "climate", "environment", "animal", "plant", "ocean", "forest", "wildlife", "species"],
  },
  {
    id: "literature", label: "أدب ولغة", icon: "quote",
    keywords: ["أدب", "شعر", "رواية", "لغة", "كتابة", "قصة", "لسان", "بلاغة",
      "literature", "poetry", "novel", "language", "writing", "story", "grammar", "linguistics"],
  },
  {
    id: "politics", label: "سياسة ومجتمع", icon: "building-skyscraper",
    keywords: ["سياسة", "مجتمع", "حكومة", "قانون", "انتخاب", "دولة", "حرية",
      "politics", "society", "government", "law", "election", "policy", "democracy", "state"],
  },
  { id: "general", label: "عامّ", icon: "books" },
];

export function coverStyle(id) {
  return COVER_STYLES.find((s) => s.id === id) || COVER_STYLES[0];
}

/*
 * Pick a style for "إنشاء غلاف": score every keyworded category by how many of
 * its keywords appear in the title, keep the leaders, and choose randomly among
 * them. A tie (including the common case of zero matches, where every category
 * ties at 0) is resolved by chance rather than by silently favouring whichever
 * category happens to appear first in the array. "general" is excluded from the
 * random floor so an unmatched title still gets a specific-looking category
 * instead of visibly always landing on the plain fallback.
 */
export function suggestCoverStyle(title) {
  const text = (title || "").toLowerCase();
  const candidates = COVER_STYLES.filter((s) => s.keywords);
  const scored = candidates.map((s) => ({
    style: s,
    score: s.keywords.reduce((n, k) => n + (text.includes(k.toLowerCase()) ? 1 : 0), 0),
  }));
  const top = Math.max(...scored.map((s) => s.score));
  const leaders = top > 0 ? scored.filter((s) => s.score === top) : scored;
  const pick = leaders[Math.floor(Math.random() * leaders.length)];
  return (pick && pick.style.id) || "general";
}

const iconCache = new Map();
// Rasterize at the size the cover actually draws it (see paintCoverBackground),
// not the SVG's native 24x24 — a 24px bitmap stretched ~65x to fill a corner of
// a 1600px cover would show jagged strokes.
const ICON_RASTER_PX = 1568;

// Extension-relative URL for a style's icon, or null (test harness / no runtime).
export function iconUrl(style) {
  if (!style || !style.icon) return null;
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) return null;
  return chrome.runtime.getURL(`icons/cover/${style.icon}.svg`);
}

/*
 * Tabler's icons use stroke="currentColor" so one file can recolor for any
 * theme — but createImageBitmap rasterizes an SVG in an isolated context with
 * no inherited CSS `color`, so currentColor resolves to black rather than the
 * cover's cream. Substitute the literal colour into the markup before rasterizing.
 */
async function loadIcon(style) {
  const url = iconUrl(style);
  if (!url) return null;
  if (iconCache.has(url)) return iconCache.get(url);
  const p = (async () => {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const svgText = (await resp.text()).replace(/currentColor/g, COVER_TEXT);
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    return createImageBitmap(blob, {
      resizeWidth: ICON_RASTER_PX,
      resizeHeight: ICON_RASTER_PX,
      resizeQuality: "high",
    });
  })().catch(() => null);
  iconCache.set(url, p);
  return p;
}

/*
 * Paint the ink, then the style's motif oversized in the lower inside corner —
 * mostly bled off-canvas, tinted low enough that it reads as texture, not as
 * competing artwork. Swapped for the RTL side so it sits toward the spine
 * whichever direction the title reads.
 */
export async function paintCoverBackground(ctx, W, H, styleId, isRtl) {
  ctx.fillStyle = COVER_INK;
  ctx.fillRect(0, 0, W, H);
  const bitmap = await loadIcon(coverStyle(styleId));
  if (!bitmap) return;
  const size = W * 0.98;
  const x = isRtl ? -size * 0.32 : W - size * 0.68;
  const y = H - size * 0.62;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.drawImage(bitmap, x, y, size, size);
  ctx.restore();
  if (bitmap.close) bitmap.close();
}
