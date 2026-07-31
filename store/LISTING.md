# Chrome Web Store listing — Article to Kindle

## Name
Article to Kindle — clean EPUB + Arabic

## Category
Productivity

## Short description (≤132 chars)
Send any article to your Kindle as a clean EPUB — with optional AI translation and proper Arabic (right-to-left) support.

## Detailed description

Turn the article you are reading into a clean, well-formatted EPUB and send it
straight to your Kindle — in one click.

Unlike most "send to Kindle" tools, Article to Kindle:

• Sends directly through your own Amazon account (Send to Kindle), so there is
  NO email setup and NO "approved sender" step to configure.
• Builds the EPUB inside your browser, so paywalled and login-only articles you
  can already read are captured correctly — and your content stays private.
• Renders Arabic and other right-to-left languages properly, with an embedded
  Arabic font so text is not broken into empty boxes on Kindle.
• Optionally translates the article with AI before sending (deepseek-v4-flash by
  default; bring your own key).
• Also turns dropped Markdown (.md) or Word (.docx) files — e.g. a ChatGPT answer
  you exported — into clean EPUBs on your Kindle.

How it works:
1. Connect your Kindle once (sign in to Amazon).
2. Open any article, click the icon, press Send. It appears on your Kindle in
   a couple of minutes.
3. Prefer a file? Download the EPUB instead.

Private by default: the extension runs in your browser and talks only to
services you already own. No account with us, no tracking, no server in the
middle. See the privacy policy for details.

## Single purpose (required by Google)
Article to Kindle has one purpose: convert the article on the current page into a
clean EPUB and deliver it to the user's own Kindle, with an optional AI
translation step.

## Permission justifications (for reviewers)

- **activeTab + scripting** — Only when the user clicks the extension, the
  extension reads the readable content of the current tab (via Mozilla
  Readability) to build the EPUB. No background or automatic page access.
- **storage** — Stores the user's settings and their Amazon authorization token
  locally in the browser. Nothing is sent to the developer.
- **host access to amazon.com** — Required to deliver the generated EPUB to the
  user's Kindle library through Amazon's Send to Kindle service, authorized by
  the user's own Amazon sign-in.
- **host access to \*.amazonaws.com** — Amazon's Send to Kindle returns a
  pre-signed S3 upload URL; the EPUB bytes are uploaded (PUT) there.
- **host access to openrouter.ai** — Only when the user turns on AI
  translation, the article text is sent to OpenRouter for the model to translate.
- **No remote code** — all executable code is bundled in the package.

## Assets checklist (to produce before submitting)
- [ ] Icon 128×128 (have: icons/icon128.png — verify quality)
- [ ] At least 1 screenshot 1280×800 or 640×400 (popup on a real article)
- [ ] Screenshot: Arabic article rendered RTL on Kindle / in a reader
- [ ] Small promo tile 440×280 (optional but recommended)
- [ ] Privacy policy URL (host store/PRIVACY.md publicly, e.g. GitHub Pages)
- [ ] Support email: ajarallah93@gmail.com
