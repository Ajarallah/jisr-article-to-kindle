# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Changed — translation is on by default

- **Translation and the study glossary now work out of the box.** The build
  carries an NVIDIA key in `extension/src/secrets.js` (git-ignored; copy
  `secrets.example.js`), and `loadSettings()` falls back to it. A key the user
  enters themselves still wins. The "coming soon" messages are gone.
- **Model is now `deepseek-ai/deepseek-v4-flash`** (was `z-ai/glm-5.2`), with
  `deepseek-v4-pro` as the fallback.
- **Batches translate concurrently** (3 in flight, results written by index so
  source order is preserved). Wall time was batches × latency; a long article
  over a slow endpoint was an unusable wait.
- **A model that times out is abandoned after one attempt** instead of being
  retried three times. Measured against the live endpoint, `deepseek-v4-flash`
  is currently not answering at all: three 30s timeouts burned 90 seconds per
  batch before the fallback got its turn. A network error is still retried.

**Note for the operator:** a key shipped inside an extension is not secret — the
package is a plain zip. This is fine for a personal/unpacked build; before any
store release, move the key behind a proxy and repoint `translationEndpoint`.


### Changed — visual identity ("الغلاف")

- **The popup's top block is now the book cover itself.** Same vermilion, same
  typographic layout, same title/source lines that `generateCoverJpeg()` paints
  into the EPUB — so the popup previews the artifact instead of decorating it.
  Editing the title (and now the author) edits the cover you are about to send.
- **New palette, replacing the blue/lime identity**: paper `#F3EEE3`, ink
  `#191713`, cover vermilion `#CB3F28`. Printed language throughout — flat inks,
  hairline rules, square corners, no surface shadows. The only shadow left in the
  system is the preview sheet, which is paper lifted off a desk.
- **Shared `src/tokens.css`** now holds the palette; `options.css` became the
  shared page system for the full-tab screens, and `drop.css` shrank to just its
  dropzone (it had been duplicating the whole system).
- **Toolbar icon is the cover in miniature** — and 16px gets its own simplified
  artwork (`icons/icon16.svg`, two bars on whole pixels) because downscaling the
  full mark merged its bars into a smudge. Optical sizing, not resizing.
- The region picker draws in brand vermilion instead of the retired blue.

**Typeface decision:** the UI stays on IBM Plex Sans Arabic (vendored, OFL-1.1).
Thmanyah was evaluated and rejected for shipping — its licence forbids embedding
the font anywhere a third party can extract it, and an unpacked extension is a
plain zip. Amiri is no longer used in any UI surface; it remains embedded *inside
generated EPUBs* purely for Kindle Arabic shaping, which is unrelated.

