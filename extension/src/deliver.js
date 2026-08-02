/*
 * Client-side Send-to-Kindle delivery (D11).
 *
 * Replicates the mechanism of Amazon's official "Send to Kindle" extension so
 * OUR single extension can deliver directly — no server, no OAuth, no signing.
 * Auth = the user's amazon.com session cookies + an anti-CSRF token. The user
 * only needs to be signed in to Amazon in the browser.
 *
 * Full reverse-engineered protocol: docs/03-official-s2k-mechanism.md
 * Requires host access to the amazon domain (see manifest host_permissions).
 */

import { fetchWithTimeout, isAbortError } from "./net.js";

const APP_NAME = "chrome_ocs";
const APP_VERSION = "2.1.1.7";
const DEFAULT_DOMAIN = "https://www.amazon.com";
// Send to Kindle (app upload path) caps personal documents at ~50 MB. Catch
// oversize before /init so the user gets a clear message, not an opaque S3 error.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// The S3 PUT can be a multi-MB body on a slow uplink — give it more headroom
// than the small JSON control calls.
const UPLOAD_TIMEOUT_MS = 120000;

const OFFLINE_MSG = "تعذّر الوصول إلى أمازون. تحقّق من اتصالك بالإنترنت وأعد المحاولة.";
const TIMEOUT_MSG = "انتهت مهلة الاتصال بأمازون. أعد المحاولة.";
const SIGNIN_MSG = "لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة.";

function base(domain) {
  return (domain || DEFAULT_DOMAIN).replace(/\/$/, "") + "/sendtokindle";
}

