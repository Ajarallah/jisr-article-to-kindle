/*
 * Study-mode glossary. Asks the model for the hardest terms in an article and a
 * short gloss in the target language, then injects each term's first occurrence
 * as a native Kindle popup footnote (epub:type="noteref" → "footnote") and
 * appends a glossary section. Popups that a reader's device doesn't support still
 * work as linked endnotes (the safe floor).
 *
 * Turns a plain reprint into a language-learning artifact — the uncontested wedge
 * for Arabic speakers reading English (and vice-versa). BYO key, client-side.
 */

import { fetchWithTimeout } from "./net.js";

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5.6-luna";
const MAX_TERMS = 25;
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "A", "SUP"]);

function glossaryPrompt(targetLang) {
  return `You are a language tutor. From the article text, pick the ${MAX_TERMS} or fewer genuinely HARD items for a reader: technical terms, idioms, rare/advanced vocabulary, named concepts. For each, give a SHORT gloss in ${targetLang} (a few words, not a sentence).
Return ONLY a raw JSON array of {"term","gloss"} objects. "term" MUST be copied verbatim from the text (same spelling/case) so it can be found. No markdown, no commentary. Skip common words. Prefer single words or short phrases.`;
}

function parsePairs(content) {
  let text = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && x.term && x.gloss)
    .map((x) => ({ term: String(x.term).trim(), gloss: String(x.gloss).trim() }))
    .filter((x) => x.term.length > 1 && x.gloss)
    .slice(0, MAX_TERMS);
}

async function extractGlossary(text, targetLang, cfg, signal) {
  const resp = await fetchWithTimeout(cfg.endpoint || DEFAULT_ENDPOINT, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: glossaryPrompt(targetLang) },
        { role: "user", content: text.slice(0, 12000) },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!resp.ok) throw new Error(`glossary ${resp.status}`);
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return parsePairs(content || "");
}

// Find the first text node containing `term` (case-insensitive), skipping code/
// links/existing noterefs, and return { node, index } or null.
function findTerm(root, doc, term) {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let p = node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1 && SKIP.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const needle = term.toLowerCase();
  let n;
  while ((n = walker.nextNode())) {
    const idx = n.nodeValue.toLowerCase().indexOf(needle);
    if (idx !== -1) return { node: n, index: idx };
  }
  return null;
}

function injectNoteref(node, index, term, id, num) {
  const doc = node.ownerDocument;
  const after = node.splitText(index + term.length); // node = …term ; after = rest
  const sup = doc.createElement("sup");
  const a = doc.createElement("a");
  a.setAttribute("epub:type", "noteref");
  // EPUB 3.3 (W3C Rec, Jan 2026) is explicit that epub:type does not reach the
  // accessibility APIs. The DPUB-ARIA role is what a screen reader announces and
  // navigates by, so every note carries both.
  a.setAttribute("role", "doc-noteref");
  a.setAttribute("href", "#" + id);
  a.textContent = String(num);
  sup.appendChild(a);
  node.parentNode.insertBefore(sup, after);
}

/*
 * annotateHtml(html, {apiKey,...}, { targetLang, signal }) -> html with glossary
 * popups + a glossary section, or the original html if nothing was found.
 */
export async function annotateHtml(html, cfg, opts = {}) {
  if (!cfg || !cfg.apiKey) throw new Error("لا يوجد مفتاح ترجمة في هذه النسخة.");
  const targetLang = opts.targetLang || "Arabic";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const glossary = await extractGlossary(doc.body.textContent || "", targetLang, cfg, opts.signal);
  if (!glossary.length) return html;

  const rtl = /arab|hebr|pers|urdu/i.test(targetLang);
  const asides = [];
  let num = 0;
  const seen = new Set();
  for (const { term, gloss } of glossary) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    const hit = findTerm(doc.body, doc, term);
    if (!hit) continue;
    seen.add(key);
    num += 1;
    const id = "a2k-gloss-" + num;
    injectNoteref(hit.node, hit.index, term, id, num);
    asides.push({ id, term, gloss });
  }
  if (!asides.length) return html;

  const section = doc.createElement("section");
  section.setAttribute("epub:type", "endnotes");
  section.setAttribute("role", "doc-endnotes");
  const h = doc.createElement("h2");
  h.textContent = rtl ? "مسرد المصطلحات" : "Glossary";
  if (rtl) h.setAttribute("dir", "rtl");
  section.appendChild(h);
  for (const a of asides) {
    const aside = doc.createElement("aside");
    aside.setAttribute("epub:type", "footnote");
    aside.setAttribute("role", "doc-footnote");
    aside.setAttribute("id", a.id);
    if (rtl) aside.setAttribute("dir", "rtl");
    const label = doc.createElement("strong");
    label.textContent = a.term + " — ";
    aside.appendChild(label);
    aside.appendChild(doc.createTextNode(a.gloss));
    section.appendChild(aside);
  }
  doc.body.appendChild(section);
  return doc.body.innerHTML;
}
