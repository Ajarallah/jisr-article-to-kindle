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

## D9 — Delivery pivot: email/SMTP → Amazon Send-to-Kindle OAuth (private API)

- **What:** The primary delivery path is no longer email-to-Kindle via SMTP. It is Amazon's own "Send to Kindle" upload flow, authenticated with the user's Amazon account over OAuth2 — the same mechanism Amazon's official Send-to-Kindle extension and web uploader use. The EPUB uploads straight from the browser to Amazon and lands in the Kindle library. Email delivery is kept only as a documented fallback.
- **Why:** Live user testing exposed that the email path forces the user through Amazon's "Approved Personal Document E-mail List" step (an anti-spam gate Amazon imposes on ALL email senders — Push to Kindle, KTool, Readwise, Instapaper all inherit it), plus SMTP/App-Password setup. It felt risky and multi-step to a real (non-developer) user, and routed the content through a third-party server. The OAuth path removes ALL of that: no email, no approved-sender step, no SMTP, and no server touching the content — the file goes browser → Amazon directly. Fewest steps + maximum privacy.
- **Precedent:** (a) The owner's explicit standing authorization to use unofficial/undocumented APIs when they are the right technical choice (recorded in the original build brief). (b) Verified against working open-source reference clients — `stkclient` (Python, OAuth2) and `Xetera/kindle-api` (JS) — so this is a trodden path, not a guess. (c) The "build the real user experience, not a developer workaround" instruction from the owner during testing.
- **Known risk (documented, accepted):** Amazon's STK API is private and undocumented; Amazon can change it. The email path remains as fallback to de-risk this.

## D10 — Fully serverless: BYO-key translation, no backend in the default path

- **What:** With delivery on OAuth (no server) the remaining server role was translation. Default path moves translation client-side: the extension calls OpenRouter directly using the user's OWN key, stored locally in the browser. The `server/` stays in the repo as an OPTIONAL self-host translation proxy (for users who prefer not to place a key in the browser, or want to run it on their VPS).
- **Why:** Eliminates our infrastructure entirely for the core product, zero hosting cost, and keeps the privacy story clean — nothing we operate sits between the user and Amazon/OpenRouter. Translation is an opt-in advanced feature, so a BYO-key requirement is acceptable friction confined to that feature; the core send-to-Kindle stays a single click.
- **Precedent:** The owner's "OpenRouter-first, never the env Gemini key" rule ([[feedback_external_llm_openrouter]]) and the "minimum viable, no premature infrastructure" discipline. BYO-key mirrors how many indie reader tools ship optional AI features.

---

### Money / external-commitment ledger (for the final review)

- **No paid account created.** No OpenRouter, SMTP, or hosting account was signed up for.
- **No real email sent to any Kindle.** The send path is built and unit-tested with mocks; it requires the owner's own SMTP credentials + `@kindle.com` address in `.env` to actually deliver.
- **No secret committed.** `.env` is git-ignored; only `.env.example` (placeholders) is in the repo.
- **Assets downloaded:** Mozilla Readability (Apache-2.0), JSZip (MIT/GPL dual), Amiri font (OFL-1.1) — all redistributable.
