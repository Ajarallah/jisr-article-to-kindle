# Privacy Policy — Jisr

_Last updated: 2026-08-07_

Jisr is a browser extension that converts the page or file selected by the user into an EPUB and can deliver it to the user's Kindle library. Jisr's publisher operates no account system, analytics service, tracking system, or hosted content pipeline.

## Data processed by the extension

### Article and selected-page content

Jisr reads the active tab only after the user opens the extension or explicitly starts a selection action. Extraction and EPUB generation happen inside the browser. The publisher does not receive the article or generated EPUB.

If the user adds an article to the reading list, the article HTML and basic metadata are stored in `chrome.storage.local` on that browser. The list is capped at 20 entries and can be cleared by the user.

### Files

Markdown and Word files are processed locally in the browser. Jisr does not upload them to the publisher.

### Delivery to Kindle

When the user chooses direct delivery, Jisr communicates with Amazon's Send to Kindle pages using the Amazon session already managed by the browser. The extension does not copy or store the user's Amazon password or session cookies.

The generated EPUB is uploaded directly to the pre-signed Amazon S3 URL returned by Send to Kindle, then Amazon is asked to add the document to the user's library. Amazon processes this data under its own privacy terms.

If direct delivery is unavailable, Jisr offers the EPUB as a local download. The user may then upload it through Amazon's official Send to Kindle page.

### Optional translation and study glossary

Only when the user enables translation or the study glossary, Jisr sends the required article text to OpenRouter using the configured API key. OpenRouter may route the request to the selected model provider. Those services process the request under their own privacy and retention terms.

Translation is optional. Building and downloading an EPUB do not require OpenRouter.

### Images

Image embedding is off by default. When the user enables it, Jisr asks for access to the relevant article or image origin and fetches the selected images directly from that site for inclusion in the EPUB.

## Browser storage

- **Preferences** are stored in `chrome.storage.sync` and may be synchronized by Google through the user's Chrome profile, depending on browser settings.
- **The OpenRouter API key** is stored only in `chrome.storage.local`; Jisr removes keys left in sync storage by older versions.
- **Reading-list content, temporary preview data, picked regions, and send history** are stored in `chrome.storage.local`.
- **Send history** contains title, source URL, site, status, and timestamp. It does not contain the generated EPUB and is capped at 50 entries.

The user can clear Jisr's stored data from the extension settings or by removing the extension.

## What the publisher does not collect

- No browsing history or automatic background page collection.
- No analytics, telemetry, advertising identifiers, or behavioral tracking.
- No Amazon credentials, OpenRouter keys, article content, files, or generated books received by the publisher.
- No sale, rental, or sharing of personal information by the publisher.
- No remotely hosted executable code; extension logic ships in the package.

## Services contacted

| Service | When | Data |
|---|---|---|
| Amazon Send to Kindle and Amazon S3 | Direct delivery | Generated EPUB and book metadata |
| OpenRouter and the selected model provider | Translation or glossary enabled | Required article text and prompts |
| Article/image host | Image embedding enabled | Ordinary image requests from the user's browser |

## Contact

Privacy questions: ajarallah93@gmail.com
