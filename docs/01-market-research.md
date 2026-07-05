# Market Research — Article → Kindle Tools

_Compiled July 2026. Sources cited inline. Where a claim comes from a competitor's own marketing (e.g. HushRead criticising rivals), it is flagged as such and discounted._

## Scope

Tools that take a web article open in the browser (or a URL) and get it onto a Kindle, optionally with format conversion and translation. Studied: **Push to Kindle (FiveFilters/Mochi)**, **KTool**, **HushRead**, **Instapaper**, plus discovered alternatives (**Reabble**, **Readwise Reader**, **Calibre**).

## The shared architecture of the category

Almost every incumbent follows the same pipeline:

```
browser extension / bookmarklet  →  server extracts article (Readability-style)
        →  server converts to EPUB  →  Amazon "Send to Kindle" email  →  device
```

Three consequences fall out of this shared design, and they define where a newcomer can win:

1. **Extraction is Readability-based and Latin-tuned.** Readability scores content blocks by character count and comma/punctuation density — heuristics tuned for English. Non-Latin scripts (Arabic punctuation `،`, different character density) are a documented weak spot. ([Ctrl.blog](https://www.ctrl.blog/entry/browser-reading-mode-content.html))
2. **Delivery rides Amazon's Send-to-Kindle email**, which has a silent failure mode (the approved-sender list) that every tool inherits and none can fix — it is the #1 support complaint across the category.
3. **RTL / Arabic is unhandled.** No incumbent publishes an Arabic/RTL claim, and the category leader demonstrably drops RTL markup (see below).

---

## 1. Push to Kindle — FiveFilters / Mochi

- **Ownership:** FiveFilters spun the app into **Mochi.is**; still branded "Push to Kindle by Mochi." ([fivefilters.org](https://www.fivefilters.org/))
- **Extraction:** Server-side. A **PHP port of Readability**, backed by the open-source **`ftr-site-config`** ecosystem — per-domain XPath rules looked up by hostname; falls back to automatic detection when no rule matches. ([ftr-site-config](https://github.com/fivefilters/ftr-site-config), [HN](https://news.ycombinator.com/item?id=28301113))
- **Conversion:** Server-side to **EPUB / MOBI / PDF / TXT**; content cached briefly. ([kindle-epub-support](https://www.fivefilters.org/2022/kindle-epub-support/))
- **Delivery:** Amazon Send-to-Kindle email (sender `kindle@fivefilters.org`), plus Dropbox/PocketBook. Extensions for all major browsers. ([help.fivefilters.org](https://help.fivefilters.org/push-to-kindle/))
- **Pricing:** Free 10 articles/month; **$4.99/mo or $34.99/yr**. ([Chrome Web Store](https://chromewebstore.google.com/detail/push-to-kindle/pnaiinchjaonopoejhknmgjingcnaloc))
- **Top complaints (real users):**
  - "Sent" but never arrives — usually sender not whitelisted, or Amazon silently rejects. ([forum 1721](https://forum.fivefilters.org/t/not-working/1721), [1690](https://forum.fivefilters.org/t/kindle-failed-to-download-article/1690))
  - Emails caught by spam filters; articles "Pending" then vanish. ([troubleshooting](https://help.fivefilters.org/push-to-kindle/troubleshooting.html))
  - Broken EPUB metadata through Amazon's pipeline (title from filename, author "Unknown"). ([kindle-epub-issues](https://www.fivefilters.org/2022/kindle-epub-issues/))
  - Declining reliability on JS-heavy / strict-CSP / paywalled sites.
  - Backlash over the one-time-purchase → subscription shift.
- **Technical weaknesses:** opaque Amazon-email dependency; site-config rules need manual per-domain upkeep; paywalled content inaccessible (unauthenticated server fetch).
- **Arabic / RTL:** **Documented failure.** Their PastePad tool has no RTL toggle and **strips `dir="rtl"` / `direction:rtl`** on submit; the team acknowledged the gap and left it unfixed for 2+ years. ([forum 730](https://forum.fivefilters.org/t/add-support-for-text-direction-in-pastepad/730))

## 2. KTool (ktool.io)

- **Extraction/Conversion:** Server-side; extension posts page contents + URL, server packages a "modern EPUB." Broad format support (Wikipedia, X threads, StackOverflow, Markdown, PDF, DOCX, newsletters — 100+). ([ktool.io](https://ktool.io/))
- **Delivery:** Send-to-Kindle + read in Kindle app. Extensions + native iOS/Android.
- **Pricing:** 7-day trial, no permanent free tier. Basic **$36/yr**, Premium **$48/yr**, Platinum **$72/yr** (EPUB _download_ locked to Platinum). ([ktool.io/pricing](https://ktool.io/pricing))
- **Complaints:** Weak negative signal — mostly positive reviews on extraction quality. **Caution:** PissedConsumer complaints belong to unrelated **ktool.net**, not ktool.io. Structural gripes: no free tier; EPUB download paywalled to top tier; image fidelity weaker than dedicated EPUB builders.
- **Arabic / RTL:** **No evidence found** — nothing about language handling anywhere in site/store listings.

## 3. HushRead (hushread.app)

- **Mechanism:** Server-side extraction; outputs **EPUB3**; positions against MOBI-era tools. **Bilingual Mode** — original + AI translation section-by-section in one EPUB, 12+ languages. Send-to-Kindle email; Kobo via Dropbox.
- **Pricing:** Free 10 articles + 1 translation/mo; Reader **$4.99/mo**; Polyglot **$9.99/mo** (200 translations/mo). ([pricing](https://hushread.app/pricing/))
- **Complaints:** **No independent reviews found** — very new/niche; all copy is first-party. Absence of complaints ≠ quality.
- **Weaknesses:** small free tier; undisclosed parser; full server dependency; unproven vendor.
- **Arabic / RTL:** **No evidence found.** Advertises "12+ languages" with no Arabic-specific claim. The translation angle is the only reason it _might_ do better, unverified.
- **Note:** HushRead's blog is the loudest critic of Instapaper and is a direct competitor — treat its rival claims as marketing.

## 4. Instapaper (instapaper.com)

- **Mechanism:** "Instaparser" (Readability-derived); downloads/optimizes images; assembles ePub and emails it. Kindle delivery is a **batched/scheduled digest** model plus individual sends.
- **Pricing:** Send-to-Kindle moved **behind Premium** (~$5.99/mo; prices vary across sources). **Free tier lost Kindle delivery entirely** — free users must manually download + upload via Amazon's portal. Kobo stays free. ([Good e-Reader](https://goodereader.com/blog/kindle/send-to-kindle-with-instapaper-is-now-going-to-cost-money), [Pocket-lint](https://www.pocket-lint.com/instapaper-send-to-kindle-going-behind-paywall/))
- **Complaints:** Strong backlash over paywalling a long-free feature (~100k+ affected users). Send-to-Kindle ran at a loss (parse + image fetch + disk + ePub + email per digest) — economically fragile.
- **Weaknesses:** batched, not instant; no translation; free Kindle path removed.
- **Arabic / RTL:** No Instapaper-specific report, but its Readability-style parser is a **known weakness for RTL/Arabic extraction** (Latin-tuned heuristics).

## Discovered alternatives

- **Reabble** — RSS reader for the Kindle's built-in browser (reads on-device, not EPUB), + a separate Send-to-Kindle. 15 free/mo, **$0.99** unlimited. RTL depends on the weak Kindle browser; untested.
- **Readwise Reader** — premium read-it-later with Kindle export; part of a $8–10/mo suite; not article-first-to-Kindle.
- **Calibre** — free, local, full RTL control but manual; long-standing community reports of **"Arabic reversed text"** during conversion. ([MobileRead](https://www.mobileread.com/forums/showthread.php?t=252927))

## Category-wide takeaway

Every mainstream tool is a **server-side Readability extractor → EPUB → Send-to-Kindle email**. **Arabic/RTL is a real, documented blind spot**: the leader (Push to Kindle) strips `dir=rtl`, and generic converters (Calibre) reverse Arabic. None demonstrates correct Arabic rendering. That is the differentiation gap this project targets.
