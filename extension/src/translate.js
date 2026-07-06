/*
 * Client-side, structure-preserving HTML translation (D10 — serverless).
 *
 * Ported from the server's translate.js. Instead of sending raw HTML to the
 * model (which mangles tags), we parse the HTML, collect the text nodes,
 * translate them in batches as a JSON array, and write the results back into
 * the same nodes. Tags, images, and links are never sent to the model.
 *
 * Runs entirely in the browser and calls OpenRouter directly with the user's
 * own key. Requires host access to openrouter.ai (see manifest host_permissions).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_CHARS_PER_BATCH = 4000;

const RTL_LANGS = ["arabic", "hebrew", "persian", "urdu"];
const LANG_CODES = { arabic: "ar", english: "en", french: "fr", spanish: "es", german: "de" };

function systemPrompt(targetLang) {
  const arabicRules = targetLang.toLowerCase().startsWith("arab")
    ? `
- Use فصحى وسطى (Modern Standard Arabic, clear and readable — neither archaic nor colloquial).
- Do NOT add tashkeel (diacritics). Leave letters unvowelled.
- Do not use the word "بل".
- Keep technical terms (API, MCP, SDK, cron, server, etc.) in Latin script.`
    : "";
  return `You are a professional literary translator. Translate the given text segments into ${targetLang}.
Rules:
- Preserve meaning, tone, and register. Translate idiomatically, not word-for-word.
- Return ONLY a JSON array of strings, exactly the same length and order as the input array.
- Each output string is the translation of the input string at the same index.
- Never merge, split, drop, or reorder segments. If a segment is a number, symbol, or already in the target language, return it unchanged.
- Do not add commentary, keys, or markdown — just the raw JSON array.${arabicRules}`;
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

async function callOpenRouter(segments, targetLang, cfg) {
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      "HTTP-Referer": cfg.referer || "https://article-to-kindle.local",
      "X-Title": cfg.title || "Article to Kindle",
    },
    body: JSON.stringify({
      model: cfg.model || "anthropic/claude-3.5-sonnet",
      messages: [
        { role: "system", content: systemPrompt(targetLang) },
        { role: "user", content: JSON.stringify(segments) },
      ],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return parseJsonArray(content || "", segments.length);
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
 * Collect non-empty text nodes under `root`, skipping code/style/script.
 */
function collectTextNodes(root, doc) {
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE"]);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.trim().length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
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

/*
 * translateHtml({ title, html, targetLang }, cfg) -> { title, html, lang, dir }
 * cfg: { apiKey, model?, referer?, title? }
 */
export async function translateHtml({ title, html, targetLang }, cfg) {
  if (!cfg || !cfg.apiKey) throw new Error("OpenRouter API key is required for translation");

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = collectTextNodes(doc.body, doc);
  const segments = nodes.map((n) => n.nodeValue);

  const allSegments = [title || "", ...segments];
  const batches = batchSegments(allSegments);

  const translated = [];
  for (const batch of batches) {
    // Preserve leading/trailing whitespace (the model tends to trim it).
    const info = batch.map((s) => ({
      core: s.trim(),
      lead: s.match(/^\s*/)[0],
      trail: s.match(/\s*$/)[0],
    }));
    const out = await callOpenRouter(info.map((t) => t.core), targetLang, cfg);
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
