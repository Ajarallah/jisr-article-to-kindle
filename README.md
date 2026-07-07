# Article to Kindle

Turn any article you're reading into a clean **EPUB** and send it straight to your
Kindle — in one click, from a **single browser extension**. First-class
**Arabic / right‑to‑left** support and optional **AI translation** are built in.

No email. No "approved sender" list. No companion app. No server. It works the
same way Amazon's own *Send to Kindle* extension does: through the Amazon account
you're already signed into.

---

## Why this exists

Every "send to Kindle" tool falls into one of two camps:

- **Email-based** (Push to Kindle, Instapaper, KTool, Readwise): you must add an
  approved sender address in Amazon, configure email, and your article passes
  through a third‑party server. Fiddly, and not private.
- **Amazon's official extension**: clean and serverless — but it doesn't do clean
  Arabic (RTL) rendering, and it can't translate.

Article to Kindle takes the **clean, serverless delivery** of Amazon's own
extension and adds the two things it lacks: **proper Arabic** and **AI
translation**.

## Features

- **One‑click send** to your Kindle library (syncs to every device + the Kindle app).
- **Robust extraction** — Mozilla Readability with a **main-region fallback** for
  pages that split content across sibling containers (e.g. AWS/AEM "what-is"
  pages), where naive extractors grab only the first section. Works on
  paywalled / logged-in pages you can already read (it reads the rendered page).
- **Clean EPUB3** output — not Amazon's lossy web capture.
- **Arabic & RTL done right** — content-based whole-document direction,
  `page-progression-direction`, `dir="rtl"`, and an **embedded Amiri font** so
  Arabic never renders as empty boxes on Kindle. Inline English inside Arabic
  renders correctly.
- **Optional AI translation** before sending (English ⇄ Arabic and more), via
  NVIDIA (`glm-5.2`), with a literary Arabic style: فصحى وسطى, no tashkeel.
- **Drag & drop files** — drop a Markdown (`.md`) or Word (`.docx`) file (e.g. a
  ChatGPT answer you exported) and it becomes a clean EPUB on your Kindle.
- **Preview before send** — see the built article (and your translation) in a
  reader view before it goes to your Kindle.
- **Download EPUB** instead of sending, any time.
- **Private by design** — see [Privacy](#privacy).

## How it works

```
┌──────────────┐   Readability    ┌──────────────┐   your Amazon    ┌──────────────┐
│  the article │ ───────────────▶ │  clean EPUB3 │ ───  session ──▶ │ Kindle library│
│ (in browser) │   (+ translate)  │ (in browser) │  (cookies+CSRF)  │  (all devices)│
└──────────────┘                  └──────────────┘                  └──────────────┘
```

Delivery replicates Amazon's official *Send to Kindle* web flow, **verified
byte‑for‑byte against the official extension's source (v2.1.1.7)**:

1. `GET /sendtokindle/empty` → scrape the anti‑CSRF token; `GET
   /sendtokindle/extension/checkAuth` → confirm you're signed in.
2. `POST /sendtokindle/init` → a pre‑signed S3 upload URL + an `stkToken`.
3. `PUT` the EPUB bytes to S3.
4. `POST /sendtokindle/send-v2` → Amazon converts and delivers to your library.

All of this runs **inside the extension**, authenticated by the amazon.com session
you're already logged into — exactly like Amazon's own extension. There is **no
server** in the delivery path.

## Install (developer mode)

```
1. Clone this repo.
2. Open your browser's extensions page (brave://extensions or chrome://extensions).
3. Enable "Developer mode".
4. "Load unpacked" → select the extension/ folder.
5. Make sure you're signed in to Amazon in the same browser.
```

A packaged zip for the Web Store is produced by `scripts/package-extension.sh`.

## Usage

1. Open any article.
2. Click the **المقال إلى كندل** toolbar icon.
3. (Optional) toggle **translate** and pick a language.
4. **إرسال إلى كندل** (Send to Kindle) — it appears on your Kindle in a minute or two.
   Or **تنزيل EPUB** to just save the file.

To send a **file** instead of a page, click *"أرسِل ملفًّا (md / docx)"* in the
popup and drop your file. To review the article (and its translation) before it
goes to your Kindle, click *"معاينة قبل الإرسال"*.

### Translation (bring your own key)

Translation is optional and uses your own [NVIDIA](https://build.nvidia.com) API
key (`nvapi-…`), stored locally in the browser. The default model is `z-ai/glm-5.2`
— picked after benchmarking five models on Arabic translation for quality, speed,
and reliability (see [`docs/05`](docs/05-translation-model-selection.md)); it
falls back to `deepseek-v4-pro` and retries transient rate-limits. When enabled,
the article text is sent directly from your browser to NVIDIA — never to us.

## Privacy

In normal use the extension talks to exactly two places, both yours:

- **Amazon** — your own account, to deliver the file (same as Amazon's extension).
- **OpenRouter** — only if you turn on translation, with your own key.

No server operated by this project sits in the path. No analytics, no tracking, no
telemetry, no accounts. Full policy: [`store/PRIVACY.md`](store/PRIVACY.md).

## Project layout

```
extension/               the whole product — a Manifest V3 extension
  manifest.json
  src/
    popup.*              toolbar UI + orchestration
    options.*            settings (Amazon domain, translation key, defaults)
    extract.js           article extraction (Readability)
    epub.js              clean EPUB3 builder (RTL + embedded Arabic font)
    translate.js         client-side structure-preserving translation (OpenRouter)
    deliver.js           Send-to-Kindle delivery (Amazon session; verified vs official)
  lib/                   vendored: Readability, JSZip, Amiri font
docs/                    research, architecture, decision log, competitive analysis
store/                   privacy policy + Chrome Web Store listing
scripts/                 packaging
server/                  OPTIONAL / legacy — email fallback + an earlier OAuth
                         delivery approach. Not needed for normal use (see DECISIONS D9–D11).
```

## Verification

- **EPUB pipeline** is unit‑tested headlessly (jsdom): a real Arabic article →
  valid EPUB3 with correct RTL markers. Run: `cd server && npm test`.
- **Delivery protocol** is verified byte‑for‑byte against the official *Send to
  Kindle* extension source (endpoints, headers, field names, the
  `application/epub+zip` data type, the auth model). See
  [`docs/03-official-s2k-mechanism.md`](docs/03-official-s2k-mechanism.md).
- **Live reachability** confirmed against a real Amazon session (CSRF scrape +
  endpoint calls return 200). A full end‑to‑end send requires being signed in to
  Amazon in the browser — the same requirement as Amazon's own extension.

## Roadmap

Parity ideas drawn from studying the official extension and competitors:

- Preview‑before‑send.
- Send history.
- "Send selection" (send only highlighted text).
- Target a specific device vs. the whole library.

## Compatibility

Any Chromium browser: **Brave**, Chrome, Edge, Arc. Requires being signed in to
Amazon in that browser.

## Legal / risk note

Delivery uses Amazon's private *Send to Kindle* web endpoints — the same ones
Amazon's own extension uses. These are undocumented and could change; see
`docs/DECISIONS.md` (D9–D11) for the reasoning and fallbacks.

## License

[MIT](LICENSE) — third‑party components: Mozilla Readability (Apache‑2.0), JSZip
(MIT/GPL), Amiri font (OFL‑1.1).
