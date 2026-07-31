// Regenerate extension icons:  cd server && node gen-icons.mjs
//
// 16px uses its own simplified artwork (icons/icon16.svg). Downscaling the full
// cover mark to 16px merges its three bars into a smudge — the same failure the
// previous poster-art icon had. Optical sizing, not resizing.
import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const full = fs.readFileSync(new URL("../extension/icons/icon.svg", import.meta.url));
const small = fs.readFileSync(new URL("../extension/icons/icon16.svg", import.meta.url));

for (const s of [16, 48, 128]) {
  const out = fileURLToPath(new URL(`../extension/icons/icon${s}.png`, import.meta.url));
  const src = s === 16 ? small : full;
  await sharp(src, { density: s === 16 ? 96 : 288 }).resize(s, s).png().toFile(out);
}
console.log("icons regenerated: 16 (simplified) / 48 / 128");
