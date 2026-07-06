# Article to Kindle

A Chrome extension that turns the article you are reading into a clean **EPUB**
and sends it to your Kindle — with proper **Arabic / right-to-left** support and
optional **AI translation**.

The headline: delivery uses **Amazon's own "Send to Kindle"** (your Amazon
account, authorized once) — so there is **no email setup and no "approved
sender" step**, unlike every email-based competitor.

## Two parts

1. **The extension** (`extension/`) — reads the article, builds the EPUB in your
   browser (with translation + Arabic RTL), and hands it to the delivery service.
2. **The delivery service** (`server/`) — a small program that talks to Amazon's
   Send-to-Kindle API on your behalf (it holds your one-time Amazon
   authorization). Runs on your own machine or your VPS, so your data stays
   yours. It also offers an email fallback.

> Why a service at all? Amazon's Send-to-Kindle API needs a non-standard request
> signature and endpoints that a browser cannot call directly (CORS). The service
> is the small, private piece that does that. See `docs/DECISIONS.md` (D9).

## Quick start (local test)

```bash
# 1) start the delivery service
cd server
npm install
npm start          # → http://localhost:8787
```

```
# 2) load the extension
#    chrome://extensions → Developer mode → Load unpacked → choose extension/
```

```
# 3) connect your Kindle (once)
#    Click the extension → gear (Settings) → "ربط حساب كندل" (Connect Kindle)
#    → sign in to Amazon → it auto-connects and lists your devices.
```

```
# 4) send
#    Open any article → click the icon → "إرسال إلى كندل" (Send to Kindle).
#    Or "تنزيل EPUB" (Download EPUB) to just save the file.
```

## Translation (optional, bring your own key)

Get an OpenRouter key at <https://openrouter.ai/keys>, paste it in Settings →
Translation. Translation then runs **directly from your browser** to OpenRouter
(the article text is sent only when you enable translation). Arabic output
follows: فصحى وسطى, no tashkeel, no "بل".

## Email fallback

If you prefer not to link your Amazon account, the service can email the EPUB to
your `@kindle.com` address instead (Settings → "طريقة بديلة: الإرسال بالبريد").
This path requires SMTP env vars in `server/.env` and Amazon's approved-sender
step. See `server/.env.example`.

## Run the service on your VPS (no laptop needed)

The service is stateless except for your Kindle credentials
(`server/.stk-credentials.json`, git-ignored). Deploy `server/` to your VPS,
run it under a process manager (pm2/systemd) behind HTTPS, then set the
extension's "خدمة التوصيل" (Delivery service) URL to your domain. Add that
domain when the extension asks for host permission.

## Testing

```bash
cd server && npm test      # unit tests: STK signing + PKCE + code parsing
```

The signing algorithm is verified self-consistently (the produced signature
decrypts back to the exact SHA-256 digest). The live Amazon round-trip is
verified by connecting your account once (step 3 above) and sending — see
`SUMMARY.md` for what is verified vs. what needs your one-time sign-in.

## Project layout

```
extension/            Chrome extension (Manifest V3)
  manifest.json
  src/
    popup.*           toolbar UI + orchestration (send via Kindle account / email / download)
    options.*         settings: connect Kindle, translation key, service URL, email fallback
    extract.js        pulls the article out of the page (Readability)
    epub.js           builds the EPUB3 in the browser (RTL + Arabic font)
    translate.js      client-side structure-preserving translation (OpenRouter)
  lib/                vendored: Readability, JSZip, Amiri font
server/               delivery service (Node/Express)
  src/
    stk.js            Amazon Send-to-Kindle client (OAuth2 + signed upload)
    server.js         HTTP endpoints
    translate.js      email-path translation (legacy/optional)
    mailer.js         email fallback (Nodemailer)
  test/               unit tests
docs/                 market research, architecture, decision log
store/                privacy policy + Chrome Web Store listing
SUMMARY.md            plain-language summary (Arabic)
```

## Privacy

In the default path the extension talks only to your own delivery service (which
talks only to your Amazon account) and, if you enable translation, to OpenRouter
with your own key. No third-party server operated by the publisher, no analytics,
no tracking. Full text: `store/PRIVACY.md`.

## Third-party components

Mozilla Readability (Apache-2.0), JSZip (MIT/GPL), Amiri font (OFL-1.1). The STK
flow is a port of the approach used by the open-source `stkclient` and
`Xetera/kindle-api` projects; it uses Amazon's private API (see DECISIONS.md D9
for the risk note).
