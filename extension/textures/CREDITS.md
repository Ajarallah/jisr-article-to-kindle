# Cover assets

Photographs from [Unsplash](https://unsplash.com/license), reduced to a duotone
of the brand inks and compressed to 640×960. The Unsplash licence permits
bundling inside an application; it does not permit reselling the images or using
them to build a competing stock-photo service.

Attribution is not required by the licence. It is recorded here so the origin of
every shipped asset is verifiable.

| File | Unsplash photo |
|---|---|
| `paper.jpg` | [a close up of a piece of white paper](https://unsplash.com/photos/a-close-up-of-a-piece-of-white-paper-NxbuURLQqp8) |
| `plaster.jpg` | [white textured paper or plaster surface](https://unsplash.com/photos/white-textured-paper-or-plaster-surface-k4Lt0CjUnb0) |
| `parchment.jpg` | [crumpled beige parchment paper texture](https://unsplash.com/photos/crumpled-beige-parchment-paper-texture-XFWiZTa2Ub0) |
| `linen.jpg` | [plain white woven textile texture](https://unsplash.com/photos/plain-white-woven-textile-texture-MS9Tnh3if1o) |
| `concrete.jpg` | [brown and black concrete floor](https://unsplash.com/photos/brown-and-black-concrete-floor-XRTlS6TYK1M) |
| `ink.jpg` | [white and black smoke illustration](https://unsplash.com/photos/white-and-black-smoke-illustration-3q3O3QftPVo) |

To re-export after changing `COVER_INK`, convert each source to greyscale,
autocontrast, colorize black→ink / white→paper, then blend 72% flat ink over it.

---

## Cover typeface

`../lib/fonts/handicrafts-black.woff2` — **The Year of Handicrafts**
(عام الحرف اليدوية), Black. Designed by Ahmed Zaza / iwantype.com and released
free to use as part of the Saudi Ministry of Culture's year-initiative typefaces.
Converted from the distributed OTF to WOFF2 for weight (248 KB → 69 KB); only the
Black weight ships, since it is the only one the cover uses.

Bundling matters beyond convenience: a canvas can only draw with faces the
document has already loaded, so shipping the file is what makes the generated
EPUB cover match its preview on every machine rather than only on one with the
font installed.
