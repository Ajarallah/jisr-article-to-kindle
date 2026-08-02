/*
 * Cover design.
 *
 * Palette, deliberately inverted from the popup's: PAPER white ground, ORANGE
 * artwork, BLACK title. Kindle's e-ink renders a full-bleed orange as a heavy
 * dark grey with the title knocked out in white — a muddy, low-contrast slab.
 * White paper with black type is what an e-reader is built to show, and the
 * orange survives as a mid grey that reads as a printed second colour.
 *
 * Layout follows a real book jacket rather than a poster: artwork occupies the
 * upper field, the title sits on the white below it, and a footer plate carries
 * the metadata a jacket carries — document kind, author, date, source — each
 * with its own icon, on a single baseline.
 *
 * Two background modes:
 *   - A generated PATTERN (see PATTERNS): pure canvas geometry, zero assets,
 *     resolution-independent, and every one adapts to the cover's dimensions.
 *   - The ARTICLE'S OWN lead image (og:image), when the user picks "صورة المقال"
 *     and the page actually published one. Cropped to the artwork band and
 *     faded toward the title so the type never sits on busy pixels.
 */

export const COVER_PAPER = "#FBFAF7";
export const COVER_ORANGE = "#CB3F28";
export const COVER_BLACK = "#141210";
export const COVER_GREY = "#6E6459";

/*
 * Cover type: The Year of Handicrafts at Black, bundled with the extension
 * (lib/fonts/handicrafts-black.woff2, declared in fonts.css).
 */
export const COVER_FONT_RTL = '"The Year of Handicrafts", "IBM Plex Sans Arabic", sans-serif';
export const COVER_FONT_LTR = '"The Year of Handicrafts", "IBM Plex Sans", Georgia, serif';
export const COVER_FONT_WEIGHT = 900;
// Footer metadata is small and dense; the display face is too heavy for it.
export const COVER_META_FONT = '"IBM Plex Sans Arabic", system-ui, sans-serif';

/*
 * A canvas draws with whatever faces the DOCUMENT has already loaded. @font-face
 * is lazy, so on the first cover — before any element has rendered in that face —
 * the draw silently falls back and the book ships with the wrong cover. Force
 * the load and wait for it.
 */
export async function ensureCoverFont() {
  try {
    if (typeof document === "undefined" || !document.fonts) return;
    await Promise.all([
      document.fonts.load(`${COVER_FONT_WEIGHT} 104px "The Year of Handicrafts"`, "جسر"),
      document.fonts.load(`500 40px "IBM Plex Sans Arabic"`, "جسر"),
    ]);
    await document.fonts.ready;
  } catch {
    /* a fallback face still produces a correct cover */
  }
}

/*
 * Patterns.
 *
 * Each draws into the artwork band (0,0,W,bandH) in orange on the white ground.
 * They are written against normalised proportions of W/bandH rather than fixed
 * pixels, so the same code is correct at every Kindle device width (see
 * devices.js) and for any preview size the popup renders at. This includes the
 * minimum-stroke-width floors below (Math.max(2, …) and friends): a hardcoded
 * pixel floor looks right only at the one width it was tuned for — relatively
 * thick on a narrow cover, relatively thin on a wide one — so every floor is
 * expressed as a fraction of W instead.
 */
