/*
 * Kindle device sizing for the auto-generated cover.
 *
 * Every modern Kindle screen is 3:4 (0.750) except the 6" basic, which is
 * ~0.740 — close enough that matching each device's own aspect ratio (rather
 * than Amazon's storefront guidance of 1.6:1 / 0.625, which our cover used
 * before this) is what stops the cover letterboxing on-device. That guidance
 * is written for the Kindle Store's marketing thumbnail, not for a book
 * sideloaded straight onto a specific reader — this is a deliberate,
 * documented divergence from it, not an oversight.
 *
 * Height is fixed at 2560px across every device (Amazon's own stated ideal
 * cover height; ≥2500 is its floor recommendation for HD screens). Only width
 * varies, which is why every pixel measurement elsewhere in the cover pipeline
 * (epub.js, covers.js) had to become a ratio of W first — a fixed pixel value
 * tuned for one width looks wrong at every other one.
 */

export const KINDLE_DEVICES = [
  {
    id: "paperwhite12",
    label: 'بيبروايت ٧" (٢٠٢٤) · كولورسوفت · أوايسِس',
    screen: [1264, 1680],
    cover: [1926, 2560],
  },
  {
    id: "paperwhite11",
    label: 'بيبروايت ٦٫٨" (٢٠٢١)',
    screen: [1236, 1648],
    cover: [1920, 2560],
  },
  {
    id: "basic",
    label: 'كندل الأساسيّ ٦"',
    screen: [1072, 1448],
    cover: [1894, 2560],
  },
  {
    id: "scribe",
    label: 'سكرايب ١٠٫٢" و١١"',
    screen: [1860, 2480],
    cover: [1920, 2560],
  },
  {
    id: "standard",
    label: "مقاس أمازون القياسيّ (١٫٦:١)",
    screen: null, // not a real device — Amazon's storefront-guidance ratio, kept as an option
    cover: [1600, 2560],
  },
];

export const DEFAULT_DEVICE_ID = "paperwhite12";

function findDevice(deviceId) {
  return KINDLE_DEVICES.find((d) => d.id === deviceId) || KINDLE_DEVICES.find((d) => d.id === DEFAULT_DEVICE_ID);
}

// The cover's pixel dimensions for a device id. Falls back to the default
// device for an unrecognised id (a stale setting from a removed device, or a
// value that never round-tripped through storage correctly) rather than
// throwing — a cover slightly the wrong shape beats no cover at all.
export function coverDimensions(deviceId) {
  const device = findDevice(deviceId);
  const [W, H] = device.cover;
  return { W, H, deviceId: device.id };
}

// W/H for the device's cover — what the popup preview needs to size its own
// canvas/box to the same shape as the EPUB will actually ship, instead of
// assuming the old fixed 2:3.
export function coverAspect(deviceId) {
  const { W, H } = coverDimensions(deviceId);
  return W / H;
}