function uniqId() {
  return "a2k-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Extract the anti-CSRF token from the /empty page. Prefer a real DOM parse so a
// change in Amazon's attribute order/quoting/spacing doesn't break us (the old
// byte-exact regex did); fall back to a permissive regex if DOMParser is absent.
export function parseCsrf(html) {
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(String(html), "text/html");
      const el = doc.querySelector('input[name="csrfToken"]');
      const v = el && el.getAttribute("value");
      if (v) return v;
    }
  } catch {
    /* fall through to regex */
  }
  const m = /name=['"]?csrfToken['"]?[^>]*?\svalue=['"]([^'"]+)['"]/i.exec(String(html));
  return m ? m[1] : null;
}

// GET /empty and scrape the csrfToken input value.
async function getCsrf(b, signal) {
  let resp;
  try {
    resp = await fetchWithTimeout(b + "/empty", { credentials: "include", signal });
  } catch (e) {
    throw new Error(isAbortError(e) ? TIMEOUT_MSG : OFFLINE_MSG);
  }
  if (!resp.ok) throw new Error(OFFLINE_MSG);
  const html = await resp.text();
  // The page WAS reachable; a missing token now means logged-out (a logged-in
  // /empty always carries the csrfToken input), not a connectivity problem.
  const token = parseCsrf(html);
  if (!token) throw new Error(SIGNIN_MSG);
  return token;
}

async function postJson(b, path, token, body, signal) {
  let resp;
  try {
    resp = await fetchWithTimeout(b + path, {
      method: "POST",
      credentials: "include",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "anti-csrftoken-a2z": token,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(isAbortError(e) ? TIMEOUT_MSG : OFFLINE_MSG);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`${path} فشل (${resp.status}). ${t.slice(0, 120)}`);
  }
  // When the session is not authenticated, Amazon returns an HTML page (200)
  // instead of JSON. Detect that and surface a clear sign-in message.
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(SIGNIN_MSG);
  }
  return resp.json();
}

/*
 * Real auth check via /extension/checkAuth (matches the official extension).
 * A CSRF token exists on /empty even when logged out, so token presence is NOT
 * a login signal — checkAuth returns { isAuthed, guid }. Verified live and
 * against official S2K v2.1.1.7 source.
 */
export async function checkAuth(domain) {
  try {
    const resp = await fetchWithTimeout(base(domain) + "/extension/checkAuth", {
      credentials: "include",
    });
    if (!resp.ok) return { isAuthed: false };
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { isAuthed: false };
    const data = await resp.json();
    return { isAuthed: !!data.isAuthed, guid: data.guid };
  } catch (e) {
    // Distinguish "couldn't reach Amazon" from "reached it, not logged in" so
    // callers don't send an online-but-logged-out user and an offline user down
    // the same path.
    return { isAuthed: false, offline: true };
  }
}

export async function isSignedIn(domain) {
  return (await checkAuth(domain)).isAuthed;
}

// Amazon marketplaces that host Send-to-Kindle, most common first.
export const AMAZON_DOMAINS = [
  "https://www.amazon.com",
  "https://www.amazon.co.uk",
  "https://www.amazon.de",
  "https://www.amazon.co.jp",
  "https://www.amazon.fr",
  "https://www.amazon.it",
  "https://www.amazon.es",
  "https://www.amazon.ca",
  "https://www.amazon.com.au",
  "https://www.amazon.in",
  "https://www.amazon.com.br",
  "https://www.amazon.nl",
  "https://www.amazon.com.mx",
  "https://www.amazon.sa",
  "https://www.amazon.ae",
];

/*
 * Find which Amazon marketplace the user is actually signed in to, so we don't
 * make them hand-edit the domain. Checks candidates concurrently and returns the
 * first authenticated domain, or null if none (offline / not signed in anywhere).
 */
export async function detectAmazonDomain(candidates = AMAZON_DOMAINS) {
  const checks = candidates.map((d) =>
    checkAuth(d).then((r) => (r.isAuthed ? d : null)).catch(() => null)
  );
  const results = await Promise.all(checks);
  return results.find(Boolean) || null;
}

/*
 * Returns the user's registered Kindle devices, or throws with a clear
 * "sign in to Amazon" message. Also serves as a connectivity/login check.
 */
export async function getDevices(domain, signal) {
  const b = base(domain);
  const token = await getCsrf(b, signal);
  const data = await postJson(b, "/get-device-list", token, {
    extName: APP_NAME,
    extVersion: "1.0",
  }, signal);
  return data.ownedDevices || [];
}

/*
 * Deliver an EPUB (Blob) to the user's Kindle library.
 *   opts: { blob, title, author?, domain?, archive?, deviceList?, signal? }
 * archive=true (default) sends to the Kindle library (syncs to all devices).
 */
export async function sendEpubToKindle({ blob, title, author, domain, archive = true, deviceList = [], signal }) {
  const b = base(domain);
  const bytes = await blob.arrayBuffer();
  const fileSize = bytes.byteLength;
  const safeTitle = (title || "article").trim() || "article";

  // Reject oversize before touching the network — a >50 MB file otherwise fails
  // at the opaque S3 stage with no clear cause.
  if (fileSize > MAX_UPLOAD_BYTES) {
    const mb = (fileSize / (1024 * 1024)).toFixed(1);
    throw new Error(`الملفّ كبير جدًّا (${mb} ميغابايت). الحدّ الأقصى ٥٠ ميغابايت، فجرّب بدون تضمين الصور.`);
  }

  // 1) init -> presigned S3 upload URL + stkToken
  let token = await getCsrf(b, signal);
  const init = await postJson(b, "/init", token, {
    extName: APP_NAME,
    appVersion: APP_VERSION,
    fileSize,
    fileExtension: "epub",
  }, signal);
  if (!init.uploadUrl || !init.stkToken) throw new Error("تعذّرت تهيئة الرفع من أمازون.");

  // 2) PUT the EPUB bytes to S3 (empty Content-Type, no CSRF — matches official)
  let put;
  try {
    put = await fetchWithTimeout(
      init.uploadUrl,
      { method: "PUT", headers: { "Content-Type": "" }, body: bytes, signal },
      UPLOAD_TIMEOUT_MS
    );
  } catch (e) {
    throw new Error(isAbortError(e) ? TIMEOUT_MSG : OFFLINE_MSG);
  }
  if (!put.ok) throw new Error(`فشل رفع الملف إلى أمازون (${put.status}).`);

  // 3) send-v2 -> enqueue delivery
  token = await getCsrf(b, signal);
  const body = {
    extName: APP_NAME,
    extVersion: APP_VERSION,
    inputFormat: "epub",
    stkToken: init.stkToken,
    title: safeTitle,
    // dataType is the MIME type (STK_DATA_TYPE.EPUB in the official extension),
    // NOT the extension. Verified against official S2K v2.1.1.7 source.
    dataType: "application/epub+zip",
    archive,
    deviceList: archive ? [] : deviceList,
    fileSize,
    inputFileName: safeTitle + ".epub",
    batchId: uniqId(),
  };
  if (author && author.trim()) body.author = author.trim();

  const res = await postJson(b, "/send-v2", token, body, signal);
  return res;
}
