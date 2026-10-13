# Security Policy

Jisr is a browser extension. It runs entirely in the browser: there is no Jisr
server, no account, and no analytics. That shape decides most of what follows.

## What Jisr holds

| Data | Where it lives | Leaves the browser? |
|---|---|---|
| Preferences (domain, fonts, defaults) | `chrome.storage.sync` | Only through Chrome profile sync, if the user has it on |
| OpenRouter API key | `chrome.storage.local` | Only to the translation endpoint, and only when translation or the glossary is used |
| Send history and reading list | `chrome.storage.local` | No |
| Article content | Memory, and the EPUB it builds | To Amazon on delivery; to OpenRouter only if translation or the glossary is on |

Jisr never asks for an Amazon password. Delivery rides the Amazon session the
browser already holds, the same way Amazon's own Send to Kindle extension does.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting on this
repository. Please do not open a public issue for anything exploitable.

Include what you did, what happened, and the browser and version. A proof of
concept helps; a working exploit is not required.

Do not include API keys, Amazon cookies, or personal article content in a
report — a description of the shape of the problem is enough.

## Scope

In scope:

- Anything that sends article content, an API key, or an Amazon session
  anywhere other than the endpoints listed above.
- Injection into the extension's own pages (popup, options, preview, reading
  list, file drop).
- Bypassing the host-permission model, or reading pages the user did not open
  Jisr on.
- A generated EPUB that can act on the reader rather than be read by it.

Out of scope:

- Amazon's own Send to Kindle endpoints. They are private and undocumented;
  Jisr replicates the official extension's use of them and can change with them.
  Report breakage as a normal issue.
- The bundled-key build described in `extension/src/secrets.example.js`. A key
  inside an extension is not a secret, that file says so, and no published build
  should carry one.
- Findings that require the user to install a modified copy of the extension.

## Known limits

- **Undocumented upstream.** Amazon can change the delivery endpoints without
  notice. EPUB download is always available as a fallback so a break costs
  convenience, not the document.
- **Optional broad host permission.** Image embedding asks for access to the
  article's own origin at the moment it is needed, not at install time. The
  manifest declares `https://*/*` as *optional* for that reason; Chrome will not
  grant it until the user accepts a specific request.
- **Translation is third-party.** Text sent for translation is processed by
  OpenRouter and whichever model it routes to, under their terms.
