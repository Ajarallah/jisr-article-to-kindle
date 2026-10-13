# Analysis & Architecture

## 1. Where the real gap is

The category is crowded but converges on one architecture, which leaves three exploitable gaps. Ranked by how defensible they are:

### Gap A — Arabic / RTL done correctly (the moat)

This is the strongest opportunity, and it was **checked rather than assumed** — the incumbents were read, not guessed at:

- **Push to Kindle actively strips `dir="rtl"`** and left it unfixed for 2+ years. ([FiveFilters forum 730](https://forum.fivefilters.org/t/add-support-for-text-direction-in-pastepad/730))
- **Calibre reverses Arabic text** on conversion — a long-standing toolchain problem. ([MobileRead](https://www.mobileread.com/forums/showthread.php?t=252927))
- **KTool, HushRead, Instapaper publish no Arabic/RTL claim**; no user evidence of correct Arabic rendering surfaced.
- Readability's own extraction is Latin-tuned and its `dir` field frequently comes back `null` for Arabic pages that declare direction on `<html>` rather than the article node.

So "just render Arabic correctly" is genuinely underserved. Doing it right is not one switch — it needs **RTL declared at three levels + an embedded Arabic font + a script-detection fallback** (details in §4).

### Gap B — Instant, transparent delivery with feedback

The #1 complaint across the category is **"sent but never arrives"**, caused by Amazon's silent approved-sender gate. Incumbents inherit the opacity. A newcomer can differentiate by making delivery legible: an explicit onboarding step for the approved-sender list, and a **one-click "send a test document"** that proves the path before the user relies on it. (We build both.)

### Gap C — Translation as a first-class step, not an upsell tier

Only HushRead offers translation, gated behind a $9.99/mo tier with a 1/month free allowance. Pairing **correct Arabic RTL rendering** with **AI translation into literary Arabic** is a combination no incumbent offers well — translate an English essay and read it as a clean, properly-shaped Arabic EPUB on Kindle.

## 2. How a file actually reaches a Kindle (verified July 2026)

There is **no public Send-to-Kindle API**. The only programmable path is **email to the user's `@kindle.com` address**. Verified facts that shaped the design:

- **EPUB is natively accepted** (since late 2022); **MOBI is dead** for new sends. → We output **EPUB3**. Amazon converts to its internal format on receipt; we never generate AZW3 ourselves. ([Amazon: supported files](https://www.amazon.com/gp/help/customer/display.html?nodeId=G5WYD9SAF7PGXRNA))
- **Email limit: 50 MB / 25 attachments.** We cap at 45 MB and drop images that fail to fetch, keeping single articles well under.
- **Approved Personal Document E-mail List** — the hard, silent gate. Amazon drops mail from any sender the user has not pre-approved, with no bounce. It **cannot be bypassed programmatically**. The user must add our sender address in _Amazon → Manage Your Content and Devices → Preferences → Personal Document Settings → Approved Personal Document E-mail List_. Our onboarding states this verbatim and provides a test-send.
- **Two address forms:** `name@kindle.com` (cloud sync) and `name@free.kindle.com` (Wi-Fi only). We accept both.
- **Delivery is asynchronous** (seconds to minutes) and anti-spam throttling is undocumented — so the UX says "appears within a few minutes," never "sent → done."

## 3. Chosen architecture

```
┌─────────────────────────────── Chrome extension (MV3) ───────────────────────────────┐
│  popup.js orchestrates:                                                               │
│   1. chrome.scripting injects lib/Readability.js + src/extract.js into the active tab │
│      → returns {title, content(HTML), dir, lang, url, ...}  (clone, no page mutation) │
│   2. [optional] POST /translate  ─────────────┐                                       │
│   3. src/epub.js builds EPUB3 client-side (JSZip): RTL levels + embedded Arabic font  │
│   4. POST /send  (epub as base64 + @kindle.com)│                                       │
└────────────────────────────────────────────────┼──────────────────────────────────────┘
                                                  ▼
┌──────────────────────── Delivery service (Node/Express, local or VPS) ────────────────┐
│  /translate → OpenRouter (API key stays server-side), structure-preserving via cheerio│
│  /send, /test → Nodemailer → SMTP → user's @kindle.com                                 │
│  /health → reports smtp/translation config state                                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### Why this split

- **Extraction + EPUB build happen in the extension**, not the server. This is a deliberate divergence from every incumbent (which extracts server-side from a URL). Benefits:
  - **Paywalled / logged-in / JS-heavy pages work** — we read the DOM the user is already looking at, so no separate unauthenticated server fetch that incumbents fail on.
  - **Privacy** — article content never touches our server unless the user asks for translation.
  - **No per-domain site-config maintenance** — Readability runs on the live, fully-rendered DOM.
- **A thin server exists only for the two things the browser cannot safely do:**
  - **Email to Kindle** — browsers cannot send SMTP; and the sender address must be a stable, approvable identity.
  - **Translation** — the LLM API key must not ship inside the extension, so the server proxies OpenRouter.

### Deployment

The server runs locally (`http://localhost:8787`) for a single user with zero hosting cost, or on the **Hostinger VPS** to serve delivery/translation without keeping a laptop on. Same code either way; only `.env` and the extension's "Delivery service" URL change.

## 4. RTL correctness — the concrete implementation

Applied in `extension/src/epub.js` and validated by an automated test (`chapter is well-formed XML: true`, all three RTL levels present):

1. **Spine** — `<spine page-progression-direction="rtl">` (page-turn direction).
2. **Package language** — `<dc:language>ar</dc:language>` + `dir="rtl"` on `<package>`.
3. **Per-document** — `<html dir="rtl" lang="ar" xml:lang="ar">` and `dir="rtl"` on `<body>`, plus CSS `direction: rtl; text-align: right` as belt-and-suspenders.
4. **Embedded Arabic font** — Amiri (SIL OFL) bundled and embedded via `@font-face` for RTL books, preventing Kindle "tofu" boxes and broken shaping. Falls back to system Arabic fonts if unavailable.
5. **Script-detection fallback** — `src/extract.js` counts Arabic-block codepoints and forces `dir="rtl"` when the page fails to declare it (Readability's `dir` is treated as a hint, not ground truth).

## 5. Translation quality strategy

- **Structure-preserving:** `server/src/translate.js` walks the DOM with cheerio, translates **only text nodes** in batches as a JSON array, and writes results back — HTML tags, links, and images are never sent to the model, so structure cannot be mangled. `<code>` / `<pre>` are skipped. Verified by test.
- **Literary Arabic:** the system prompt demands **فصحى وسطى**, bans tashkeel (diacritics), bans the word "بل", and keeps technical terms in Latin script — the same conventions the project's own Arabic copy follows.
- **Model choice via OpenRouter:** default `anthropic/claude-3.5-sonnet` (Claude leads on literary tone/register in translation benchmarks), swappable through `.env` to any OpenRouter model. External LLM backends go through OpenRouter by policy, so the model stays a config value.

## 6. Honest limitations (MVP)

- No epubcheck-certified pass yet (no JRE on the build machine); validated structurally + for XHTML well-formedness instead. epubcheck is a recommended pre-ship step.
- Single-chapter EPUB (one article = one document); no multi-article digests yet.
- Translation cost/rate-limiting is not metered; fine for personal use, needs guards before public exposure.
- Amazon's approved-sender gate and async delivery are inherent to the platform — mitigated with onboarding + test-send, not eliminable.
