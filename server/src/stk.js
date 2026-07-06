/*
 * Amazon "Send to Kindle" (STK) client — server-side.
 *
 * Faithful port of the flow in maxdjohnson/stkclient (Python). Chosen to run
 * server-side (not in the browser) because Amazon's private device endpoints
 * do not send CORS headers, and the request signature uses a NON-STANDARD
 * PKCS#1 padding (raw SHA-256 digest, no DigestInfo prefix) that browser
 * SubtleCrypto cannot produce — but node:crypto can, via privateEncrypt with
 * RSA_NO_PADDING over a hand-built block. See docs/DECISIONS.md D9/D10.
 *
 * Flow:
 *   1) buildSigninUrl()  -> user opens it, signs in to Amazon
 *   2) exchangeToken(code, verifier) -> short-lived access_token
 *   3) registerDevice(access_token)  -> long-lived { device_private_key, adp_token, ... }
 *   4) sendFile(deviceInfo, {...})    -> GetUploadUrl -> PUT -> SendToKindle
 *
 * UNVERIFIED without a live Amazon account (documented): whether Amazon accepts
 * the reproduced signature, and whether inputFormat=epub is accepted.
 */

import crypto from "node:crypto";

// Constants lifted verbatim from stkclient source.
const CLIENT_ID_HEX =
  "658490dfb190e494030082836775981fa23be0c2425441860352ba0f55915b43002d";
const CLIENT_ID_DEVICE = "device:" + CLIENT_ID_HEX;
const SIGNIN_BASE = "https://www.amazon.com/ap/signin";
const RETURN_TO = "https://www.amazon.com/gp/sendtokindle";
const TOKEN_URL = "https://api.amazon.com/auth/token";
const REGISTER_URL =
  "https://firs-ta-g7g.amazon.com/FirsProxy/registerDeviceWithToken";
const STK_BASE = "https://stkservice.amazon.com";

const DEFAULT_CLIENT_INFO = {
  appName: "ShellExtension",
  appVersion: "1.1.1.253",
  os: "MacOSX_10.14.6_x64",
  osArchitecture: "x64",
};

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ---- 1) Sign-in URL (PKCE) ---------------------------------------------------
export function buildSigninUrl() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.ns.oa2": "http://www.amazon.com/ap/ext/oauth/2",
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.oa2.client_id": CLIENT_ID_DEVICE,
    "openid.mode": "checkid_setup",
    "openid.oa2.scope": "device_auth_access",
    "openid.oa2.response_type": "code",
    "openid.oa2.code_challenge": challenge,
    "openid.oa2.code_challenge_method": "S256",
    "openid.return_to": RETURN_TO,
    "openid.ns.pape": "http://specs.openid.net/extensions/pape/1.0",
    "openid.pape.max_auth_age": "0",
    accountStatusPolicy: "P1",
    "openid.assoc_handle": "amzn_device_na",
    pageId: "amzn_device_common_dark",
    disableLoginPrepopulate: "1",
  });
  return { url: `${SIGNIN_BASE}?${params.toString()}`, verifier };
}

// Extract the authorization_code from the redirect URL the user lands on.
export function parseAuthorizationCode(redirectUrl) {
  const u = new URL(redirectUrl);
  const code = u.searchParams.get("openid.oa2.authorization_code");
  if (!code) throw new Error("No openid.oa2.authorization_code in redirect URL");
  return code;
}

