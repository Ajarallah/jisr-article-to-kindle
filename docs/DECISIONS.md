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

- **What:** Translation calls go to OpenRouter; default model `anthropic/claude-3.5-sonnet`, swappable via `.env`. The API key lives only on the server, never in the extension. (Provider later changed to NVIDIA — see D13.)
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

## D9/D10 — Revision after protocol research (feasibility-driven)

- **What changed:** Deep research into the two working reference clients (`stkclient` Python, `Xetera/kindle-api` JS) showed that running the Send-to-Kindle protocol *inside the browser extension* faces two blockers I could not clear blind: (1) Amazon's private device endpoints (`api.amazon.com`, `firs-ta-g7g.amazon.com`, `stkservice.amazon.com`) are very unlikely to return CORS headers for an extension origin, and the required `X-ADP-*` custom headers trigger preflight; (2) the request signature uses a **non-standard raw-digest PKCS#1 padding (no DigestInfo prefix)** that `crypto.subtle.sign` cannot produce.
- **Decision:** Implement the STK OAuth + registration + signed upload **server-side** (Node), which is the reference client's native environment — no CORS, and `node:crypto` can produce the exact non-standard signature via `privateEncrypt` with `RSA_NO_PADDING` over a hand-built PKCS#1 block. The extension stays thin: build the EPUB, then hand it to the server, which relays to Amazon. This runs on the owner's own VPS, so content still never touches a third party, and the **user experience is unchanged** (sign in to Amazon once, no approved-sender, no email).
- **Honesty note:** Two items remain unverifiable without a live Amazon login and were left for a one-time smoke test: whether Amazon accepts the reproduced signature, and whether it accepts `inputFormat=epub` (source hard-codes `outputFormat=MOBI`). The **verified email path is retained as a working fallback** so the product is never left without a delivery method.
- **Precedent:** Owner's "verify the real mechanism, don't assume" instruction, and "isolated, reversible, keep a fallback" engineering discipline.

## D11 — Adopt the official Send-to-Kindle mechanism inside ONE extension (retire the server)

- **What:** The owner pointed out that Amazon ships an official "Send to Kindle" browser extension, so using ours + theirs means two extensions — bad UX. We reverse-engineered the official extension's actual delivery mechanism (source on disk) and will replicate it **inside our single extension**: build the translated Arabic EPUB, then deliver it client-side via the user's Amazon session. Full protocol in `docs/03-official-s2k-mechanism.md`.
- **Why it supersedes D9/D9.2/D10's delivery:** The official flow authenticates with the **user's amazon.com session cookies + an `anti-csrftoken-a2z` header** — NOT the OAuth device-registration + non-standard RSA signing of `stkclient`. That means: no server, no OAuth, no signing, no CORS gamble, and — decisively — **it removes the "will Amazon accept it?" risk**, because we use the exact same authenticated web endpoints (`/sendtokindle/init` → S3 PUT → `/sendtokindle/send-v2`) that Amazon's own extension uses. It also confirmed Amazon's pipeline accepts a directly-uploaded **EPUB**, which is our output.
- **Consequence:** The `server/` STK code (`stk.js`, `/stk/*`) and the OAuth device flow are **retired to optional/legacy** (kept in repo, not deleted, per surgical-change discipline). The default product becomes a single, serverless extension. Translation stays client-side (D10). Email stays as a deep fallback.
- **Precedent:** The owner's own rules — "Tool Discovery / build ON TOP of existing infrastructure, don't rebuild from scratch" (which I violated by rebuilding delivery in D9) and "build the real user experience." This decision corrects that miss.
- **Honesty note:** This is still Amazon's private (undocumented) web API; it can change. But it is materially lower-risk than D9 because it is the identical mechanism a shipping first-party extension depends on.

## D12 — Delivery verified byte-for-byte against official source + live-checked

- **What:** Read the official Send-to-Kindle extension's ACTUAL source from disk (v2.1.1.7 — `src-worker/s2k-request.js`, `send-to-kindle.js`, `src-common/constants.js`) via its bundled source maps, and reconciled `deliver.js` against it field by field.
- **Corrections found and applied:**
  - `/send-v2` `dataType` must be the **MIME type** `application/epub+zip` (`STK_DATA_TYPE.EPUB`), **not** `"epub"`. `inputFormat`/`fileExtension` stay `"epub"` (`STK_FILE_TYPE.EPUB`). The earlier value risked rejection.
  - Auth detection must use `GET /sendtokindle/extension/checkAuth` → `{isAuthed, guid}`. A CSRF token is present on `/empty` **even when logged out**, so token presence is not a login signal (the earlier `isSignedIn` was wrong and would show "signed in" while logged out).
  - When unauthenticated, Amazon returns an **HTML page (200)** instead of JSON; `postJson` now detects non-JSON and surfaces a clear sign-in message instead of a cryptic parse error.
