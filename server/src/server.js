import "dotenv/config";
import express from "express";
import cors from "cors";
import { translateHtml } from "./translate.js";
import { sendEpubToKindle, verifySmtp } from "./mailer.js";
import { buildTestEpub } from "./testEpub.js";

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

app.get("/health", async (_req, res) => {
  const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  res.json({ ok: true, smtpConfigured: hasSmtp, translationConfigured: hasOpenRouter });
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