// ---- 2) Token exchange -------------------------------------------------------
export async function exchangeToken(authorizationCode, verifier) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept-Language": "en-US",
      "x-amzn-identity-auth-domain": "api.amazon.com",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      app_name: "Unknown",
      client_domain: "DeviceLegacy",
      client_id: CLIENT_ID_HEX,
      code_algorithm: "SHA-256",
      code_verifier: verifier,
      requested_token_type: "access_token",
      source_token: authorizationCode,
      source_token_type: "authorization_code",
    }),
  });
  if (!resp.ok) throw new Error(`token exchange ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

// ---- 3) Device registration --------------------------------------------------
function xmlField(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

export async function registerDevice(accessToken) {
  const body =
    `<?xml version='1.0' encoding='UTF-8'?>` +
    `<request><parameters>` +
    `<deviceType>A1K6D1WRW0MALS</deviceType>` +
    `<deviceSerialNumber>ZYSQ37GQ5JQDAIKDZ3WYH6I74MJCVEGG</deviceSerialNumber>` +
    `<pid>D21NN3GG</pid>` +
    `<authToken>${accessToken}</authToken>` +
    `<authTokenType>AccessToken</authTokenType>` +
    `<softwareVersion>253</softwareVersion>` +
    `<os_version>MacOSX_10.14.6_x64</os_version>` +
    `<device_model>Maxs MacBook Pro</device_model>` +
    `</parameters></request>`;
  const resp = await fetch(REGISTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "Accept-Language": "en-US,*",
      "User-Agent": "Mozilla/5.0",
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`register ${resp.status}: ${text.slice(0, 200)}`);
  const info = {
    device_private_key: xmlField(text, "device_private_key"),
    adp_token: xmlField(text, "adp_token"),
    device_type: xmlField(text, "device_type"),
    given_name: xmlField(text, "given_name"),
    name: xmlField(text, "name"),
    account_pool: xmlField(text, "account_pool"),
    user_directed_id: xmlField(text, "user_directed_id"),
    user_device_name: xmlField(text, "user_device_name"),
    home_region: xmlField(text, "home_region"),
  };
  if (!info.device_private_key || !info.adp_token) {
    throw new Error("registration response missing device_private_key/adp_token");
  }
  return info;
}

// ---- Signing (the crux) ------------------------------------------------------
// stringToSign = method \n path \n date \n post_data \n adp_token
// digest = SHA256(stringToSign); block = 00 01 FF..FF 00 || digest (256 bytes);
// signature = RSA private encrypt(block) with NO padding; header = b64(sig):date
export function signRequest(method, path, postData, deviceInfo) {
  const date = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const stringToSign = `${method}\n${path}\n${date}\n${postData}\n${deviceInfo.adp_token}`;
  const digest = crypto.createHash("sha256").update(stringToSign, "utf8").digest(); // 32 bytes
  const K = 256; // RSA-2048 modulus size in bytes
  const psLen = K - digest.length - 3; // 0x00 0x01 [FF..] 0x00 digest
  const block = Buffer.concat([
    Buffer.from([0x00, 0x01]),
    Buffer.alloc(psLen, 0xff),
    Buffer.from([0x00]),
    digest,
  ]);
  const sig = crypto.privateEncrypt(
    { key: deviceInfo.device_private_key, padding: crypto.constants.RSA_NO_PADDING },
    block
  );
  return `${sig.toString("base64")}:${date}`;
}

async function stkRequest(path, deviceInfo, bodyObj) {
  const postData = JSON.stringify({ ClientInfo: DEFAULT_CLIENT_INFO, ...bodyObj }, null, 4);
  const digestHeader = signRequest("POST", path, postData, deviceInfo);
  const resp = await fetch(STK_BASE + path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-ADP-Request-Digest": digestHeader,
      "X-ADP-Authentication-Token": deviceInfo.adp_token,
      "Accept-Language": "en-US,*",
      "User-Agent": "Mozilla/5.0",
    },
    body: postData,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${path} ${resp.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---- 4) Send ----------------------------------------------------------------
export async function getOwnedDevices(deviceInfo) {
  const data = await stkRequest("/GetListOfOwnedDevices", deviceInfo, {});
  return (data.ownedDevices || []).map((d) => ({
    serial: d.deviceSerialNumber,
    name: d.deviceName,
    capabilities: d.deviceCapabilities || {},
  }));
}

async function getUploadUrl(deviceInfo, fileSize) {
  const data = await stkRequest("/GetUploadUrl", deviceInfo, { fileSize });
  if (!data.uploadUrl || !data.stkToken) throw new Error("GetUploadUrl missing uploadUrl/stkToken");
  return { uploadUrl: data.uploadUrl, stkToken: data.stkToken };
}

async function putFile(uploadUrl, buffer) {
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Accept-Language": "en-US,*",
      "Content-Length": String(buffer.length),
      "User-Agent": "Mozilla/5.0",
    },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`upload PUT ${resp.status}`);
}

export async function sendFile(deviceInfo, { buffer, title, author, format = "epub", targetDevices, outputFormat = "MOBI" }) {
  const serials = targetDevices && targetDevices.length
    ? targetDevices
    : (await getOwnedDevices(deviceInfo)).map((d) => d.serial);
  if (!serials.length) throw new Error("no target Kindle devices found on this account");
  const { uploadUrl, stkToken } = await getUploadUrl(deviceInfo, buffer.length);
  await putFile(uploadUrl, buffer);
  const data = await stkRequest("/SendToKindle", deviceInfo, {
    DocumentMetadata: { author: author || "", crc32: 0, inputFormat: format, title: title || "" },
    archive: true,
    deliveryMechanism: "WIFI",
    outputFormat,
    stkToken,
    targetDevices: serials,
  });
  return { sku: data.sku, statusCode: data.statusCode, targetDevices: serials };
}
