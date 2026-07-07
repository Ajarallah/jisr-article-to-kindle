// Regenerate extension icons from icon.svg:  cd server && node gen-icons.mjs
import sharp from "sharp";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const svg = fs.readFileSync(new URL("../extension/icons/icon.svg", import.meta.url));
for (const s of [16, 48, 128]) {
  const out = fileURLToPath(new URL(`../extension/icons/icon${s}.png`, import.meta.url));
  await sharp(svg, { density: 288 }).resize(s, s).png().toFile(out);
}
console.log("icons regenerated: 16/48/128");
