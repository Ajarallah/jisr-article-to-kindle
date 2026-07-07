# Competitive analysis & product roadmap

_Founder view. What the field offers, where the gap is, and what we build next._

## The landscape

| Tool | Delivery | Extraction | Translation | Arabic / RTL | Privacy | Price |
|---|---|---|---|---|---|---|
| **Amazon Send to Kindle** (official) | Amazon session (serverless) | Amazon web-capture (lossy) | ❌ | Weak — no embedded font, RTL not handled for arbitrary web content | Good (first-party) | Free |
| **Push to Kindle** (FiveFilters) | Email → approved sender | Good (readability-class) | ❌ | Poor; no RTL font embedding | Content via their server | Freemium |
| **Instapaper** | Email (scheduled digests) | Good | ❌ | Poor | Their server | Freemium |
| **KTool** | Email | Good | ❌ | Poor | Their server | Paid |
| **Readwise Reader** | Email + native reader | Excellent | ❌ (highlights/AI chat, not article translation) | Partial | Their server | Paid |
| **Omnivore / Wallabag** | Email / native | Good | ❌ | Partial (Wallabag self-host) | Self-host option | Free/OSS |
| **Article to Kindle** (this) | **Amazon session (serverless)** | Readability, in-browser (handles paywalled/logged-in) | **✅ AI, BYO key** | **✅ RTL + embedded Amiri font** | **Best — nothing in the path but Amazon + your key** | Free/OSS |

### The core insight

Everyone who isn't Amazon uses **email**, inheriting the "approved sender" step and
routing your content through their server. Amazon's own extension is serverless
and clean — but does **no translation** and **no proper Arabic**. We are the only
option that combines Amazon's serverless delivery with translation and real RTL.

## What we learned from Amazon's official extension (v2.1.1.7, source-read)

Feature surface worth knowing (menu: *Quick send, Preview and send, Send
selection, History, Settings, Feedback*):

- **Quick send** (`chrome_ocs`) — one-click, archive-to-library. ← we replicate this.
- **Preview and send** (`chrome_preview`) — render/adjust before sending.
- **Send selection** — send only highlighted text.
- **History** — list of past sends.
- **Device targeting** — send to specific device vs. whole library (`archive` flag +
  `deviceList` from `/get-device-list`).
- **Server-side `web-extract`** — Amazon can extract the article on its own service
  (`/web-extract`) as a fallback to local extraction.
- **i18n** — 29 locales; auto-detects Amazon domain per country.
- **Robustness** — CSRF cached 60s, online check, timeouts, metrics/ratings.

We already match the **delivery core** exactly (verified byte-for-byte). Our
extraction + EPUB + Arabic + translation stack is our own and stronger for our
audience.

## Where we win (positioning)

> The clean, private, serverless delivery of Amazon's own extension — plus the two
> things it can't do: **proper Arabic** and **AI translation**.

Primary audience: Arabic readers (and bilingual readers) who want web articles on
Kindle in readable Arabic. Secondary: anyone who wants AI translation into their
language before reading on Kindle.

## Roadmap (prioritized)

**P0 — shipped / verified**
- One-click Amazon-session delivery — **verified live (sent and arrived on Kindle)**. ✅
- Clean EPUB3 with RTL + embedded Amiri font. ✅
- Optional AI translation — **NVIDIA `glm-5.2`** (benchmarked winner) + fallback +
  retry; structure-preserving, BYO key. ✅
- **Robust two-strategy extraction** (Readability + main-region fallback) — fixes
  AWS/AEM under-extraction (17 → 60 paragraphs). ✅
- **Content-based whole-document direction** (Arabic-with-inline-English → RTL). ✅
- **Drag & drop** Markdown / `.docx` → EPUB → Kindle. ✅
- **Preview before send** — reader-view (RTL-aware) with confirm; great for
  translation QA. ✅
- Download EPUB; correct auth detection + clear sign-in prompts. ✅

**P1 — next (parity + polish)**
- **Send history** — local list of sent articles (chrome.storage).
- **Multi-domain** — auto-pick the user's Amazon country domain (.com/.co.uk/.de/…),
  like the official extension.
- **Better long-article + image handling audit** (already embeds images; verify
  large files and lazy-loaded images).

**P2 — differentiators**
- **Send selection** — send only highlighted text (great for study/notes).
- **Device targeting** — choose a specific Kindle vs. the whole library.
- **Translation glossary / tone presets** — let power users pin terminology and
  register (fits the Arabic literary goal).
- **Bilingual EPUB** — original + translation side-by-side or interleaved.

**Deliberately not doing**
- No email path in the product surface (kept only as legacy in `server/`).
- No third-party server, no accounts, no analytics — privacy is a feature.

## Risks & mitigations

- **Amazon changes the private endpoints.** Mitigation: we mirror the first-party
  extension exactly, so we change when they do; `download EPUB` is always a manual
  fallback; the legacy email path exists.
- **Web Store review of a broad host permission.** Mitigation: justify `amazon.com`
  (delivery) + `openrouter.ai` (opt-in translation) narrowly; no `<all_urls>` in the
  default set; `activeTab` for on-click extraction.