- **Confirmed identical to official:** base `/sendtokindle`, header `anti-csrftoken-a2z`, app name `chrome_ocs`, version `2.1.1.7`, the `/init` and `/send-v2` request bodies, the empty-`Content-Type` S3 `PUT`, and the CSRF-scrape regex. The official manifest declares **no declarativeNetRequest and no special headers** — plain credentialed fetch — so our extension-context calls match it exactly.
- **Live verification (real Amazon session, read-only):** `/empty` CSRF scrape and endpoint reachability returned 200. A full end-to-end send could not be completed in this session only because the automatable browser was **not signed in to Amazon** (and entering the password is prohibited for the agent) — not a protocol issue. Byte-identical parity with a shipping first-party extension is the strongest correctness guarantee available short of a logged-in send.
- **Precedent:** "Verify the real mechanism from source, don't assume"; the owner's demand for 100% certainty.

## D13 — Translation backend switched to NVIDIA NIM, default model `z-ai/glm-5.2`

- **What:** The default translation backend changed from OpenRouter (`anthropic/claude-3.5-sonnet`) to **NVIDIA NIM** (OpenAI-compatible endpoint `https://integrate.api.nvidia.com/v1/chat/completions`), default model **`z-ai/glm-5.2`**, fallback **`deepseek-ai/deepseek-v4-pro`**, with per-model retry on transient free-tier failures. The key stays **client-side / BYO** — this part of D10 is unchanged. Supersedes the *provider* choice in D3 and the *OpenRouter* reference in D10; the client-side, BYO-key architecture of D10 otherwise stands.
- **Why:** NVIDIA's free tier lets the owner run translation at zero cost with no paid account, and a five-model benchmark (see `docs/05-translation-model-selection.md`) put `glm-5.2` first on Arabic quality, speed, and instruction-compliance. Retry and fallback were added because the free tier intermittently rate-limits (503 ResourceExhausted / 429).
- **Precedent:** The owner's standing "external LLM → default to OpenRouter, and never the env Gemini key" rule was the original basis for D3; this decision refines it toward a zero-cost free tier that still isn't the Gemini key, and is grounded in a real benchmark rather than assumption ("verify the real mechanism, don't assume"). See `docs/05-translation-model-selection.md` for the measured basis.
- **Honesty note:** the free tier can rate-limit or change; the retry and `deepseek-v4-pro` fallback exist to absorb that, and the endpoint/model remain user-overridable in settings.


## D14 — Translation backend moved to OpenRouter; key ships with the build

- **What:** The default translation/glossary endpoint is now OpenRouter
  (`https://openrouter.ai/api/v1/chat/completions`), model
  **`deepseek/deepseek-v4-flash`**, fallback `deepseek/deepseek-v4-pro`. The key
  ships inside the build at `extension/src/secrets.js` (git-ignored) instead of
  being asked from the user; a key the user enters still overrides it.
  Supersedes the *provider* in D13 and the *BYO-key* half of D10.
- **Why:** Two measured facts, not preferences. (1) NVIDIA's
  `deepseek-ai/deepseek-v4-flash` stopped answering entirely — four independent
  probes exceeded 90-150s with no response, and an instrumented run showed three
  30s timeouts per batch before `deepseek-v4-pro` answered in 4.3s. The same
  model on OpenRouter answers in ~1.5s. (2) BYO-key was gating the product's
  flagship feature behind an errand; the owner asked for it built in.
- **Consequences:** `manifest.json` host permission swapped
  `integrate.api.nvidia.com` -> `openrouter.ai`. Two reliability fixes landed
  with it: batches now run 3-concurrently (order preserved by index), and a model
  that *times out* is abandoned after one attempt instead of three.
- **Known risk (documented, accepted):** a key inside an extension is **not
  secret** - the package is a plain zip and anyone can read it. Acceptable for a
  personal/unpacked build. Before any store release the key must move behind a
  proxy the owner operates, with `translationEndpoint` repointed at it. The key
  is kept out of git so it never reaches the public repo or its history.
- **Precedent:** the owner's standing "verify the real mechanism, don't assume"
  rule - the switch is grounded in measurement, and the previous default was
  retired only after being proven dead, not on suspicion.

---

### Money / external-commitment ledger (for the final review)

- **No paid account created.** No OpenRouter, SMTP, or hosting account was signed up for.
- **One real test email WAS sent** (2026-07-05) during live testing: from the owner's own `ajarallah93@gmail.com` to the owner's own Kindle address via Gmail SMTP. Gmail accepted it (`accepted:[kindle addr], rejected:[]`); Amazon likely dropped it because the sender was not yet on the approved list — the exact friction that motivated the OAuth pivot (D9).
- **The owner's Gmail App Password is stored locally** in `server/.env` (git-ignored, never committed). If the email path is not used, the owner can revoke it in Google account settings.
- **No secret committed.** `.env` and `.stk-credentials.json` are git-ignored; only `.env.example` (placeholders) is in the repo.
- **Assets downloaded:** Mozilla Readability (Apache-2.0), JSZip (MIT/GPL dual), Amiri font (OFL-1.1) — all redistributable.
