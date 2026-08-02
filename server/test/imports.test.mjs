import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Every named import must resolve to a real export.
 *
 * This exists because of a failure that was invisible to everything else we run:
 * popup.js imported `suggestCoverStyle` from covers.js after that function had
 * been dropped in a rewrite. A missing named export makes the ES module loader
 * reject the WHOLE module before a single line executes, so the popup opened
 * frozen — stuck on "جارٍ قراءة الصفحة…", empty destination, no picker — with
 * the real cause only visible in a devtools console nobody had open.
 *
 * ESLint does not catch it (it does not resolve cross-module bindings) and the
 * unit tests did not either, since they import the modules they exercise
 * directly and never load popup.js, which is browser-only.
 */

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "extension", "src");

function exportsOf(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of source.matchAll(/export\s+(?:const|let|var|class)\s+(\w+)/g)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim();
      if (name) names.add(name.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
}

function namedImports(source) {
  const out = [];
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/([\w.-]+)["']/gs)) {
    const wanted = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ from: m[2], wanted });
  }
  return out;
}

test("every named import resolves to a real export", () => {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".js"));
  const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(SRC, f), "utf8")]));
  const exported = new Map([...sources].map(([f, s]) => [f, exportsOf(s)]));

  const problems = [];
  for (const [file, source] of sources) {
    for (const { from, wanted } of namedImports(source)) {
      // secrets.js is git-ignored and legitimately absent from a fresh clone;
      // settings.js already imports it dynamically inside a try/catch.
      if (!sources.has(from)) {
        if (from !== "secrets.js") problems.push(`${file} imports from missing module ./${from}`);
        continue;
      }
      for (const name of wanted) {
        if (!exported.get(from).has(name)) {
          problems.push(`${file} imports { ${name} } from ./${from}, which does not export it`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], "unresolved imports:\n" + problems.join("\n"));
});
