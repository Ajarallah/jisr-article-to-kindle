// Flat ESLint config. Self-contained (no imports) so it resolves no matter which
// node_modules the eslint binary lives in. Focus: catch real bugs (undefined
// names, unused vars, duplicate keys, unreachable code) in the string-parsing-
// heavy extension code — not style nits.
"use strict";

const browser = {
  chrome: "readonly",
  window: "readonly",
  document: "readonly",
  location: "readonly",
  navigator: "readonly",
  fetch: "readonly",
  URL: "readonly",
  Blob: "readonly",
  DOMParser: "readonly",
  XMLSerializer: "readonly",
  DOMException: "readonly",
  AbortController: "readonly",
  NodeFilter: "readonly",
  OffscreenCanvas: "readonly",
  createImageBitmap: "readonly",
  FileReader: "readonly",
  structuredClone: "readonly",
  btoa: "readonly",
  atob: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  Uint8Array: "readonly",
  JSZip: "readonly",
  Readability: "readonly",
  marked: "readonly",
  mammoth: "readonly",
  console: "readonly",
};

const node = {
  process: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  require: "readonly",
  module: "writable",
  console: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  Blob: "readonly",
  Uint8Array: "readonly",
  globalThis: "writable",
};

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-unreachable": "error",
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-cond-assign": ["error", "except-parens"],
  "valid-typeof": "error",
  "no-fallthrough": "error",
};

module.exports = [
  { ignores: ["**/node_modules/**", "extension/lib/**", "server/src/**", "**/*.min.js"] },
  {
    files: ["extension/src/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browser },
    rules,
  },
  {
    files: ["server/**/*.mjs", "server/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: node },
    rules,
  },
];
