import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// Shim the browser globals epub.js/covers.js rely on, then import them.
const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.JSZip = JSZip;
const { buildEpub } = await import("../../extension/src/epub.js");
const { paintCoverFooter } = await import("../../extension/src/covers.js");
const { KINDLE_DEVICES, coverDimensions } = await import("../../extension/src/devices.js");

async function readZip(blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  return JSZip.loadAsync(buf);
}

test("coverDimensions: correct cover size for every known device id", () => {
  const expected = {
    paperwhite12: [1926, 2560],
    paperwhite11: [1920, 2560],
    basic: [1894, 2560],
    scribe: [1920, 2560],
    standard: [1600, 2560],
  };
  for (const [id, [W, H]] of Object.entries(expected)) {
    const d = coverDimensions(id);
    assert.equal(d.W, W, `${id} width`);
    assert.equal(d.H, H, `${id} height`);
    assert.equal(d.deviceId, id);
  }
  // Every device table entry above is exercised — a device added to devices.js
  // without a matching entry here would silently go untested.
  assert.deepEqual(
    KINDLE_DEVICES.map((d) => d.id).sort(),
    Object.keys(expected).sort()
  );
});

test("coverDimensions: an unknown device id falls back to the default device", () => {
  const fallback = coverDimensions("some-device-that-was-removed");
  const def = coverDimensions("paperwhite12");
  assert.deepEqual(fallback, def);
});

test("cover generation succeeds at every Kindle device size", async () => {
  // Minimal OffscreenCanvas/createImageBitmap shims — same approach as
  // epub-pipeline.test.mjs. Records the canvas size each cover was drawn at so
  // this test can confirm coverDimensions is actually driving the draw, not
  // just returning the right numbers on its own.
  const g = globalThis;
  const sizes = [];
  g.createImageBitmap = async () => ({ width: 10, height: 10, close() {} });
  g.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      sizes.push([w, h]);
    }
    getContext() {
      return {
        fillRect() {}, drawImage() {}, fillText() {}, strokeRect() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
        fill() {}, stroke() {}, clip() {}, rect() {}, save() {}, restore() {},
        createLinearGradient() { return { addColorStop() {} }; },
        measureText(t) { return { width: String(t).length * 12 }; },
        set fillStyle(_v) {}, set strokeStyle(_v) {}, set font(_v) {},
        set direction(_v) {}, set textAlign(_v) {}, set textBaseline(_v) {},
        set lineWidth(_v) {}, set lineCap(_v) {}, set globalAlpha(_v) {},
        set imageSmoothingQuality(_v) {},
      };
    }
    async convertToBlob() {
      return new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    }
  };
  try {
    for (const device of KINDLE_DEVICES) {
      sizes.length = 0;
      const blob = await buildEpub(
        {
          title: "مقال تجريبي لاختبار الأجهزة",
          content: "<p>نص المقال.</p>",
          dir: "rtl",
          lang: "ar",
          url: "https://example.com/device-test",
          siteName: "مثال",
        },
        // "rules" (a pattern style, not "image") so this exercises pure canvas
        // geometry without needing a fetch/image-decode shim too.
        { coverStyle: "rules", kindleDevice: device.id }
      );
      const zip = await readZip(blob);
      assert.ok(zip.file("OEBPS/images/cover.jpg"), `cover written for ${device.id}`);
      const expected = coverDimensions(device.id);
      assert.deepEqual(sizes[0], [expected.W, expected.H], `canvas drawn at ${device.id}'s dimensions`);
    }
  } finally {
    delete g.OffscreenCanvas;
    delete g.createImageBitmap;
  }
});

test("cover footer: all four metadata items still fit at the narrowest device width (standard, 1600px)", async () => {
  // The footer previously overflowed by ~9px at 1600px and was fixed by
  // narrowing its margin (see covers.js paintCoverFooter) — a real regression
  // risk if that margin, or the item spacing around it, ever drifts back.
  // measureText approximates the metadata font at this size closely enough to
  // catch a real overflow without needing an actual rendering engine.
  const calls = [];
  const ctx = {
    save() {}, restore() {}, fillRect() {}, drawImage() {},
    measureText(t) { return { width: String(t).length * 13 }; },
    set fillStyle(_v) {}, set globalAlpha(_v) {}, set font(_v) {},
    set textBaseline(_v) {}, set direction(_v) {}, set textAlign(_v) {},
    fillText(text) { calls.push(text); },
  };
  const article = {
    strategy: "readability",
    byline: "الكاتب الفلاني",
    date: "2026-08-02",
    siteName: "Example Site",
    url: "https://example.com/article",
  };
  await paintCoverFooter(ctx, 1600, 2560, article, true);
  assert.equal(calls.length, 4, "kind, author, date, and source all survive the fit check at 1600px");
});
