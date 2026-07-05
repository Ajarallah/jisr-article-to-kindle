import * as cheerio from "cheerio";

/*
 * Structure-preserving HTML translation.
 *
 * Instead of asking the model to translate raw HTML (which mangles tags), we
 * walk the DOM, collect the text nodes, translate them in batches as a JSON
 * array, and write the results back into the same nodes. The HTML skeleton is
 * never sent to the model, so tags, images, and links stay intact.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_CHARS_PER_BATCH = 4000;

function systemPrompt(targetLang) {
  const arabicRules =
    targetLang.toLowerCase().startsWith("arab")
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

async function callOpenRouter(segments, targetLang, cfg) {
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: systemPrompt(targetLang) },
      { role: "user", content: JSON.stringify(segments) },
    ],
    temperature: 0.3,
  };
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      "HTTP-Referer": cfg.referer || "",
      "X-Title": cfg.title || "",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return parseJsonArray(content, segments.length);
}

function parseJsonArray(content, expectedLen) {
  let text = content.trim();
  // Strip code fences if the model added them.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // Grab the outermost array if there is surrounding prose.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error("model did not return an array");
  if (arr.length !== expectedLen) {
    throw new Error(
      `segment count mismatch: got ${arr.length}, expected ${expectedLen}`
    );
  }
  return arr.map((x) => (x == null ? "" : String(x)));
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
 * translateHtml({ title, html, targetLang }, cfg) ->
 *   { title, html, lang }
 */
export async function translateHtml({ title, html, targetLang }, cfg) {
  const $ = cheerio.load(html, null, false);

  // Collect translatable text nodes.
  const nodes = [];
  const SKIP = new Set(["script", "style", "code", "pre"]);
  const walk = (el) => {
    $(el)
      .contents()
      .each((_, node) => {
        if (node.type === "text") {
          const raw = node.data || "";
          if (raw.trim().length > 0) nodes.push(node);
        } else if (node.type === "tag" && !SKIP.has(node.name)) {
          walk(node);
        }
      });
  };
  $.root()
    .children()
    .each((_, el) => walk(el));

  const segments = nodes.map((n) => n.data);
  const indexMap = []; // maps flat translated index back to node
  segments.forEach((_, i) => indexMap.push(i));

  // Prepend the title so it is translated in the same call flow.
  const allSegments = [title || "", ...segments];
  const batches = batchSegments(allSegments);

  const translated = [];
  for (const batch of batches) {
    // Preserve leading/trailing whitespace of each segment (the model tends to
    // trim it) by trimming before send and re-adding after.
    const trimmedInfo = batch.map((s) => {
      const lead = s.match(/^\s*/)[0];
      const trail = s.match(/\s*$/)[0];
      return { core: s.trim(), lead, trail };
    });
    const cores = trimmedInfo.map((t) => t.core);
    const out = await callOpenRouter(cores, targetLang, cfg);
    out.forEach((t, i) =>
      translated.push(trimmedInfo[i].lead + t + trimmedInfo[i].trail)
    );
  }

  const newTitle = translated[0];
  const bodyTranslations = translated.slice(1);
  nodes.forEach((n, i) => {
    n.data = bodyTranslations[i];
  });

  const rtlLangs = ["arabic", "hebrew", "persian", "urdu"];
  const langCodes = { arabic: "ar", english: "en", french: "fr", spanish: "es", german: "de" };
  const key = targetLang.toLowerCase();

  return {
    title: newTitle || title,
    html: $.root().html() || html,
    lang: langCodes[key] || "",
    dir: rtlLangs.includes(key) ? "rtl" : "ltr",
  };
}
