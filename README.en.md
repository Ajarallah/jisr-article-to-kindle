<p align="center">
  <img src="extension/icons/icon128.png" width="88" alt="Jisr icon" />
</p>

<h1 align="center">جسر · Jisr</h1>

<p align="center">
  <strong>Turn any article into a Kindle book worth reading.</strong><br />
  A browser extension that builds the EPUB locally, gets Arabic right, and delivers it to your Kindle library.
</p>

<p align="center">
  <a href="https://github.com/Ajarallah/jisr-article-to-kindle/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/Ajarallah/jisr-article-to-kindle/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Version 0.3.0" src="https://img.shields.io/badge/version-0.3.0-CB3F28" />
  <img alt="Chrome Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" />
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-171512" /></a>
</p>

<p align="center">
  <a href="#why-jisr">Why Jisr?</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#repository-guide">Repository guide</a> ·
  <a href="#development">Development</a> ·
  <a href="./README.md">العربية</a>
</p>

<p align="center">
  <img src="media/screenshots/jisr-hero.png" alt="Jisr translating an article and showing the bilingual Kindle book preview" />
</p>

<p align="center">
  <sub>Actual Jisr interfaces: translation and glossary controls, followed by the pre-send bilingual reader preview.</sub>
</p>

> **Project status:** Jisr is pre-release software and is currently installed manually in developer mode. EPUB download is always available as a fallback if direct delivery fails.

<a id="why-jisr"></a>

## Why Jisr?

Most “send to Kindle” tools treat an article as an ordinary English document. Jisr handles the complete reading flow: capture the page you can see, build a well-formed Arabic book, and deliver it through the Amazon session already open in your browser.

<table>
  <tr>
    <td width="33%">
      <strong>1 · Capture what you read</strong><br />
      Works from the rendered page, including articles behind a login or subscription.
    </td>
    <td width="33%">
      <strong>2 · Build a real book</strong><br />
      EPUB with navigation, cover, metadata, Arabic typography, and correct RTL direction.
    </td>
    <td width="33%">
      <strong>3 · Deliver directly</strong><br />
      Browser to Amazon through your session—no Jisr account or approved-sender email.
    </td>
  </tr>
</table>

## Highlights

### Arabic reading that holds together

- RTL direction at the book, chapter, and text levels, with Latin runs isolated inside Arabic.
- Optional Amiri font embedding for consistent Arabic shaping on Kindle devices.
- Covers sized for current Kindle devices, with editable title and author.
- Reader preview before delivery and a table of contents built from article headings.

### Translation and study

- Optional OpenRouter translation with retries, fallback, progress, and cancellation.
- Bilingual mode that keeps each original passage beside its translation.
- Study glossary that turns difficult terms into Kindle popup footnotes where supported.
- Structure-safe translation: code blocks are skipped and links stay in place.

### More than one article

- Convert Markdown and Word files into EPUB.
- Send highlighted text only, or manually pick a region of the page.
- Compile several saved articles into one multi-chapter book.
- Keep a private local send history with links back to each source.

<p align="center">
  <img src="media/screenshots/jisr-more.png" alt="Jisr converting a file and combining several articles into one Kindle book" />
</p>

<p align="center">
  <sub>Convert a Markdown or Word file, or compile a reading list into one book with its own table of contents.</sub>
</p>

<a id="quick-start"></a>

## Quick start

### Requirements

| Requirement | Why |
|---|---|
| Chrome, Brave, Edge, or Arc | A Chromium browser with Manifest V3 support |
| An Amazon account connected to Kindle | Required for direct delivery to your library |
| Optional OpenRouter API key | Translation and glossary only; EPUB building and delivery do not need it |

### Install

```bash
git clone https://github.com/Ajarallah/jisr-article-to-kindle.git
```

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension/` directory.
5. Open your Amazon marketplace and sign in to the account connected to Kindle.

### Configure translation—optional

Enter an OpenRouter key in Jisr settings, or create the local development secret:

```bash
cp extension/src/secrets.example.js extension/src/secrets.js
```

Then place the key in `extension/src/secrets.js`. The file is excluded from Git. Never publish a key inside a public extension package; extensions can be unpacked and inspected.

### Use

1. Open an article and click the **جسر** toolbar icon, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>.
2. Review the extracted title, author, and cover.
3. Optionally enable images, translation, bilingual mode, or the study glossary.
4. Choose **معاينة** to inspect the book, then **إرسال إلى كندل** or **تنزيل EPUB**.

The book usually appears in the Kindle library within a few minutes.

## How it works

```text
Rendered page
      ↓ local extraction
