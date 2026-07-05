# Article to Kindle

A Chrome extension that turns the article you are reading into a clean EPUB and
sends it to your Kindle — with optional AI translation (English ⇄ Arabic and
more). Built to render **Arabic / right-to-left** correctly, which the existing
tools do not.

It has two parts:

1. **The extension** (`extension/`) — reads the article, builds the EPUB in your
   browser, and hands it to the delivery service.
2. **The delivery service** (`server/`) — a small program that emails the EPUB to
   your Kindle and, if you want, translates the article first. It runs on your
   own machine (or your VPS) so your keys stay yours.

> New here? Read the plain-language walkthrough in
> [`SUMMARY.md`](SUMMARY.md) first (Arabic).

---

## What you need before starting

- Google Chrome (or any Chromium browser: Edge, Brave).
- [Node.js](https://nodejs.org) 18 or newer, to run the delivery service.
- Your Kindle email address (ends in `@kindle.com`).
- **To actually send:** an email account the service can send from (e.g. a Gmail
  account with an "App Password"). Without this you can still preview and
  download EPUBs.
- **To translate:** a free/paid [OpenRouter](https://openrouter.ai) API key.

---

## Step 1 — Start the delivery service

```bash
cd server
npm install
cp .env.example .env      # then open .env and fill in your details
npm start
```

Open `.env` and set, at minimum:

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SENDER_EMAIL` — the email account that
  sends to your Kindle. For Gmail, create an **App Password** at
  <https://myaccount.google.com/apppasswords> and use it as `SMTP_PASS`.
- `OPENROUTER_API_KEY` — only if you want translation.

When it starts you should see:

```
Article to Kindle delivery service listening on http://localhost:8787
SMTP: connection verified.
```

Leave this window open. (Later you can run the same thing on your VPS so you do
not need your laptop on.)

## Step 2 — Load the extension

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose the `extension/` folder in this project.
4. The "A2K" icon appears in your toolbar.

## Step 3 — One-time settings

1. Click the A2K icon, then the ⚙ gear (opens Settings).
2. Enter your **Kindle email** (`something@kindle.com`).
3. Leave **Delivery service** as `http://localhost:8787` (unless you moved it to
   a VPS).
4. **Approve the sender — required once, easy to miss.** Amazon silently ignores
   documents from an address you have not approved. Go to Amazon →
   *Manage Your Content and Devices* → *Preferences* → *Personal Document
   Settings* → *Approved Personal Document E-mail List*, and add the address in
   your `SENDER_EMAIL`.
5. Click **Save**, then **Send a test document**. If it arrives on your Kindle in
   a few minutes, everything is wired up. If not, the sender is not approved yet
   (repeat step 4).

## Step 4 — Send an article

1. Open any article in Chrome.
2. Click the A2K icon. It shows the article title and word count.
3. (Optional) tick **Translate before sending** and pick a language.
4. Click **Send to Kindle** — or **Download EPUB** to just save the file.

It appears on your Kindle within a few minutes.

---

## How do I know it works? (testing checklist)

- **EPUB builds correctly** — click **Download EPUB** on an article and open the
  file in any e-reader (or on your computer). Text, images, and links should be
  clean.
- **Arabic renders right-to-left** — open an Arabic article (or translate an
  English one into Arabic) and download it: the text should read right-to-left
  with proper Arabic shaping, and page turns should go the correct way on Kindle.
- **Delivery works** — use **Send a test document** in Settings; a short test
  file (with one Arabic line) should reach your Kindle.
- **Translation works** — with an OpenRouter key set, translate an English
  article into Arabic; the meaning and paragraph structure should be preserved.

Automated checks used during development (structure, RTL levels, well-formed
XHTML, translation structure-preservation, server endpoints) all pass — see
`docs/02-analysis-and-architecture.md` §4–5.

---

## Project layout

```
extension/            Chrome extension (Manifest V3)
  manifest.json
  src/
    popup.*           the toolbar UI + orchestration
    options.*         settings + test-send
    extract.js        pulls the article out of the page (Readability)
    epub.js           builds the EPUB3 in the browser (RTL + Arabic font)
  lib/                vendored: Readability, JSZip, Amiri font
  icons/
server/               delivery + translation service (Node/Express)
  src/
    server.js         HTTP endpoints: /translate /send /test /health
    translate.js      structure-preserving translation via OpenRouter
    mailer.js         emails the EPUB to your Kindle (Nodemailer)
    testEpub.js       tiny EPUB for the test-send
  .env.example        copy to .env and fill in
docs/                 market research, architecture, decision log
SUMMARY.md            plain-language summary (Arabic)
```

## Notes

- Nothing is sent anywhere until you configure your own accounts — no data leaves
  your machine except (a) the email to your own Kindle and (b) the article text
  to OpenRouter *only if you turn translation on*.
- Third-party components: Mozilla Readability (Apache-2.0), JSZip (MIT/GPL),
  Amiri font (OFL-1.1).
