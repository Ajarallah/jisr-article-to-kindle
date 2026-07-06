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

const APP_NAME = "chrome_ocs";
const APP_VERSION = "2.1.1.7";
const DEFAULT_DOMAIN = "https://www.amazon.com";

function base(domain) {
  return (domain || DEFAULT_DOMAIN).replace(/\/$/, "") + "/sendtokindle";
}

function uniqId() {
  return "a2k-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// GET /empty and scrape the csrfToken input value.
async function getCsrf(b) {
  const resp = await fetch(b + "/empty", { credentials: "include" });
  if (!resp.ok) throw new Error("لا يمكن الوصول إلى أمازون — تأكّد من اتصالك.");
  const html = await resp.text();
  const m = /name='csrfToken' value='(.*?)' \/>/.exec(html);
  if (!m || !m[1]) {
    throw new Error("لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة.");
  }
  return m[1];
}

async function postJson(b, path, token, body) {
  const resp = await fetch(b + path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "anti-csrftoken-a2z": token,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`${path} فشل (${resp.status}). ${t.slice(0, 120)}`);
  }
  // When the session is not authenticated, Amazon returns an HTML page (200)
  // instead of JSON. Detect that and surface a clear sign-in message.
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("لست مسجّلًا دخولك في أمازون. افتح amazon.com وسجّل الدخول ثم أعد المحاولة.");
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
    const resp = await fetch(base(domain) + "/extension/checkAuth", { credentials: "include" });
    if (!resp.ok) return { isAuthed: false };
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { isAuthed: false };
    const data = await resp.json();
    return { isAuthed: !!data.isAuthed, guid: data.guid };
  } catch {
    return { isAuthed: false };
  }
}

export async function isSignedIn(domain) {
  return (await checkAuth(domain)).isAuthed;
}

/*
 * Returns the user's registered Kindle devices, or throws with a clear
 * "sign in to Amazon" message. Also serves as a connectivity/login check.
 */
export async function getDevices(domain) {
  const b = base(domain);
  const token = await getCsrf(b);
  const data = await postJson(b, "/get-device-list", token, {
    extName: APP_NAME,
    extVersion: "1.0",
  });
  return data.ownedDevices || [];
}

/*
 * Deliver an EPUB (Blob) to the user's Kindle library.
 *   opts: { blob, title, author?, domain?, archive?, deviceList? }
 * archive=true (default) sends to the Kindle library (syncs to all devices).
 */
export async function sendEpubToKindle({ blob, title, author, domain, archive = true, deviceList = [] }) {
  const b = base(domain);
  const bytes = await blob.arrayBuffer();
  const fileSize = bytes.byteLength;
  const safeTitle = (title || "article").trim() || "article";

  // 1) init -> presigned S3 upload URL + stkToken
  let token = await getCsrf(b);
  const init = await postJson(b, "/init", token, {
    extName: APP_NAME,
    appVersion: APP_VERSION,
    fileSize,
    fileExtension: "epub",
  });
  if (!init.uploadUrl || !init.stkToken) throw new Error("تعذّرت تهيئة الرفع من أمازون.");

  // 2) PUT the EPUB bytes to S3 (empty Content-Type, no CSRF — matches official)
  const put = await fetch(init.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`فشل رفع الملف إلى أمازون (${put.status}).`);

  // 3) send-v2 -> enqueue delivery
  token = await getCsrf(b);
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

  const res = await postJson(b, "/send-v2", token, body);
  return res;
}