Clean content + article metadata
      ↓ optional translation
EPUB3 + cover + navigation
      ↓ browser Amazon session
Kindle library
```

- Jisr extracts from the rendered DOM with Mozilla Readability plus a fallback for complex pages.
- It builds the complete EPUB inside the extension with JSZip; Jisr operates no hosted service in the build or delivery path.
- Only when translation or glossary is enabled does article text go to OpenRouter using the user's key.
- Direct delivery uploads the book to Amazon through the signed-in user's Send to Kindle session.

Read the [technical architecture](docs/architecture.md) and [Send to Kindle mechanism](docs/03-official-s2k-mechanism.md).

## Privacy and permissions

Jisr has no analytics, tracking, user accounts, or hosted content pipeline. Settings, history, and the API key stay in browser storage. Article text leaves the browser only for the service required by the action you selected.

| Permission | Use |
|---|---|
| `activeTab` and `scripting` | Read the article only after the user clicks Jisr |
| `storage` | Keep settings and send history locally |
| Amazon and Amazon S3 hosts | Check the session and upload the EPUB to Kindle |
| `openrouter.ai` | Translation and glossary, only when enabled |
| Optional site access | Embed article images from that site after user approval |

See the full [privacy policy](store/PRIVACY.md).

<a id="repository-guide"></a>

## Repository guide

| Path | Role |
|---|---|
| `extension/` | The product: Manifest V3 extension, UI, EPUB building, and delivery |
| `extension/src/` | Extraction, translation, covers, preview, delivery, and settings |
| `extension/lib/` | Vendored libraries and fonts; no runtime build step required |
| `server/` | Node test, ESLint, and icon-generation harness; not a runtime server |
| `docs/` | Research, design decisions, architecture, and delivery protocol notes |
| `store/` | Chrome Web Store copy, privacy policy, and permission justifications |
| `scripts/` | Store-ready extension packaging |
| `media/` | Product screenshots used by the documentation |

<a id="development"></a>

## Development

Tests require Node.js 18 or newer:

```bash
cd server
npm ci
npm run lint
npm test
```

Build a clean extension ZIP:

```bash
./scripts/package-extension.sh
```

The code under `extension/` requires no bundler or development server. Load that directory in the browser and reload the extension after making changes.

## Project status and limits

| Item | Status |
|---|---|
| Current version | `0.3.0` |
| Project stage | Pre-release |
| Verification | 54 automated tests + ESLint + GitHub Actions |
| Direct delivery | Verified against Amazon's Send to Kindle flow |
| Chrome Web Store | Not published yet; manual installation only |

Before a public release, Jisr still needs repeated physical-Kindle checks for Arabic shaping, bilingual layout, popup footnotes, images, and device-specific covers. Any bundled translation credential must also move behind a publisher-controlled proxy. Amazon's delivery endpoints are private and undocumented, so EPUB download will remain a permanent fallback.

## Documentation

- [Technical architecture](docs/architecture.md)
- [Design decision log](docs/DECISIONS.md)
- [Send to Kindle mechanism](docs/03-official-s2k-mechanism.md)
- [Changelog](CHANGELOG.md)
- [Privacy policy](store/PRIVACY.md)
- [Security policy](SECURITY.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Chrome Web Store listing](store/LISTING.md)

## Contributing and support

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) first — it covers running the extension unpacked, the two commands CI runs, and the conventions the code expects. For bugs and feature requests, open an [issue](https://github.com/Ajarallah/jisr-article-to-kindle/issues) with the page URL, reproduction steps, and browser version. Never attach API keys or Amazon account data.

For anything security-related, use private vulnerability reporting rather than an issue — scope and known limits are in [SECURITY.md](SECURITY.md).

## License and credits

The code is licensed under [MIT](LICENSE). Third-party components retain their own licenses, including Mozilla Readability, JSZip, Mammoth, Marked, Amiri, IBM Plex Sans Arabic, and the credited icon assets.
