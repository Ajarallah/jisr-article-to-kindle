import "dotenv/config";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle, verifySmtp } from "./mailer.js";
import { buildTestEpub } from "./testEpub.js";
import {
  buildSigninUrl,
  parseAuthorizationCode,
  exchangeToken,
  registerDevice,
  getOwnedDevices,
  sendFile,
} from "./stk.js";

const app = express();
app.use(express.json({ limit: "60mb" }));

const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(
  cors({
    origin: allowed.includes("*") ? true : allowed,
  })
);

function kindleEmailValid(e) {
  return typeof e === "string" && /@(kindle|free\.kindle)\.com$/i.test(e.trim());
}

// ---- Send to Kindle (STK OAuth) — primary delivery, see docs/DECISIONS.md ----
const CREDS_PATH = fileURLToPath(new URL("../.stk-credentials.json", import.meta.url));
let pendingVerifier = null;
function loadCreds() {
  try {
    return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  } catch {
    return null;
  }
}
let deviceInfo = loadCreds();

app.get("/health", async (_req, res) => {
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  res.json({
    ok: true,
    smtpConfigured: hasSmtp,
    translationConfigured: hasOpenRouter,
    kindleConnected: !!deviceInfo,
  });
});

// Step 1: hand the extension a fresh Amazon sign-in URL; remember the PKCE verifier.
app.post("/stk/signin-url", (_req, res) => {
  const { url, verifier } = buildSigninUrl();
  pendingVerifier = verifier;
  res.json({ ok: true, url });
});

// Step 2: the extension posts back the redirect URL it captured after sign-in.
app.post("/stk/register", async (req, res) => {
  try {
    const { redirectUrl } = req.body || {};
    if (!redirectUrl) return res.status(400).json({ ok: false, error: "redirectUrl is required" });
    if (!pendingVerifier) {
      return res.status(400).json({ ok: false, error: "No pending sign-in. Call /stk/signin-url first." });
    }
    const code = parseAuthorizationCode(redirectUrl);
    const token = await exchangeToken(code, pendingVerifier);
    const info = await registerDevice(token);
    pendingVerifier = null;
    deviceInfo = info;
    fs.writeFileSync(CREDS_PATH, JSON.stringify(info, null, 2));
    let devices = [];
    try {
      devices = await getOwnedDevices(info);
    } catch {
      /* device list is best-effort */
    }
    res.json({ ok: true, connected: true, devices });
  } catch (e) {
    console.error("stk register error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/stk/status", async (_req, res) => {
  if (!deviceInfo) return res.json({ ok: true, connected: false });
  try {
    const devices = await getOwnedDevices(deviceInfo);
    res.json({ ok: true, connected: true, devices });
  } catch (e) {
    res.json({ ok: true, connected: true, devices: [], warning: e.message });
  }
});

app.post("/stk/disconnect", (_req, res) => {
  deviceInfo = null;
  try {
    fs.unlinkSync(CREDS_PATH);
  } catch {
    /* file may not exist */
  }
  res.json({ ok: true, connected: false });
});

app.post("/stk/send", async (req, res) => {
  try {
    if (!deviceInfo) return res.status(400).json({ ok: false, error: "Kindle account not connected" });
    const { epubBase64, title, author, targetDevices } = req.body || {};
    if (!epubBase64) return res.status(400).json({ ok: false, error: "epubBase64 is required" });
    const buffer = Buffer.from(epubBase64, "base64");
    const result = await sendFile(deviceInfo, { buffer, title, author, format: "epub", targetDevices });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("stk send error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/translate", async (req, res) => {
  try {
    const { title, html, targetLang } = req.body || {};
    if (!html || !targetLang) {
      return res.status(400).json({ ok: false, error: "html and targetLang are required" });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ ok: false, error: "Translation not configured (OPENROUTER_API_KEY missing)" });
    }
    const result = await translateHtml(
      { title, html, targetLang },
      {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
        referer: process.env.OPENROUTER_REFERER || "",
        title: process.env.OPENROUTER_TITLE || "Article to Kindle",
      }
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("translate error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { kindleEmail, filename, title, epubBase64 } = req.body || {};
    if (!kindleEmailValid(kindleEmail)) {
      return res.status(400).json({ ok: false, error: "A valid @kindle.com address is required" });
    }
    if (!epubBase64) {
      return res.status(400).json({ ok: false, error: "epubBase64 is required" });
    }
    const epubBuffer = Buffer.from(epubBase64, "base64");
    if (epubBuffer.length > 45 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "EPUB exceeds the 45 MB email limit" });
    }
    const info = await sendEpubToKindle({ kindleEmail, filename, title, epubBuffer });
    res.json({ ok: true, ...info });
  } catch (e) {
    console.error("send error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/test", async (req, res) => {
  try {
    const { kindleEmail } = req.body || {};
    if (!kindleEmailValid(kindleEmail)) {
      return res.status(400).json({ ok: false, error: "A valid @kindle.com address is required" });
    }
    const epubBuffer = await buildTestEpub();
    const info = await sendEpubToKindle({
      kindleEmail,
      filename: "article-to-kindle-test.epub",
      title: "Article to Kindle — Test",
      epubBuffer,
    });
    res.json({ ok: true, ...info });
  } catch (e) {
    console.error("test error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => {
  console.log(`Article to Kindle delivery service listening on http://localhost:${PORT}`);
  verifySmtp()
    .then(() => console.log("SMTP: connection verified."))
    .catch((e) => console.log("SMTP: not verified —", e.message));
});
