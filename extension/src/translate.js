/*
 * Client-side, structure-preserving translation.
 *
 * Instead of sending raw HTML to the model (which mangles tags), we parse the
 * HTML, collect the text nodes, translate them in batches as a JSON array, and
 * write the results back into the same nodes. Tags, images, and links are never
 * sent to the model.
 *
 * Default backend: NVIDIA NIM (OpenAI-compatible), model
 * deepseek-ai/deepseek-v4-flash — the house model. Speed matters here because a
 * long article is dozens of sequential batches. Falls back to deepseek-v4-pro,
 * and retries transient failures because the free tier occasionally rate-limits.
 *
 * The key ships with the build (settings.js -> src/secrets.js); a key the user
 * enters themselves overrides it. Requires host access to the endpoint host
 * (see manifest host_permissions).
 */

import { fetchWithTimeout } from "./net.js";

const DEFAULT_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-ai/deepseek-v4-flash";
const DEFAULT_FALLBACK = "deepseek-ai/deepseek-v4-pro";
// Batches are bounded by INPUT chars, but the model is bounded by OUTPUT tokens.
// RTL/Arabic output tokenizes much larger than Latin source, so a batch that is
// safe for English can overflow the output budget in Arabic — truncating the
// JSON, which then reads as a "segment count mismatch" and burns every retry.
// Use a tighter char cap for RTL targets and give the model a generous ceiling.
const MAX_CHARS_PER_BATCH = 2500;
const MAX_CHARS_PER_BATCH_RTL = 1400;
const MAX_OUTPUT_TOKENS = 16384;
const MAX_ATTEMPTS_PER_MODEL = 3;
// Batches are independent, so run a few in flight at once. Sequential batching
// made wall time = batches × latency, and NVIDIA's free tier can take a minute
// or more per call — a long article became an unusable wait. Kept deliberately
// low: the free tier rate-limits, and 429s would just burn the retry budget.
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
- Return ONLY a raw JSON array of strings, exactly the same length and order as the input array. No markdown fences, no commentary, no keys.
- Each output string is the translation of the input string at the same index.
- Never merge, split, drop, or reorder segments. If a segment is a number, symbol, URL, or already in the target language, return it unchanged.${arabicRules}`;
}

function parseJsonArray(content, expectedLen) {
  let text = String(content).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("model did not return an array");
  if (arr.length !== expectedLen) {
    throw new Error(`segment count mismatch: got ${arr.length}, expected ${expectedLen}`);
  }
  return arr.map((x) => (x == null ? "" : String(x)));
}

// One completion attempt against a specific model. Throws with `.retryable`.
async function complete(segments, targetLang, cfg, model, signal) {
  let resp;
  try {
    resp = await fetchWithTimeout(cfg.endpoint || DEFAULT_ENDPOINT, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt(targetLang) },
          { role: "user", content: JSON.stringify(segments) },
        ],
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
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
    // 5xx and 429 (and NVIDIA "ResourceExhausted") are transient → retry same model.
    err.retryable = resp.status >= 500 || resp.status === 429 || /exhausted|unavailable/i.test(t);
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
async function translateBatch(segments, targetLang, cfg, signal) {
  const models = [cfg.model || DEFAULT_MODEL, cfg.fallbackModel || DEFAULT_FALLBACK].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await complete(segments, targetLang, cfg, model, signal);
      } catch (e) {
        if (e && e.name === "AbortError") throw e; // user cancel — stop immediately
        lastErr = e;
        if (e.retryable === false) break; // hard error for this model → try fallback
        await sleep(500 * (attempt + 1));
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
  if (!cfg || !cfg.apiKey) throw new Error("أضف مفتاح الترجمة (NVIDIA) في الإعدادات لتفعيل الترجمة.");
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
      const out = await translateBatch(info.map((t) => t.core), targetLang, cfg, signal);
      results[i] = out.map((t, j) => info[j].lead + t + info[j].trail);
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
