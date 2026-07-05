# Privacy Policy — Article to Kindle

_Last updated: 2026-07-05_

Article to Kindle is designed to be **private by default**. In its normal
(default) mode it runs entirely in your browser and talks only to services you
already own. The publisher operates **no server** in this default path and
**collects, stores, and receives no personal data or article content**.

## What the extension does with data

**Article content.** When — and only when — you click the extension on a page,
it reads the readable content of that single active tab to build an EPUB. This
happens locally in your browser. The content is not sent to the publisher.

**Delivery to Kindle (default: Amazon OAuth).** When you press send, the EPUB is
uploaded **directly from your browser to Amazon** using your own Amazon account,
authorized once via Amazon's sign-in (OAuth). The file goes to your Kindle
library. The publisher never sees or handles the file. Your Amazon authorization
token is stored locally in your browser (`chrome.storage`) and is sent only to
Amazon.

**Optional AI translation.** Only if you turn translation on: the article text is
sent to OpenRouter (an AI gateway) using **your own OpenRouter API key**, which
you enter and which is stored locally in your browser. That request goes directly
from your browser to OpenRouter and is governed by OpenRouter's and the selected
model provider's privacy policies. If you never enable translation, no text is
ever sent anywhere except Amazon.

**Settings.** Your preferences (default language, etc.) are stored locally in your
browser via `chrome.storage`. They are not transmitted to the publisher.

## What we do NOT do

- No analytics, no tracking, no telemetry, no advertising identifiers.
- No collection of browsing history, page contents, or personal information.
- No sale or sharing of any data (there is none to sell or share).
- No remote code: all logic ships inside the extension package.

## Optional self-hosted fallback

The project also offers an optional self-hosted backend (for email delivery or a
translation proxy). If you choose to run it yourself, it runs on infrastructure
**you** control with credentials **you** provide; the publisher has no access to
it. Using it is entirely your choice.

## Third parties you may connect to

- **Amazon** (Send to Kindle) — required for delivery; governed by Amazon's privacy policy.
- **OpenRouter** — only if you enable translation; governed by OpenRouter's privacy policy.

## Contact

Questions: ajarallah93@gmail.com
