/*
 * Client-side, structure-preserving translation.
 *
 * Instead of sending raw HTML to the model (which mangles tags), we parse the
 * HTML, collect the text nodes, translate them in batches as a JSON array, and
 * write the results back into the same nodes. Tags, images, and links are never
 * sent to the model.
 *
 * Default backend: OpenRouter (OpenAI-compatible), model
 * deepseek/deepseek-v4-flash — the house model, measured at ~5s per batch there.
 * Falls back to deepseek-v4-pro and retries transient failures. NVIDIA NIM was
 * the previous backend and is still usable by overriding translationEndpoint;
 * it was dropped because its deepseek-v4-flash stopped answering entirely.
 *
 * The key ships with the build (settings.js -> src/secrets.js); a key the user
 * enters themselves overrides it. Requires host access to the endpoint host
 * (see manifest host_permissions).
 */

import { fetchWithTimeout } from "./net.js";

// net.js defaults to 30s, which is right for the small JSON control calls the
// delivery path makes. A translation batch is not that: the model streams
// thousands of Arabic tokens, and measured against free endpoints a 3500-char
// batch routinely runs past 30s. Cutting it off there produced a TimeoutError
// that looked like a dead provider when the provider was simply still writing.
const TRANSLATE_TIMEOUT_MS = 120000;

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_FALLBACK = "deepseek/deepseek-v4-pro";
// Batches are bounded by INPUT chars, but the model is bounded by OUTPUT tokens.
// RTL/Arabic output tokenizes much larger than Latin source, so a batch that is
// safe for English can overflow the output budget in Arabic — truncating the
// JSON, which then reads as a "segment count mismatch" and burns every retry.
// Use a tighter char cap for RTL targets and give the model a generous ceiling.
// Smaller batches, on purpose. A larger batch means a longer JSON array in the
// reply, and a longer array is more likely to lose one entry along the way —
// measured directly: an 18-segment batch came back with 17, finish_reason
// "stop", nothing truncated, one just gone. The indexed {i,t} reply format
// (see parseJsonArray) makes a drop survivable, but keeping batches small in
// the first place means fewer opportunities for it to happen at all.
const MAX_CHARS_PER_BATCH = 2500;
const MAX_CHARS_PER_BATCH_RTL = 1400;
const MAX_OUTPUT_TOKENS = 16384;
const MIN_OUTPUT_TOKENS = 1024;
// Ask for what this batch can plausibly need, not a flat ceiling. Two reasons:
// providers that reserve credit against max_tokens reject the call outright when
// the reservation exceeds the balance (measured: OpenRouter 402 "You requested
// up to 16384 tokens, but can only afford 1020"), and an honest budget lets a
// provider schedule the request sooner. Arabic runs roughly 1 token per 2 source
// chars and inflates over English, so 1.6x source length is a generous margin.
function outputBudget(segments) {
  const chars = segments.reduce((n, s) => n + s.length, 0);
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, Math.round(chars * 1.6)));
}
const MAX_ATTEMPTS_PER_MODEL = 3;
// When a provider rate-limits without saying for how long, probe upward from a
// short gap instead of assuming the worst case. Free tiers range from ~5 rpm
// (12s apart) to ~20 rpm (3s apart); jumping straight to 12s makes the fast
// ones four times slower than they need to be.
const RATE_LIMIT_START_MS = 1500;
const RATE_LIMIT_MAX_MS = 15000;
const RATE_LIMIT_BACKOFF_MS = RATE_LIMIT_START_MS;
// Batches are independent, so run a few in flight at once. Sequential batching
// made wall time = batches × latency — a long article became an unusable wait.
// Kept deliberately low: providers rate-limit, and 429s would just burn the
// retry budget.
const MAX_CONCURRENT_BATCHES = 3;

