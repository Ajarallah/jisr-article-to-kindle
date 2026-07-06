import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildSigninUrl, parseAuthorizationCode, signRequest } from "../src/stk.js";

test("buildSigninUrl: PKCE challenge is base64url(SHA256(verifier))", () => {
  const { url, verifier } = buildSigninUrl();
  const u = new URL(url);
  const challenge = u.searchParams.get("openid.oa2.code_challenge");
  const expected = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(challenge, expected);
  assert.equal(u.searchParams.get("openid.oa2.code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("openid.oa2.client_id"), "device:658490dfb190e494030082836775981fa23be0c2425441860352ba0f55915b43002d");
  assert.equal(u.searchParams.get("openid.return_to"), "https://www.amazon.com/gp/sendtokindle");
});

test("parseAuthorizationCode extracts the code", () => {
  const redirect =
    "https://www.amazon.com/gp/sendtokindle?openid.oa2.authorization_code=ABC123&foo=bar";
  assert.equal(parseAuthorizationCode(redirect), "ABC123");
  assert.throws(() => parseAuthorizationCode("https://www.amazon.com/gp/sendtokindle?foo=bar"));
});

test("signRequest produces a recoverable non-standard PKCS#1 signature", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const deviceInfo = { device_private_key: privateKey, adp_token: "ADPTOKEN" };
  const method = "POST";
  const path = "/GetUploadUrl";
  const postData = JSON.stringify({ ClientInfo: {}, fileSize: 123 }, null, 4);

  const header = signRequest(method, path, postData, deviceInfo);
  // Format is "<base64sig>:<iso-date>". base64 has no ':', and the ISO date
  // contains ':', so split on the FIRST colon.
  const idx = header.indexOf(":");
  const sig = Buffer.from(header.slice(0, idx), "base64");
  const stamp = header.slice(idx + 1);
  assert.equal(sig.length, 256, "signature is 256 bytes (RSA-2048)");
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  // Recover the padded block with raw RSA public op.
  const block = crypto.publicDecrypt(
    { key: publicKey, padding: crypto.constants.RSA_NO_PADDING },
    sig
  );
  assert.equal(block.length, 256);
  assert.equal(block[0], 0x00);
  assert.equal(block[1], 0x01);
  assert.equal(block[block.length - 33], 0x00, "0x00 separator before the digest");
  // Padding bytes are 0xFF.
  for (let i = 2; i < block.length - 33; i++) assert.equal(block[i], 0xff);

  // The last 32 bytes equal SHA256(stringToSign) with the SAME date.
  const stringToSign = `${method}\n${path}\n${stamp}\n${postData}\n${deviceInfo.adp_token}`;
  const expectedDigest = crypto.createHash("sha256").update(stringToSign, "utf8").digest();
  assert.deepEqual(block.subarray(block.length - 32), expectedDigest);
});
