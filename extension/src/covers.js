/*
 * Cover backgrounds.
 *
 * Real photographic texture — paper, plaster, linen, parchment, concrete, ink in
 * water — not scenes. A photograph with a subject fights the title for
 * attention and ties the cover to a topic, which is wrong when the same six
 * options must suit an article about psychology and one about compilers. Texture
 * carries the depth of a real photo while staying subject-neutral.
 *
 * They ship already reduced to a duotone of the brand inks, which does three
 * jobs at once: the cover still reads as vermilion rather than as a photo, the
 * title stays the brightest thing on the page, and a single-hue image compresses
 * far harder than a grey one. All six weigh 276 KB together at 640x960 — small
 * because the canvas upscales them, and the softness that causes is wanted in a
 * backdrop.
 *
 * Because the duotone is baked in, changing COVER_INK means re-exporting the
 * textures; that trade buys identical rendering in the popup and the EPUB with
 * no runtime processing in either.
 *
 * Sources: Unsplash (unsplash.com/license — bundling inside an application is
 * permitted; reselling the images or building a competing stock service is not).
 * Photo ids are listed in textures/CREDITS.md.
 */

export const COVER_INK = "#CB3F28";
export const COVER_TEXT = "#F7F2E7";

/*
 * Cover type. The cover is rasterised to JPEG, so the typeface becomes pixels
 * and no font file is ever distributed — that is design work, which font
 * licences permit even when they forbid shipping the font itself.
 * "The Year of Handicrafts" at Black is the intended face; it has to be
 * installed on the reader's machine, and Plex carries everyone else.
 */
export const COVER_FONT_RTL = '"The Year of Handicrafts", "IBM Plex Sans Arabic", sans-serif';
export const COVER_FONT_LTR = '"The Year of Handicrafts", "IBM Plex Sans", Georgia, serif';
export const COVER_FONT_WEIGHT = 900;

export const COVER_STYLES = [
  { id: "plain", label: "سادة", texture: null },
  { id: "paper", label: "ورق", texture: "paper.jpg" },
  { id: "plaster", label: "جصّ", texture: "plaster.jpg" },
  { id: "parchment", label: "رَقّ", texture: "parchment.jpg" },
  { id: "linen", label: "كتّان", texture: "linen.jpg" },
  { id: "concrete", label: "خرسانة", texture: "concrete.jpg" },
  { id: "ink", label: "حبر", texture: "ink.jpg" },
];

export function coverStyle(id) {
  return COVER_STYLES.find((s) => s.id === id) || COVER_STYLES[0];
}

// Extension-relative URL for a style's texture, or null for the plain cover.
// Outside the extension (test harness) there is no runtime, so callers fall back
// to the flat ink.
export function textureUrl(style) {
  if (!style || !style.texture) return null;
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) return null;
  return chrome.runtime.getURL("textures/" + style.texture);
}

/*
 * Paint the background onto a cover canvas: the flat ink first so a texture that
 * fails to load still leaves a correct cover, then the texture scaled to cover
 * the canvas (centre-cropped, never stretched).
 */
export async function paintCoverBackground(ctx, W, H, styleId) {
  ctx.fillStyle = COVER_INK;
  ctx.fillRect(0, 0, W, H);
  const url = textureUrl(coverStyle(styleId));
  if (!url) return;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const bitmap = await createImageBitmap(await resp.blob());
    const scale = Math.max(W / bitmap.width, H / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (W - w) / 2, (H - h) / 2, w, h);
    if (bitmap.close) bitmap.close();
  } catch {
    /* a missing texture is cosmetic — the flat ink underneath is already correct */
  }
}