const PATTERNS = {
  // Ruled staves that thin as they descend — a page settling into silence.
  rules(ctx, W, H) {
    const rows = 22;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      ctx.globalAlpha = 0.9 - t * 0.75;
      ctx.fillRect(0, H * (0.08 + t * 0.84), W, Math.max(W * 0.00125, H * 0.011 * (1 - t * 0.6)));
    }
    ctx.globalAlpha = 1;
  },

  // A dot field whose radius swells toward one corner: gravity, not wallpaper.
  dots(ctx, W, H) {
    const cols = 16;
    const step = W / cols;
    for (let x = step / 2; x < W; x += step) {
      for (let y = step / 2; y < H; y += step) {
        const d = Math.hypot(x / W - 0.15, y / H - 0.85);
        const r = Math.max(W * 0.000625, step * 0.34 * (1 - Math.min(1, d)));
        ctx.globalAlpha = 0.35 + 0.6 * (1 - Math.min(1, d));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  // Concentric arcs rising from below the trim — a rising sun / an open fan.
  arcs(ctx, W, H) {
    const cx = W * 0.5;
    const cy = H * 1.04;
    ctx.lineCap = "butt";
    for (let i = 0; i < 9; i++) {
      const r = H * (0.22 + i * 0.115);
      ctx.globalAlpha = 0.85 - i * 0.075;
      ctx.lineWidth = Math.max(W * 0.00125, H * 0.016);
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // Interlaced diagonals — a woven mesh, the densest of the set.
  weave(ctx, W, H) {
    const gap = W / 13;
    ctx.lineWidth = Math.max(W * 0.0009375, gap * 0.13);
    ctx.globalAlpha = 0.7;
    for (let i = -H; i < W + H; i += gap) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    for (let i = -H; i < W + H; i += gap) {
      ctx.beginPath();
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // Nested rectangles drifting off-centre — a frame within a frame.
  frames(ctx, W, H) {
    ctx.lineWidth = Math.max(W * 0.00125, W * 0.007);
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      ctx.globalAlpha = 0.85 - t * 0.65;
      const inset = W * 0.045 * i;
      ctx.strokeRect(inset * 0.7, inset * 0.5, W - inset * 1.9, H - inset * 1.4);
    }
    ctx.globalAlpha = 1;
  },

  // A half-tone column: solid at the spine, dissolving outward.
  column(ctx, W, H) {
    const bars = 34;
    const bw = W / bars;
    for (let i = 0; i < bars; i++) {
      const t = i / (bars - 1);
      ctx.globalAlpha = Math.max(0, 0.95 - t * 1.25);
      const h = H * (0.35 + 0.6 * (1 - t));
      ctx.fillRect(i * bw, H - h, bw * 0.62, h);
    }
    ctx.globalAlpha = 1;
  },

  // Sparse crosses on a loose grid — a printer's registration field.
  crosses(ctx, W, H) {
    const cols = 7;
    const step = W / cols;
    const arm = step * 0.16;
    ctx.lineWidth = Math.max(W * 0.00125, step * 0.045);
    ctx.globalAlpha = 0.75;
    for (let x = step / 2; x < W; x += step) {
      for (let y = step / 2; y < H; y += step) {
        ctx.beginPath();
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },

  // A single wide arch — the quietest option, closest to a plain jacket.
  arch(ctx, W, H) {
    ctx.lineWidth = Math.max(W * 0.001875, W * 0.022);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 1.12, W * 0.46, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 1.12, W * 0.62, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
};

// `image` means "use the article's own og:image"; it has no pattern function.
export const COVER_STYLES = [
  { id: "plain", label: "سادة", pattern: null },
  { id: "rules", label: "مسطَّر", pattern: "rules" },
  { id: "dots", label: "منقَّط", pattern: "dots" },
  { id: "arcs", label: "أقواس", pattern: "arcs" },
  { id: "weave", label: "نسيج", pattern: "weave" },
  { id: "frames", label: "أُطُر", pattern: "frames" },
  { id: "column", label: "أعمدة", pattern: "column" },
  { id: "crosses", label: "علامات", pattern: "crosses" },
  { id: "arch", label: "قوس", pattern: "arch" },
  { id: "image", label: "صورة المقال", pattern: null, usesLeadImage: true },
];

export function coverStyle(id) {
  return COVER_STYLES.find((s) => s.id === id) || COVER_STYLES[0];
}

/*
 * Keywords that lean a title toward a particular pattern. These are moods, not
 * subjects: the patterns are abstract, so the mapping asks "does this article
 * feel ordered, or dense, or expansive" rather than "is it about biology".
 * A title matching nothing falls through to a random pick, which is the point
 * of the button — it proposes, it does not classify.
 */
const STYLE_MOODS = {
  rules: ["دراسة", "بحث", "تقرير", "تحليل", "منهج", "study", "research", "report", "analysis", "method", "paper"],
  dots: ["بيانات", "إحصاء", "شبكة", "نموذج", "ذكاء", "data", "statistics", "network", "model", "ai", "machine"],
  arcs: ["تاريخ", "نشأة", "أصل", "تطور", "مستقبل", "history", "origin", "evolution", "future", "rise"],
  weave: ["مجتمع", "علاقة", "لغة", "ثقافة", "ترابط", "society", "language", "culture", "relation", "complex"],
  frames: ["فلسفة", "فكر", "وعي", "إدراك", "معنى", "philosophy", "mind", "consciousness", "meaning", "theory"],
  column: ["اقتصاد", "سوق", "نمو", "مال", "أعمال", "economy", "market", "growth", "money", "business"],
  crosses: ["تقنية", "برمجة", "هندسة", "خوارزم", "نظام", "technology", "software", "engineering", "algorithm", "system"],
  arch: ["طبيعة", "كون", "فضاء", "بيئة", "حياة", "nature", "universe", "space", "environment", "life"],
};

/*
 * Pick a style for "إنشاء غلاف": score each pattern by how many of its mood
 * words appear in the title, then choose randomly among the leaders. Ties —
 * including the common case where nothing matches and every pattern ties at
 * zero — resolve by chance rather than by silently favouring array order, so
 * pressing the button twice on an unmatched title gives two different covers.
 * "plain" and "image" are excluded: one is the absence of a choice, the other
 * depends on an image the page may not have.
 */
export function suggestCoverStyle(title) {
  const text = (title || "").toLowerCase();
  const ids = Object.keys(STYLE_MOODS);
  const scored = ids.map((id) => ({
    id,
    score: STYLE_MOODS[id].reduce((n, k) => n + (text.includes(k.toLowerCase()) ? 1 : 0), 0),
  }));
  const top = Math.max(...scored.map((s) => s.score));
  const leaders = top > 0 ? scored.filter((s) => s.score === top) : scored;
  const pick = leaders[Math.floor(Math.random() * leaders.length)];
  return (pick && pick.id) || "rules";
}

// Fraction of the cover height the artwork band occupies.
export const ART_BAND = 0.46;

/*
 * Draw the artwork band. Returns nothing; the caller lays type out below it.
 * `leadImage` is only consulted for the style that asks for it, and a failure to
 * load falls through to the plain ground rather than aborting the cover.
 */
export async function paintCoverArtwork(ctx, W, H, styleId, leadImage) {
  const style = coverStyle(styleId);
  const bandH = H * ART_BAND;

  ctx.fillStyle = COVER_PAPER;
  ctx.fillRect(0, 0, W, H);

  if (style.usesLeadImage && leadImage) {
    const ok = await paintLeadImage(ctx, W, bandH, leadImage);
    if (ok) return;
  }

  const draw = style.pattern && PATTERNS[style.pattern];
  if (!draw) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, bandH);
  ctx.clip();
  ctx.fillStyle = COVER_ORANGE;
  ctx.strokeStyle = COVER_ORANGE;
  draw(ctx, W, bandH);
  ctx.restore();
}

/*
 * The article's lead image, cropped to fill the band and faded out along its
 * lower edge so the black title below never abuts hard pixels.
 */
async function paintLeadImage(ctx, W, bandH, url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const bitmap = await createImageBitmap(await resp.blob());
    const scale = Math.max(W / bitmap.width, bandH / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, bandH);
    ctx.clip();
    ctx.drawImage(bitmap, (W - w) / 2, (bandH - h) / 2, w, h);
    const fade = ctx.createLinearGradient(0, bandH * 0.72, 0, bandH);
    fade.addColorStop(0, "rgba(251,250,247,0)");
    fade.addColorStop(1, COVER_PAPER);
    ctx.fillStyle = fade;
    ctx.fillRect(0, bandH * 0.72, W, bandH * 0.28);
    ctx.restore();
    if (bitmap.close) bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/* ── footer metadata ─────────────────────────────────────────────────────── */

const metaIconCache = new Map();

/*
 * Rasterise a footer icon.
 *
 * Deliberately NOT createImageBitmap: Chrome refuses to decode an SVG blob
 * through it ("The source image could not be decoded"), silently — the promise
 * rejects, the catch swallows it, and the cover ships with the icons simply
 * absent and no error anywhere. HTMLImageElement.decode() is the path that
 * actually rasterises SVG, so the drawing surface is an intermediate canvas of
 * the exact size we need.
 *
 * currentColor is substituted first: an <img> loaded from a blob URL is an
 * isolated document with no inherited CSS `color`, so Tabler's strokes would
 * otherwise resolve to black instead of the cover's orange.
 */
async function metaIcon(name, px) {
  const key = name + ":" + px;
  if (metaIconCache.has(key)) return metaIconCache.get(key);
  const p = (async () => {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) return null;
    if (typeof Image === "undefined" || typeof document === "undefined") return null;
    const resp = await fetch(chrome.runtime.getURL(`icons/meta/${name}.svg`));
    if (!resp.ok) return null;
    const svg = (await resp.text()).replace(/currentColor/g, COVER_ORANGE);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.width = px;
      img.height = px;
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      c.getContext("2d").drawImage(img, 0, 0, px, px);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch(() => null);
  metaIconCache.set(key, p);
  return p;
}

/*
 * Classify the document so the jacket can name its kind the way a real one does.
 * Deliberately conservative: only promotes past "مقال" on a clear signal.
 */
export function documentKind(article) {
  const t = `${article.title || ""} ${article.siteName || ""} ${article.url || ""}`.toLowerCase();
  if (article.strategy === "docx" || article.strategy === "markdown") return "مستند";
  if (/arxiv|doi\.org|jstor|pubmed|researchgate|\bpaper\b|دراسة|بحث|ورقة علمية/.test(t)) return "بحث";
  if (/\bbook\b|chapter|كتاب|فصل من/.test(t)) return "كتاب";
  if (/interview|حوار|مقابلة/.test(t)) return "حوار";
  if (/essay|مقالة|مقال/.test(t)) return "مقال";
  return "مقال";
}

/*
 * Footer plate: an orange rule, then one line of metadata items, each an icon
 * followed by its text, laid out along a single baseline from the reading edge.
 * Items with no value are skipped entirely rather than rendered empty.
 */
export async function paintCoverFooter(ctx, W, H, article, isRtl) {
  // A slightly narrower margin than the title block. The footer is a service
  // line, not body copy, and measured at the title's margin the four items
  // overflow by ~9px — losing the source entirely to the fit check rather than
  // to any real lack of room.
  const margin = W * 0.078;
  const iconPx = Math.round(W * 0.028);
  const fontPx = Math.round(W * 0.029);
  const gap = W * 0.012;
  // Tightened so all four items (kind, author, date, source) survive the fit
  // check on a normal cover — the icons cost real width that the earlier,
  // icon-less spacing had not budgeted for.
  const itemGap = W * 0.038;
  const baseY = H - margin * 0.95;

  ctx.save();
  ctx.fillStyle = COVER_ORANGE;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(margin, baseY - iconPx * 2.6, W - margin * 2, Math.max(2, H * 0.0022));
  ctx.globalAlpha = 1;

  let host = article.siteName || "";
  if (!host && article.url) {
    try {
      host = new URL(article.url).hostname.replace(/^www\./, "");
    } catch (e) {
      host = "";
    }
  }

  const items = [
    { icon: "file-text", text: documentKind(article) },
    { icon: "user", text: (article.byline || "").trim() },
    { icon: "calendar", text: (article.date || "").trim() },
    { icon: "world", text: host },
  ].filter((i) => i.text);

  ctx.font = `500 ${fontPx}px ${COVER_META_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.direction = isRtl ? "rtl" : "ltr";

  // Measure first so the row can be laid out from the reading edge inward
  // without the icons and text drifting apart on either script direction.
  const measured = [];
  for (const item of items) {
    const bitmap = await metaIcon(item.icon, iconPx);
    measured.push({ ...item, bitmap, textW: ctx.measureText(item.text).width });
  }

  // Drop trailing items that will not fit rather than letting the row run off
  // the trim: a metadata line clipped mid-word looks like a rendering bug, and
  // the earlier items (kind, author) matter more than the last (source).
  const avail = W - margin * 2;
  const fitted = [];
  let used = 0;
  for (const m of measured) {
    const itemW = (m.bitmap ? iconPx + gap : 0) + m.textW;
    const withGap = fitted.length ? itemGap + itemW : itemW;
    if (used + withGap > avail) break;
    used += withGap;
    fitted.push({ ...m, itemW });
  }

  let cursor = isRtl ? W - margin : margin;
  for (const m of fitted) {
    const startX = isRtl ? cursor - m.itemW : cursor;
    // An icon that failed to load must not leave a hole — the text simply takes
    // the whole item width instead.
    if (m.bitmap) {
      ctx.drawImage(m.bitmap, isRtl ? cursor - iconPx : startX, baseY - iconPx * 0.82, iconPx, iconPx);
    }
    const textEdge = m.bitmap ? (isRtl ? cursor - iconPx - gap : startX + iconPx + gap) : (isRtl ? cursor : startX);
    ctx.fillStyle = COVER_GREY;
    ctx.textAlign = isRtl ? "right" : "left";
    ctx.fillText(m.text, textEdge, baseY);
    cursor = isRtl ? startX - itemGap : cursor + m.itemW + itemGap;
  }
  ctx.restore();
}
