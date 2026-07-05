# Decision Log

Each entry: **what** was decided, **why**, and the **precedent** it was based on (from the owner's existing project conventions / prior decisions, per the brief's instruction to mirror how similar decisions were made before rather than stopping to ask).

---

## D1 — Output format is EPUB3 (not MOBI/AZW3)

- **What:** The extension produces EPUB3; the server emails it as-is.
- **Why:** Verified July 2026 that Amazon **natively accepts EPUB** and **no longer accepts MOBI** for Send-to-Kindle. Amazon converts EPUB to its internal format on receipt. EPUB3 also carries the RTL metadata (`page-progression-direction`) Arabic needs.
- **Precedent:** Follows the "verify current mechanism, don't rely on old memory" instruction in the brief; grounded in Amazon's current help docs rather than assumption.

## D2 — Extraction + EPUB build happen in the browser extension, not the server

- **What:** Readability runs on the live page DOM inside the extension; the EPUB is assembled client-side with JSZip. The server never sees article content unless translation is requested.
- **Why:** Reading the already-rendered, already-authenticated DOM handles paywalled / JS-heavy pages that every incumbent's unauthenticated server-side URL fetch fails on. It also keeps content private and removes per-domain site-config maintenance.
- **Precedent:** Matches the workspace's privacy-leaning, "build on existing infrastructure, minimum surface" engineering doctrine (AGENTS.md / Karpathy discipline: simplicity + surgical scope). Divergence from incumbents is intentional and reasoned, not accidental.

## D3 — External LLM routed through OpenRouter (default Claude), key server-side

- **What:** Translation calls go to OpenRouter; default model `anthropic/claude-3.5-sonnet`, swappable via `.env`. The API key lives only on the server, never in the extension.
- **Why:** OpenRouter keeps the model a swappable config (quality/cost A/B, failover). Claude leads on literary tone/register in translation benchmarks, fitting the Arabic-literary goal. Keeping the key server-side is a basic secret-hygiene requirement.
- **Precedent:** The owner's **standing rule** recorded in memory — _"any external LLM backend → default to OpenRouter; never default to the Gemini key (present in env but non-functional)."_ Also mirrors the `paper-lab` / `book-translation` skills' OpenRouter-first pattern. **No paid account was created and no key was committed** — the path is built and left ready for the owner to add a key.

## D4 — Arabic literary conventions encoded into the translation prompt

- **What:** The translation system prompt mandates **فصحى وسطى**, **bans tashkeel (diacritics)**, **bans the word "بل"**, and keeps technical terms (API, MCP, SDK, cron, server) in Latin script.
- **Why:** These are the owner's explicit, repeatedly-stated writing conventions; encoding them at the prompt level makes every translation conform by default.
- **Precedent:** Directly from the owner's global CLAUDE.md communication rules and the memory entries `feedback_no_arabic_diacritics` and the "بل" ban.

## D5 — Bundle and embed the Amiri Arabic font for RTL books

- **What:** Amiri (SIL Open Font License) is vendored into the extension and embedded into RTL EPUBs via `@font-face`.
- **Why:** Without a shaping-capable embedded font, Kindle shows "tofu" boxes / broken Arabic shaping — Amazon's own named failure mode. Embedding guarantees consistent rendering regardless of device fonts. Amiri is OFL-licensed, so redistribution inside generated EPUBs is permitted.
- **Precedent:** The workspace's design doctrine favours getting Arabic typography right (Arabic-first quality is a recurring theme across the owner's Quran/Arabic projects); OFL licensing keeps it legally clean, matching the "no unlicensed assets" caution.

## D6 — Make Amazon's silent approved-sender gate explicit + add a test-send

- **What:** Settings page states the exact Amazon navigation path to approve the sender, and offers a one-click **"send a test document."**
- **Why:** "Sent but never arrives" is the category's #1 complaint, caused by Amazon silently dropping mail from unapproved senders. The gate cannot be bypassed programmatically, so the fix is UX: teach the step and prove the path.
- **Precedent:** Research-first, verify-the-real-mechanism instruction in the brief; turning a documented competitor weakness into a product feature.

## D7 — Structure-preserving translation (translate text nodes, not raw HTML)

- **What:** `translate.js` uses cheerio to translate only text nodes in batches, writing them back into the same DOM; tags/links/images/code are never sent to the model.
- **Why:** Sending raw HTML to an LLM reliably mangles tags and breaks the subsequent EPUB build. Node-level translation keeps structure byte-stable and is verified by an automated test.
- **Precedent:** Simplicity + correctness discipline (AGENTS.md Karpathy rules): choose the approach a senior engineer would not call over-complicated, and verify with a concrete success criterion.

## D8 — Local-first server, VPS-optional

- **What:** The delivery service defaults to `http://localhost:8787`; the same code can run on the Hostinger VPS unchanged.
- **Why:** Zero-cost, zero-hosting for a single user, with a clear upgrade path to always-on delivery without a laptop running.
- **Precedent:** The owner's noted Hostinger VPS as available backend infrastructure; "minimum viable, no premature infrastructure" discipline.

---

### Money / external-commitment ledger (for the final review)

- **No paid account created.** No OpenRouter, SMTP, or hosting account was signed up for.
- **No real email sent to any Kindle.** The send path is built and unit-tested with mocks; it requires the owner's own SMTP credentials + `@kindle.com` address in `.env` to actually deliver.
- **No secret committed.** `.env` is git-ignored; only `.env.example` (placeholders) is in the repo.
- **Assets downloaded:** Mozilla Readability (Apache-2.0), JSZip (MIT/GPL dual), Amiri font (OFL-1.1) — all redistributable.
