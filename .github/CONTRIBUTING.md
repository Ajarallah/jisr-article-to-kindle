# Contributing

Thanks for looking. Jisr is small on purpose, so the useful contributions are
usually specific ones: a site whose article extraction comes out wrong, an
Arabic rendering bug on a particular Kindle, a permission that could be
narrower.

## Running it

```bash
git clone https://github.com/Ajarallah/jisr-article-to-kindle.git
```

Load `extension/` as an unpacked extension (`chrome://extensions` → Developer
mode → Load unpacked). There is no build step: edit a file, hit reload on the
extension card, done.

Tests and lint live in `server/`, which is a test harness and not a server:

```bash
cd server
npm ci
npm run lint
npm test
```

Both must pass before a pull request; CI runs the same two commands.

## What the code expects

- **No build step, no bundler.** `extension/` is loaded as-is. Vendored
  libraries go in `extension/lib/` with their license.
- **No runtime dependency added to the extension.** The `server/` folder may
  have dev dependencies; the extension may not.
- **Nothing untrusted reaches `innerHTML`.** Article titles, model output and
  server replies are built with DOM nodes or `textContent`. `setStatus` is text
  for this reason.
- **Secrets go to `chrome.storage.local`, never `sync`.** `sync` roams to
  Google's servers through the user's profile.
- **Arabic copy** is فصحى وسطى, no diacritics, technical terms stay in Latin
  script. Match the strings already in the file you are editing.
- **Comments explain why, not what.** The existing comments record what was
  measured and what was rejected; that is the standard.

## Pull requests

One concern per pull request. Say what you changed and how you checked it — a
failing case that now passes is worth more than a description.

If the change touches extraction, delivery, or the EPUB, say which real page or
device you tried it on. Those three are where "works on my article" and "works"
are furthest apart.

## Reporting a bug

Open an issue with the page URL, what you expected, what you got, and your
browser version. For a rendering problem, which Kindle. For anything
security-related, see [SECURITY.md](../SECURITY.md) instead.