const RTL_LANGS = ["arabic", "hebrew", "persian", "urdu"];
const LANG_CODES = { arabic: "ar", english: "en", french: "fr", spanish: "es", german: "de" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function systemPrompt(targetLang) {
  const arabicRules = targetLang.toLowerCase().startsWith("arab")
    ? `
- Use فصحى وسطى (Modern Standard Arabic, clear and readable — neither archaic nor colloquial).
- Do NOT add tashkeel (diacritics). Leave letters unvowelled.
- Do not use the word "بل".
- Keep technical terms and product names (API, SDK, LLM, GPT, transformer, token, etc.) in Latin script.`
    : "";
  return `You are a professional literary translator. Translate the given text segments into ${targetLang}.
Rules:
- Preserve meaning, tone, and register. Translate idiomatically, not word-for-word.
- The input is a JSON array of {"i": <number>, "t": "<text>"} objects.
- Return ONLY a raw JSON array of {"i": <same number>, "t": "<translation>"} objects. No markdown fences, no commentary.
- Echo each "i" back exactly. Return one object per input object — never merge, split, drop, or reorder them.
- If a segment is a number, symbol, URL, or already in the target language, return its text unchanged.${arabicRules}`;
}

/*
 * Parse the model's reply into exactly `expectedLen` slots.
 *
 * We ask for [{i, t}] rather than a bare array of strings because position is
 * the one thing models silently lose: measured against a real article, a
 * well-behaved model returned 17 translations for 18 segments with
 * finish_reason "stop" — nothing truncated, one segment simply gone. With a bare
 * array that is unrecoverable (which text went missing?), so the whole book
 * failed. With explicit indices a dropped segment leaves a hole we can identify
 * and fill from the source, costing one untranslated sentence instead of
 * everything.
 *
 * Bare string arrays are still accepted: older/simpler models fall back to that
 * shape, and it is unambiguous as long as the length matches.
 *
 * Returns an array where a missing slot is null (the caller substitutes source).
 */
function parseJsonArray(content, expectedLen) {
  let text = String(content).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("model did not return an array");

  const indexed = arr.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (indexed.length) {
    const out = new Array(expectedLen).fill(null);
    let placed = 0;
    for (const o of indexed) {
      const i = Number(o.i ?? o.index ?? o.id);
      if (!Number.isInteger(i) || i < 0 || i >= expectedLen || out[i] !== null) continue;
      out[i] = String(o.t ?? o.text ?? o.translation ?? "");
      placed += 1;
    }
    // A reply that lost most of its segments is a broken generation, not a slip.
    if (placed < Math.ceil(expectedLen * 0.6)) {
      throw new Error(`segment count mismatch: got ${placed}, expected ${expectedLen}`);
    }
    return out;
  }

  if (arr.length !== expectedLen) {
    throw new Error(`segment count mismatch: got ${arr.length}, expected ${expectedLen}`);
  }
  return arr.map((x) => (x == null ? "" : String(x)));
}

/*
 * Adaptive rate pacer.
 *
 * Free tiers are commonly 5-20 requests/minute. Firing MAX_CONCURRENT_BATCHES
 * with sub-second retries guarantees 429s against any of them — measured on a
 * real 14-paragraph article: Z.AI answered 3 requests and refused 8, SambaNova
 * answered 11 and refused 21. Retrying harder makes it worse, because every
 * retry is another request inside the same window.
 *
 * So: start optimistic (no spacing, full concurrency) and let the FIRST 429
 * teach us the provider's pace. From then on every request in the run queues
 * behind a minimum interval. Nothing to configure per provider, and a fast paid
 * endpoint never pays for the machinery.
 */
function makePacer() {
  return { minIntervalMs: 0, nextAt: 0 };
}

async function pace(pacer) {
  if (!pacer || !pacer.minIntervalMs) return;
  const now = Date.now();
  const at = Math.max(now, pacer.nextAt);
  pacer.nextAt = at + pacer.minIntervalMs;
  if (at > now) await sleep(at - now);
}

/*
 * A 429 tells us we are too fast; converge on the real pace rather than guess it.
 * With an explicit Retry-After we obey it exactly. Without one we start at
 * RATE_LIMIT_START_MS and double on each further refusal, so a 20 rpm provider
 * settles around 3s while a 5 rpm one climbs to ~12s. The interval only ever
 * grows within a run — backing off and speeding up again just re-triggers the
 * limit.
 */
function learnRateLimit(pacer, ms, explicit) {
  if (!pacer) return;
  const next = explicit
    ? ms
    : pacer.minIntervalMs
      ? Math.min(pacer.minIntervalMs * 2, RATE_LIMIT_MAX_MS)
      : RATE_LIMIT_START_MS;
  pacer.minIntervalMs = Math.max(pacer.minIntervalMs, next);
  pacer.nextAt = Math.max(pacer.nextAt, Date.now() + pacer.minIntervalMs);
}

// One completion attempt against a specific model. Throws with `.retryable`.
/*
 * OpenRouter serves one model from many upstream providers and load-balances
 * between them by default. For deepseek-v4-flash that pool spans ~22 providers
 * whose measured p50 throughput ranges from ~72 tokens/s (Baidu, AtlasCloud) down
 * to single digits — and a random draw landed us on a slow one, where a single
 * batch produced 127 tokens in 21s and long batches never finished streaming.
 * Asking to sort by throughput turns that lottery into a deterministic choice.
 *
 * Sent only to OpenRouter: `provider` is its extension to the OpenAI schema, and
 * a strict endpoint (Z.AI, SambaNova) may reject an unknown field.
 */
function routingOptions(endpoint) {
  let host = "";
  try {
    host = new URL(endpoint).host;
  } catch {
    return {};
  }
  if (host !== "openrouter.ai") return {};
  return {
    provider: { sort: "throughput" },
    // Reasoning models (deepseek-v4-flash is one) spend part of max_tokens
    // "thinking" in English before writing a single translated character.
    // Measured: 1290 reasoning tokens against a small per-batch budget left
    // finish_reason "length" and an EMPTY content field — the translation
    // never started. Translation doesn't need a visible thought process, so
    // turn it off and let the whole budget go to the actual output.
    reasoning: { enabled: false },
  };
}

async function complete(segments, targetLang, cfg, model, signal, pacer) {
  await pace(pacer);
  let resp;
  try {
    resp = await fetchWithTimeout(
      cfg.endpoint || DEFAULT_ENDPOINT,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt(targetLang) },
            {
            role: "user",
            content: JSON.stringify(segments.map((s, i) => ({ i, t: s }))),
          },
          ],
          temperature: 0.2,
          max_tokens: outputBudget(segments),
          ...routingOptions(cfg.endpoint || DEFAULT_ENDPOINT),
        }),
      },
      TRANSLATE_TIMEOUT_MS
    );
  } catch (e) {
    if (e && e.name === "AbortError") throw e; // user cancel — propagate, don't retry
    const timedOut = e && e.name === "TimeoutError";
    const err = new Error(
      timedOut
        ? "انتهت مهلة الاتصال بخدمة الترجمة — أعد المحاولة."
        : "تعذّر الاتصال بخدمة الترجمة — تحقّق من اتصالك."
    );
    // A timeout means this model is not answering at all — hammering it twice
    // more just burns another 2×30s before the fallback gets its turn. Go to the
    // next model immediately. A network error, by contrast, is worth a retry.
    err.retryable = !timedOut;
    throw err;
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    const err = new Error(`${model} ${resp.status}: ${t.slice(0, 160)}`);
    // 5xx and 429 (and "ResourceExhausted"/"unavailable") are transient → retry same model.
    err.retryable = resp.status >= 500 || resp.status === 429 || /exhausted|unavailable/i.test(t);
    // A rate limit needs to be waited out, not hammered. Free tiers are commonly
    // ~5 requests/minute, so the sub-second backoff used for other errors just
    // burns the retry budget. Honour Retry-After when the provider sends it.
    if (resp.status === 429) {
      const ra = Number(resp.headers.get("retry-after"));
      const explicit = Number.isFinite(ra) && ra > 0;
      err.retryAfterMs = explicit ? ra * 1000 : RATE_LIMIT_BACKOFF_MS;
      learnRateLimit(pacer, err.retryAfterMs, explicit);
    }
    throw err;
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  // A malformed/empty array is a transient model hiccup → retryable.
  try {
    return parseJsonArray(content || "", segments.length);
  } catch (e) {
    e.retryable = true;
    throw e;
  }
}

