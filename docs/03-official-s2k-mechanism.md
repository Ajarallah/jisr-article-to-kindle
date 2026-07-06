# Official "Send to Kindle" delivery mechanism (reverse-engineered)

Extracted from the official Amazon extension source on disk
(`cgdjpilhipecahhcilnafpblkieebhea` v2.1.1.7, `s2k-worker.js`). This is the exact
flow our single extension will replicate for client-side delivery — no server,
no OAuth device registration, no request signing, no email, no approved-sender.

## Auth model (the key simplification)

- **The user's amazon.com session cookies.** All calls go to the user's Amazon
  domain; the browser attaches their login cookies (credentialed fetch). The
  only requirement: the user is signed in to Amazon in the browser (normal state).
- **Anti-CSRF token** in header `anti-csrftoken-a2z` on every state-changing call.
- No `Authorization`, no device keys, no signatures. (`s2k-worker.js:11203-11206`)

## Base URL

`{amazonDomain}/sendtokindle`, e.g. `https://www.amazon.com/sendtokindle`.
Regional domains supported (co.uk, .de, .co.jp, …). (`getBaseUrl` 11225-11227)

## CSRF acquisition (`getOrRefreshCsrfToken` 11377)

1. `GET {base}/empty` (credentialed).
2. Extract token from the returned HTML: regex `name='csrfToken' value='(.*)' />`.
3. Cache 60s in `chrome.storage.local`.
4. Send as header `anti-csrftoken-a2z`.

## The send flow (`sendWorkflow` 12484)

Given a built EPUB (base64), all calls are POST JSON with CSRF unless noted:

**1. List devices** — `POST {base}/get-device-list` (`requestDevicesList` 11579)
   body: `{ extName:"chrome_ocs", extVersion:"1.0" }`
   → `{ ownedDevices: [ { deviceSerialNumber, deviceName, ... } ] }`

**2. Init / get upload URL** — `POST {base}/init` (`sendToKindleInit` 11698)
   body: `{ extName:"chrome_ocs", appVersion:"2.1.1.7", fileSize:<bytes>, fileExtension:"epub" }`
   → `{ uploadUrl:<presigned S3 URL>, stkToken:<string> }`

**3. Upload the EPUB** — `PUT <uploadUrl>` (`uploadToS3` 11740)
   binary body = raw EPUB bytes; header `Content-Type: ""` (empty); **no CSRF**.

**4. Trigger delivery** — `POST {base}/send-v2` (`sendToKindle` 11794)
   body:
   ```json
   {
     "extName": "chrome_ocs",
     "extVersion": "2.1.1.7",
     "inputFormat": "epub",
     "stkToken": "<from step 2>",
     "title": "<title>",
     "dataType": "<see note>",
     "archive": true,
     "deviceList": [],
     "fileSize": <bytes>,
     "inputFileName": "<title>.epub",
     "batchId": "<unique id>",
     "author": "<optional>"
   }
   ```
   - `archive: true` → send to the Kindle **library** (syncs to all devices);
     `deviceList` is then `[]`. `archive: false` → `deviceList` = chosen serials.
     The popup's "Add to Library" toggle maps to `archive`. (13020, 11803)

## App-name constants
`chrome_ocs` (quick send), `chrome_preview` (preview send). (`10940-10941`)

## Notes / open items
- `documentMetadata.dataType` value for the EPUB path was not pinned from source
  (JSDoc only). Try `"epub"`; fall back to omitting it or `"html"` if rejected.
- `{base}/guid-refresh` establishes an `s2kGUID` used to key the CSRF cache;
  likely optional for a minimal client but worth calling once. (13065)
- The old logic uploaded page HTML (`fileExtension:"html"`, server converts via
  `/web-extract`). The new logic uploads a real **EPUB** directly — which is
  exactly our case, so we skip `/web-extract` entirely and send our own EPUB.

## Replication in OUR extension
- `host_permissions`: the amazon domain(s), e.g. `https://www.amazon.com/*`.
- Run these fetches from the extension (service worker or popup) with
  `credentials:"include"`; host permission bypasses CORS for these hosts.
- Sequence: get CSRF → get-device-list (optional) → init → PUT S3 → send-v2.
- Precondition surfaced to user: "sign in to Amazon" (we can detect a 401/empty
  CSRF and prompt them to open amazon.com and log in).
