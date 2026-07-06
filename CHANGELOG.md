# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added
- Chrome MV3 extension: extract the current article (Readability), build a clean
  **EPUB3** in the browser with right-to-left support and an embedded Arabic font.
- Optional **AI translation** before sending (client-side, via OpenRouter with the
  user's own key). Arabic output follows فصحى وسطى, no diacritics.
- **Send to Kindle via the user's Amazon session** (cookies + anti-CSRF), replicating
  the official Send-to-Kindle mechanism — no email, no approved-sender, no server.
- Fully Arabic, right-to-left UI with a restrained visual design.
- Chrome Web Store assets: privacy policy, listing copy, packaging script.
- Unit tests: EPUB pipeline (Arabic RTL + LTR) and the legacy STK signing.

### Architecture notes
- Delivery moved from email → Amazon Send-to-Kindle, then from a reverse-engineered
  server-side OAuth flow → a single-extension client-side flow using the user's
  Amazon login. See `docs/DECISIONS.md` (D9–D11) and
  `docs/03-official-s2k-mechanism.md`.
- The `server/` (email fallback + legacy STK OAuth) is retained as optional/legacy;
  the default product is a single, serverless extension.

### Pending
- One live end-to-end verification of delivery against a signed-in Amazon account.
