/*
 * Cover backgrounds.
 *
 * Drawn, not shipped. Every style is a few canvas operations and a matching CSS
 * background — no raster assets, so the extension gains nothing in weight, the
 * pattern adapts to any title length, and there is no third-party image licence
 * to carry.
 *
 * The two renderings live side by side ON PURPOSE. The popup shows the cover as
 * a live preview of the EPUB, so the CSS and the canvas must agree; keeping them
 * in one object is what makes a mismatch obvious when either is edited.
 *
 * All of them keep the brand vermilion and stay flat: hairlines, dots and a
 * single arc. No gradients, no glow, no imagery competing with the title.
 */

export const COVER_INK = "#CB3F28";
export const COVER_TEXT = "#F7F2E7";

// Cover text is drawn to a raster image, so the typeface is rasterised into
// pixels and no font file is ever distributed. Thmanyah is used when the reader
// has it installed and Plex carries everyone else.
export const COVER_FONT_RTL = '"thmanyah serif display", "IBM Plex Sans Arabic", serif';
export const COVER_FONT_LTR = '"thmanyah serif display", "IBM Plex Sans", Georgia, serif';

const LINE = "rgba(247,242,231,0.22)";
const LINE_CSS = "rgba(247,242,231,0.22)";

export const COVER_STYLES = [
  {
    id: "plain",
    label: "سادة",
    css: "",
    draw() {},
  },
  {
    id: "rules",
    label: "مسطَّر",
    // Ruled paper: the page the article becomes.
    css: `repeating-linear-gradient(to bottom, transparent 0 13px, ${LINE_CSS} 13px 14px)`,
    draw(ctx, W, H) {
      ctx.fillStyle = LINE;
      for (let y = 0; y < H; y += 88) ctx.fillRect(0, y, W, 5);
    },
  },
  {
    id: "grid",
    label: "شبكة",
    css: `repeating-linear-gradient(to bottom, transparent 0 15px, ${LINE_CSS} 15px 16px), repeating-linear-gradient(to right, transparent 0 15px, ${LINE_CSS} 15px 16px)`,
    draw(ctx, W, H) {
      ctx.fillStyle = LINE;
      for (let y = 0; y < H; y += 96) ctx.fillRect(0, y, W, 4);
      for (let x = 0; x < W; x += 96) ctx.fillRect(x, 0, 4, H);
    },
  },
  {
    id: "dots",
    label: "منقَّط",
    // background-image alone cannot carry the `/ size` shorthand, so the tile
    // size travels separately (see `size` handling in the popup picker).
    css: `radial-gradient(${LINE_CSS} 1.1px, transparent 1.2px)`,
    size: "14px 14px",
    draw(ctx, W, H) {
      ctx.fillStyle = LINE;
      const step = 84;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: "arch",
    label: "قوس",
    // One large arc rising from the foot of the cover. A single geometric
    // gesture, not ornament.
    css: `radial-gradient(circle at 50% 118%, transparent 0 42%, ${LINE_CSS} 42% 42.7%, transparent 43%)`,
    draw(ctx, W, H) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(W / 2, H * 1.18, W * 0.62, Math.PI, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    id: "margin",
    label: "هامش",
    // A printer's margin rule down the binding edge.
    css: `linear-gradient(to left, transparent 0 calc(100% - 26px), ${LINE_CSS} calc(100% - 26px) calc(100% - 25px), transparent calc(100% - 25px))`,
    draw(ctx, W, H) {
      ctx.fillStyle = LINE;
      ctx.fillRect(W - 168, 0, 5, H);
    },
  },
];

export function coverStyle(id) {
  return COVER_STYLES.find((s) => s.id === id) || COVER_STYLES[0];
}