### Added
- **Book customization** — a "تخصيص الكتاب" panel: Arabic font (embed Amiri or
  Kindle's native), font size, line spacing, margins, justify, cover on/off, and
  a safe "clean Arabic" option that strips decorative tatweel from scraped text.
- **Professional UI redesign** across every screen (popup, settings, drop,
  preview, reading-list) — soft shadowed surfaces, subtle grain, tinted depth,
  press micro-interactions, and a calmer organized layout, on the existing brand.
- **Bilingual / interleaved EPUB** — a study mode that keeps the original and
  places its translation after each block (original LTR, translation Arabic RTL,
  each with correct direction). No competitor offers this — it turns a clean
  reprint into a language-learning artifact.
- **Study-mode glossary** — AI-picked hard terms become native Kindle popup
  footnotes with a short Arabic gloss (falling back to linked endnotes on
  devices without popups).
- **Edit title/author before send**, and real publish-date/author pulled from
  the page's metadata (meta tags / JSON-LD) into the book.
- **Optional image embedding** — off by default (EPUBs stay text-only). Turn it
  on in Settings and the browser asks for permission to read images from article
  sites; `epub.js` then fetches and embeds them. Previously the extension always
  tried to embed but never had the permission, so images were silently dropped.
- **Auto-generated cover** — a typographic cover (brand blue, RTL-aware, title +
  source) so the Kindle library shows a real thumbnail, not a placeholder.
- **Navigable table of contents** — the EPUB now builds its TOC from the
  article's headings instead of a single flat entry.
- **Lazy-loaded images are captured** — `data-src`/`srcset`/`<noscript>` images
  are resolved before extraction, so image-heavy pages no longer come out blank.
- **Reading-list bundles** — queue several articles ("أضِف للقائمة") and compile
  them into one multi-chapter EPUB (a compiled "issue") with a combined TOC.
- **Send selection only** — when text is selected on the page, send just that.
- **Manual region picker** — hover-and-click to pick the content area when
  auto-extraction misses.
- **Send history** — a local list of what you sent, in Settings, each linking
  back to its source to resend.
- **Auto-detect Amazon domain** — finds the marketplace you're signed in to
  instead of hand-editing the domain.
- **Footnote popups** — numeric/superscript footnote refs get `epub:type` so
  supporting readers show a popup (and still work as links elsewhere).

### Changed
- **Reliability** — every network request (Amazon delivery, S3 upload,
  translation, image fetch) now has a timeout and can be cancelled, so a hung
  connection no longer spins forever. Oversize books (>50 MB) are caught before
  upload with a clear message; offline is no longer mistaken for logged-out.
- **Arabic rendering** — headings re-declare RTL, code/inline-English is isolated
  so it can't corrupt Arabic punctuation, line-height is looser, and
  letter-spacing (which breaks Arabic joining) is pinned off. Language tags are
  lowercased and region-simplified (en-US → en) so Amazon doesn't reject the file.
- **Kindle robustness** — every chapter is validated as well-formed XML before
  packing (malformed XHTML makes Amazon silently drop the font/CSS); stray `�`
  chars are stripped; relative links/images are made absolute so they don't die
  once the EPUB leaves the browser; anchor-wrapped thumbnails use the full image.
- **If delivery fails**, the built EPUB is offered for download plus a link to
  Amazon's official Send-to-Kindle as a resilient fallback.
- **Long-article translation** no longer fails on dense Arabic (RTL-aware
  batching + a larger output budget), and shows per-batch progress.
- **NVIDIA API key now stored in `chrome.storage.local`** instead of `sync`, so
  the secret no longer roams to Google's cloud or your other devices. Any key
  from an older build is migrated automatically.
- **Toolbar icon** is a simple open-book glyph that stays legible at 16px (the
  previous 16px icon was dense poster art that collapsed into a smudge).

- **Image permission is now per-site** — enabling images requests access to just
  the current article's origin at send time, not all sites.
- **Code blocks & tables** are styled and preserved through conversion.

### Accessibility
- Status/progress regions announce to screen readers (`role="status"`,
  `aria-live`).

### Removed
- The dead `server/` prototype (email fallback + legacy STK OAuth + server-side
  translate) is gone — the product has been a fully serverless extension for
  several versions. `server/` now holds only the Node test + lint harness. **If
  you ran the old server, rotate the NVIDIA/OpenROUTER key that was in
  `server/.env` and delete that file.**

### Internal
- Settings (`DEFAULT_SETTINGS`, `sanitizeFilename`, load/save) consolidated into
  a single `src/settings.js`, ending the three-way duplication across popup,
  drop and options.
- New `src/net.js` (timeout/cancel helper) and first-ever test coverage for the
  Amazon delivery flow; tolerant CSRF parsing replaces a byte-exact regex.
- ESLint flat config + GitHub Actions CI (lint + tests on every push/PR).
- i18n scaffold (`_locales/ar` default + `_locales/en`).

## [0.3.0] — 2026-07-07

### Changed
- **Rebrand to «جسر» (Jisr — "bridge").** New name, new toolbar icon (the brand
  key art from image 2), and a new identity palette across the whole extension UI:
  royal blue `#3644ED` with a lime `#AEF769` highlight accent (was teal). White-on-
  blue contrast verified at 6.55:1 (AA). The «جسر» wordmark carries the brand's
  signature lime highlighter in each header.
- **UI font → IBM Plex Sans Arabic** (vendored woff2, OFL-1.1, weights 400/500/
  600/700). Loaded via `src/fonts.css`; Latin terms fall back to the system stack.

## [0.2.1] — 2026-07-07

### Added
- **Preview before send** — a reader-style view of the built article (RTL-aware,
  showing your translation) with Send / Download, before it goes to your Kindle.
  Mirrors Amazon's "Preview and send". Opened from the popup. Content renders in a
  sandboxed iframe (no script execution).

## [0.2.0] — 2026-07-07

### Added
- **Drag & drop files** — drop a Markdown (`.md`) or Word (`.docx`) file (e.g. a
  ChatGPT answer you exported) onto the extension and it becomes a clean EPUB on
  your Kindle. Markdown via `marked`, `.docx` via `mammoth`.
- **Robust two-strategy extraction** — Readability plus a **main-region fallback**
  for pages that split content across sibling containers (AWS/AEM "what-is" pages):
  such a page went from 17 extracted paragraphs to the full 60.
- **Content-based whole-document direction** — Arabic prose with inline English
  terms now stays fully RTL; English with stray Arabic stays LTR.

### Changed
- **Translation backend → NVIDIA** with model **`z-ai/glm-5.2`**, chosen after
  benchmarking five models on Arabic translation (quality + speed + reliability).
  Falls back to `deepseek-v4-pro`; retries transient free-tier rate-limits.
  (Was OpenRouter.) BYO key, stored locally.

### Verified
- **Delivery is confirmed working end-to-end** — a real article was sent and
  arrived on a Kindle via the Amazon-session flow.
- 14 automated tests: EPUB pipeline, extraction (multi-container / blog / RTL),
  direction, drag-and-drop (md + docx), STK signing.

## [0.1.0]

### Added
- Chrome MV3 extension: extract the current article (Readability), build a clean
  **EPUB3** in the browser with right-to-left support and an embedded Arabic font.
- Optional **AI translation** before sending (client-side, BYO key).
- **Send to Kindle via the user's Amazon session** (cookies + anti-CSRF), replicating
  the official Send-to-Kindle mechanism — no email, no approved-sender, no server.
- Fully Arabic, right-to-left UI with a restrained visual design.
- Chrome Web Store assets: privacy policy, listing copy, packaging script.

### Architecture notes
- Delivery moved from email → Amazon Send-to-Kindle, then from a reverse-engineered
  server-side OAuth flow → a single-extension client-side flow using the user's
  Amazon login. See `docs/DECISIONS.md` (D9–D12) and
  `docs/03-official-s2k-mechanism.md`.
- The `server/` (email fallback + legacy STK OAuth) is retained as optional/legacy;
  the default product is a single, serverless extension.
