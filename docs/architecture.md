# Jisr architecture

This document describes the current `0.3.x` implementation. Historical research and superseded decisions remain in the numbered documents under `docs/`; the code and this file are the source of truth for the current runtime.

## Runtime boundary

Jisr is a serverless Chrome Manifest V3 extension. The product runs from `extension/`. The directory named `server/` is only a Node.js test, lint, and asset-generation harness; it is not started by users and is not part of delivery.

```text
┌──────────────────────────── Chromium extension ────────────────────────────┐
│                                                                            │
│  Active tab ── extract.js ──► clean article + metadata                     │
│                                  │                                         │
│                     translate.js / glossary.js (optional)                  │
│                                  │                                         │
│                     epub.js + covers.js ──► EPUB Blob                      │
│                                  │                                         │
│                     preview.js ──┴── deliver.js                            │
│                                         │                                  │
└─────────────────────────────────────────┼──────────────────────────────────┘
                                          ▼
                         Amazon Send to Kindle + S3 upload
```

No Jisr-operated service receives the article or EPUB in this path.

## Main components

| Component | Responsibility |
|---|---|
| `popup.js` | Orchestrates extraction, options, translation, preview, download, and delivery |
| `extract.js` | Runs against the active page, uses Readability, applies extraction fallbacks, and detects language/direction |
| `translate.js` | Batches text for OpenRouter, preserves order, retries recoverable failures, and supports cancellation |
| `glossary.js` | Selects difficult terms and produces EPUB footnotes/endnotes |
| `epub.js` | Builds single-article and multi-article EPUB3 packages with metadata, navigation, chapters, fonts, and images |
| `covers.js` / `devices.js` | Generates cover artwork at Kindle-specific dimensions |
| `preview.js` | Renders a sandboxed pre-send reader and exposes send/download actions |
| `deliver.js` | Uses the signed-in Amazon session to initialize upload, PUT the EPUB to S3, and enqueue Send to Kindle delivery |
| `settings.js` | Defines defaults and separates synced preferences from local secrets |
| `readinglist.js` / `history.js` | Keeps queued article content and recent-send metadata in local extension storage |
| `dropconvert.js` | Converts Markdown and Word input into article-shaped content for the EPUB pipeline |

## Core flows

### Article to Kindle

1. The user opens the popup on an active tab.
2. `chrome.scripting` injects Readability and `extract.js` into that tab.
3. The popup optionally requests per-site permission to fetch article images.
4. Translation and glossary processing run only if enabled.
5. `epub.js` builds the EPUB Blob in memory and validates generated chapter XML.
6. The user previews, downloads, or sends the same built artifact.
7. `deliver.js` authenticates through the existing Amazon browser session, obtains a pre-signed upload URL, uploads the EPUB to Amazon S3, and enqueues delivery.

### File to Kindle

1. `drop.html` accepts `.md`, `.markdown`, or `.docx` input.
2. Marked or Mammoth converts it into sanitized HTML.
3. The content enters the same cover, EPUB, preview, download, and delivery pipeline as an article.

### Reading-list book

1. Extracted articles are slimmed and stored in `chrome.storage.local` (maximum 20).
2. `bundle.js` lets the user reorder or remove entries.
3. `epub.js` creates one chapter per article plus combined navigation.

## Data and trust boundaries

| Data | Storage or destination |
|---|---|
| Preferences | `chrome.storage.sync`; may sync through the user's Chrome profile |
| OpenRouter API key | `chrome.storage.local`; never placed in sync storage |
| Reading-list article HTML | `chrome.storage.local`; capped and removable by the user |
| Send history | `chrome.storage.local`; metadata only, capped at 50 entries |
| Amazon authentication | Browser-managed Amazon cookies; Jisr does not copy or persist them |
| EPUB upload | Directly to the Amazon-provided S3 URL |
| Article text for AI features | OpenRouter, only when translation or glossary is enabled |

The optional bundled development key lives in `extension/src/secrets.js`, which is excluded from Git. It is suitable only for personal unpacked builds. A public store package must use a publisher-controlled proxy or require the user's own key, because extension packages are inspectable.

## Permissions

- `activeTab` and `scripting`: access the current page after an explicit click.
- `storage` and `unlimitedStorage`: preferences, reading-list content, preview handoff, and local history.
- Amazon marketplace hosts: session checks and Send to Kindle control requests.
- `*.amazonaws.com`: the pre-signed S3 EPUB upload.
- `openrouter.ai`: optional translation and glossary requests.
- `https://*/*` as an optional permission: granted per origin when the user elects to embed remote article images.

## Development and verification

The extension uses vendored browser libraries and loads directly from `extension/`; there is no bundler. The Node harness under `server/` imports extension modules into tests and runs ESLint.

```bash
cd server
npm ci
npm run lint
npm test
```

CI runs the same lint and test commands on every pull request and every push to `main`. `scripts/package-extension.sh` creates the distributable ZIP while excluding development-only and secret files.

## Known external risk

Amazon's Send to Kindle endpoints are private and undocumented. Jisr mirrors the web flow used by Amazon, but Amazon may change it without notice. EPUB download therefore remains a permanent, user-controlled fallback.