// Try the primary model with retries; on exhaustion fall back to the secondary.
async function translateBatch(segments, targetLang, cfg, signal, pacer) {
  const models = [cfg.model || DEFAULT_MODEL, cfg.fallbackModel || DEFAULT_FALLBACK].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await complete(segments, targetLang, cfg, model, signal, pacer);
      } catch (e) {
        if (e && e.name === "AbortError") throw e; // user cancel — stop immediately
        lastErr = e;
        if (e.retryable === false) break; // hard error for this model → try fallback
        // A 429 is already absorbed by the pacer's interval; sleeping again here
        // would double-count it. Other errors keep the short backoff.
        if (!e.retryAfterMs) await sleep(500 * (attempt + 1));
      }
    }
  }
  throw new Error("فشلت الترجمة بعد عدّة محاولات: " + (lastErr ? lastErr.message : "خطأ غير معروف"));
}

function collectTextNodes(root, doc) {
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.trim().length === 0) return NodeFilter.FILTER_REJECT;
      let p = node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1 && SKIP.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function batchSegments(segments, maxChars) {
  const batches = [];
  let cur = [];
  let curLen = 0;
  for (const seg of segments) {
    const len = seg.length + 2;
    if (cur.length && curLen + len > maxChars) {
      batches.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(seg);
    curLen += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// Block elements we pair original↔translation on. Excludes pre/code (not
// translated) and containers that hold other blocks (we interleave leaves only).
const BILINGUAL_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, dd, dt";

function leafTextBlocks(body) {
  return Array.from(body.querySelectorAll(BILINGUAL_BLOCKS)).filter(
    (el) => el.textContent.trim() && !el.querySelector(BILINGUAL_BLOCKS)
  );
}

/*
 * Interleave the translated blocks into the original document: after each source
 * block, insert its translation with the target direction/lang. srcBody and
 * transBody are structurally identical (translation only swapped text), so their
 * leaf-block lists align 1:1. Marked data-a2k-tr (survives EPUB attribute
 * stripping) for optional styling.
 */
function interleaveBilingual(srcBody, transBody, targetDir, targetLangCode) {
  const src = leafTextBlocks(srcBody);
  const trans = leafTextBlocks(transBody);
  const n = Math.min(src.length, trans.length);
  for (let i = 0; i < n; i++) {
    const s = src[i];
    const t = trans[i];
    // Skip blocks the model left unchanged (e.g. all-Latin) — no point duplicating.
    if ((s.textContent || "").trim() === (t.textContent || "").trim()) continue;
    const imported = srcBody.ownerDocument.importNode(t, true);
    imported.setAttribute("dir", targetDir);
    if (targetLangCode) imported.setAttribute("lang", targetLangCode);
    imported.setAttribute("data-a2k-tr", "1");
    s.insertAdjacentElement("afterend", imported);
  }
}

/*
 * translateHtml({ title, html, targetLang }, cfg, opts?) -> { title, html, lang, dir }
 * cfg:  { apiKey, model?, fallbackModel?, endpoint? }
 * opts: { signal?, onProgress?(doneBatches, totalBatches), bilingual? }
 *   bilingual: keep the original and interleave the translation after each block
 *   (returns dir/lang undefined so the caller keeps the SOURCE direction).
 */
export async function translateHtml({ title, html, targetLang }, cfg, opts = {}) {
  if (!cfg || !cfg.apiKey) throw new Error("لا يوجد مفتاح ترجمة في هذه النسخة.");
  const { signal, onProgress, bilingual } = opts;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = collectTextNodes(doc.body, doc);
  const segments = nodes.map((n) => n.nodeValue);

  const isRtlTarget = RTL_LANGS.includes(targetLang.toLowerCase());
  const maxChars = isRtlTarget ? MAX_CHARS_PER_BATCH_RTL : MAX_CHARS_PER_BATCH;
  const allSegments = [title || "", ...segments];
  const batches = batchSegments(allSegments, maxChars);

  // Run batches through a small worker pool. Results are written by index, so
  // reassembly order is independent of completion order.
  const results = new Array(batches.length);
  const pacer = makePacer();
  let done = 0;
  let next = 0;
  if (onProgress) onProgress(0, batches.length);
  async function runBatches() {
    for (;;) {
      const i = next++;
      if (i >= batches.length) return;
      // Preserve leading/trailing whitespace (models tend to trim it).
      const info = batches[i].map((s) => ({
        core: s.trim(),
        lead: s.match(/^\s*/)[0],
        trail: s.match(/\s*$/)[0],
      }));
      const cores = info.map((t) => t.core);
      const out = await translateBatch(cores, targetLang, cfg, signal, pacer);
      // A null slot means the model dropped that segment; keep the source text
      // rather than leaving a hole in the book.
      results[i] = out.map((t, j) => info[j].lead + (t == null ? cores[j] : t) + info[j].trail);
      done += 1;
      if (onProgress) onProgress(done, batches.length);
    }
  }
  const lanes = Math.min(MAX_CONCURRENT_BATCHES, batches.length);
  await Promise.all(Array.from({ length: lanes }, runBatches));
  const translated = results.flat();

  // Structural gate: batching already enforces a 1:1 segment count, so structure
  // is preserved by construction. The remaining failure is the model BLANKING
  // segments (returns "" for real text) — invisible in translate mode, but a
  // glaring gap in bilingual mode. If too many non-trivial segments came back
  // empty, fail loudly so the user retries rather than getting a half-empty book.
  let sourceNonEmpty = 0;
  let lost = 0;
  for (let i = 0; i < allSegments.length; i++) {
    if ((allSegments[i] || "").trim().length > 1) {
      sourceNonEmpty += 1;
      if (!(translated[i] || "").trim()) lost += 1;
    }
  }
  if (sourceNonEmpty >= 5 && lost / sourceNonEmpty > 0.15) {
    throw new Error("الترجمة أسقطت أجزاءً كثيرة من النص. أعد المحاولة.");
  }

  const newTitle = translated[0];
  const bodyTranslations = translated.slice(1);
  nodes.forEach((n, i) => {
    n.nodeValue = bodyTranslations[i];
  });

  const key = targetLang.toLowerCase();

  if (bilingual) {
    // Re-parse the untouched source and interleave the translated blocks (from
    // `doc`, now fully translated) after each original block.
    const srcDoc = new DOMParser().parseFromString(html, "text/html");
    interleaveBilingual(
      srcDoc.body,
      doc.body,
      RTL_LANGS.includes(key) ? "rtl" : "ltr",
      LANG_CODES[key] || ""
    );
    return {
      title: title, // keep the original title; both languages live in the body
      html: srcDoc.body.innerHTML || html,
      // dir/lang left undefined so the caller keeps the SOURCE direction/lang —
      // the base flows as the original, translation blocks carry their own dir.
    };
  }

  return {
    title: newTitle || title,
    html: doc.body.innerHTML || html,
    lang: LANG_CODES[key] || "",
    dir: RTL_LANGS.includes(key) ? "rtl" : "ltr",
  };
}
