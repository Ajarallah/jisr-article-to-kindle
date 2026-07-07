# Changelog

All notable changes to this project are documented here.

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
