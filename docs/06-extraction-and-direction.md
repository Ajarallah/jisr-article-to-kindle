# Extraction robustness & text direction

## Extraction — two strategies (extract.js)

1. **Mozilla Readability** — the default; excellent on blogs/news where the
   article lives in one container.
2. **Main-region fallback** — for pages that split content across many sibling
   containers (AWS/AEM "what-is" pages, docs sites), where Readability grabs only
   one section. We locate the richest content landmark (`<main>`/`[role=main]`/
   `<article>`, else the div with the most paragraph text, excluding nav/header/
   footer/aside and chrome-classed nodes) and serialize ALL of it.

We run both and keep whichever captured more real article text (the main-region
wins only when it has clearly more, guarding normal articles from over-capture).

**Verified:** on the live `aws.amazon.com/what-is/ai-agents/` page, extraction went
from **17 paragraphs (Readability alone) to 60 paragraphs** (main-region) — the
full article. A normal blog still uses Readability with no nav/footer leak.
Regression tests: `server/test/extract.test.mjs`.

## Text direction — whole-document base direction

Requirement: if the article is mostly Arabic, the whole document must be RTL —
correct even when English words sit inside Arabic sentences; if it's English, LTR.

`detectDirection()` computes the RTL share of letters over a sample:
`rtl / (rtl + latin) >= 0.30 → RTL`. This is deliberately NOT a plain `rtl > ltr`
count, because Arabic technical writing embeds many Latin terms (API, token,
transformer) and would otherwise mis-flip to LTR. Under an RTL base, inline
English renders correctly via the Unicode bidi algorithm — no per-word handling
needed. Content-based detection is authoritative over the site's declared `dir`
(often wrong/missing), except when the text is too short to judge.

The chosen `dir` flows into `epub.js`: `page-progression-direction="rtl"`,
`dir="rtl"` on the package/spine/body, `direction: rtl; text-align: right` in CSS,
plus the embedded Amiri font — so Arabic never breaks into empty boxes on Kindle.
