## What this changes

<!-- One or two sentences. If it fixes an issue, link it. -->

## Why

<!-- The problem, not the patch. What went wrong, or what could not be done before. -->

## How it was checked

<!-- A failing case that now passes, a page you tried it on, a device you read it on.
     "Tests pass" alone is only enough when the change is covered by them. -->

- [ ] `npm run lint` and `npm test` pass from `server/`
- [ ] Loaded the unpacked extension and used the path this touches
- [ ] No new runtime dependency in `extension/`
- [ ] Nothing untrusted reaches `innerHTML`
