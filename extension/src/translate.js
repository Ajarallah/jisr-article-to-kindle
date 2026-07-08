/*
 * Client-side, structure-preserving translation.
 *
 * Instead of sending raw HTML to the model (which mangles tags), we parse the
 * HTML, collect the text nodes, translate them in batches as a JSON array, and
 * write the results back into the same nodes. Tags, images, and links are never
 * sent to the model.
 *
 * Default backend: NVIDIA NIM (OpenAI-compatible), model z-ai/glm-5.2 — chosen
 * after benchmarking 5 models on Arabic translation (best quality + speed +
 * instruction-compliance; see docs/05-translation-model-selection.md). Falls
 * back to deepseek-ai/deepseek-v4-pro, and retries transient failures because
 * the free tier occasionally rate-limits.
 *
 * BYO key, stored locally in the browser. Requires host access to the endpoint
 * host (see manifest host_permissions).
 */

const DEFAULT_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "z-ai/glm-5.2";
const DEFAULT_FALLBACK = "deepseek-ai/deepseek-v4-pro";
const MAX_CHARS_PER_BATCH = 2500;
const MAX_ATTEMPTS_PER_MODEL = 3;

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
async function complete(segments, targetLang, cfg, model) {
  let resp;
  try {
    resp = await fetch(cfg.endpoint || DEFAULT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt(targetLang) },
          { role: "user", content: JSON.stringify(segments) },
        ],
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });
  } catch (e) {
    const err = new Error("تعذّر الاتصال بخدمة الترجمة — تحقّق من اتصالك.");
    err.retryable = true;
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
async function translateBatch(segments, targetLang, cfg) {
  const models = [cfg.model || DEFAULT_MODEL, cfg.fallbackModel || DEFAULT_FALLBACK].filter(
    (m, i, a) => m && a.indexOf(m) === i
  );
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await complete(segments, targetLang, cfg, model);
      } catch (e) {
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

function batchSegments(segments) {
  const batches = [];
  let cur = [];
  let curLen = 0;
  for (const seg of segments) {
    const len = seg.length + 2;
    if (cur.length && curLen + len > MAX_CHARS_PER_BATCH) {
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

/*
 * translateHtml({ title, html, targetLang }, cfg) -> { title, html, lang, dir }
 * cfg: { apiKey, model?, fallbackModel?, endpoint? }
 */
export async function translateHtml({ title, html, targetLang }, cfg) {
  if (!cfg || !cfg.apiKey) throw new Error("أضف مفتاح الترجمة (NVIDIA) في الإعدادات لتفعيل الترجمة.");

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = collectTextNodes(doc.body, doc);
  const segments = nodes.map((n) => n.nodeValue);

  const allSegments = [title || "", ...segments];
  const batches = batchSegments(allSegments);

  const translated = [];
  for (const batch of batches) {
    // Preserve leading/trailing whitespace (models tend to trim it).
    const info = batch.map((s) => ({
      core: s.trim(),
      lead: s.match(/^\s*/)[0],
      trail: s.match(/\s*$/)[0],
    }));
    const out = await translateBatch(info.map((t) => t.core), targetLang, cfg);
    out.forEach((t, i) => translated.push(info[i].lead + t + info[i].trail));
  }

  const newTitle = translated[0];
  const bodyTranslations = translated.slice(1);
  nodes.forEach((n, i) => {
    n.nodeValue = bodyTranslations[i];
  });

  const key = targetLang.toLowerCase();
  return {
    title: newTitle || title,
    html: doc.body.innerHTML || html,
    lang: LANG_CODES[key] || "",
    dir: RTL_LANGS.includes(key) ? "rtl" : "ltr",
  };
}
