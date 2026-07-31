/*
 * Bundled translation key — template.
 *
 * Copy this file to `secrets.js` (git-ignored) and paste your NVIDIA key. The
 * extension then has translation switched on out of the box; a key the user
 * enters themselves still wins over this one.
 *
 *     cp extension/src/secrets.example.js extension/src/secrets.js
 *
 * settings.js imports this dynamically and tolerates the file being absent, so
 * a fresh clone runs fine without it — translation simply stays off until a key
 * exists.
 *
 * WARNING — before publishing to the Chrome Web Store: a key shipped inside an
 * extension is NOT secret. The package is a plain zip; anyone can unpack it and
 * read this file, then spend your quota. This is fine for a personal/unpacked
 * build. For a public release, put the key behind a proxy you operate and point
 * `translationEndpoint` at it instead.
 */

export const TRANSLATION_KEY = "";
