# Implementation evidence

Accepted initial RED: `RED.md`, `npm test`, 18 behavioral failures before production code.

## Stage 1: registration, basic display and OAuth dispatch

Production added: `index.js`; manifest declares its default ESM entry. No test changes.

Focused command:

```powershell
node --test --test-isolation=none --test-name-pattern='Pi package|registered through|new chat stays|quota card|earned resets|server analytics|analytics failure|null quota|requests use|prevents credential|active branch' test/usage.test.js
```

Result: 14 pass, exit 0. Covers discovery, public registration, initial hidden state,
native display, interval refresh, basic limits/stats, null/zero, safe auth feedback,
official GET destinations and branch visibility.

Subsequent RED command, before implementing cache or cancellation:

```powershell
node --test --test-isolation=none --test-name-pattern='failed refresh|hide persists|shutdown cancels' test/usage.test.js
```

Result: 3 fail, exit 1. Failed refresh replaces the last-good 25% with unavailable;
hide and shutdown do not provide an AbortSignal (reading `.aborted` fails).
These now reach the missing stale/cancellation behavior after prerequisite requests work.

```powershell
node --test --test-isolation=none --test-name-pattern='new session ignores' --test-timeout=1000 test/usage.test.js
```

Result: 1 cancelled, exit 1, waiting on the obsolete session's second request.
This is a behavior-induced timeout, but does not independently prove the final
no-late-render assertion. The initial complete run was interrupted after exposing
these failures because the obsolete pending request never settled.

Stage 1 is deliberately incomplete and paused for additional RED coverage.
No overall GREEN, regression or review claim yet.

## Stage 2: complete safe metrics, source caches and bounded lifecycle

Accepted coordinator-verified stage-2 RED in `RED.md`: 34 tests, 15 pass,
19 fail, exit 1. Production remained unchanged while the designer added tests.
Concrete failures covered omitted metrics, independent stale caches, late auth
dispatch, late session writes, overlapping polls, timeout and malformed limits.

Production change: `index.js` formats the verified usage/statistics fields,
stores only formatted per-source lines and success times, scopes caches to
in-memory resolved credentials, aborts obsolete generations, shares active
refreshes and bounds auth/HTTP/JSON work to 25 seconds. Profile and opaque IDs
are excluded. No test files changed during implementation.

```powershell
npm test
```

Result: **34 tests, 34 pass, 0 fail/cancelled/skipped**, exit **0**.
No refactoring was needed after GREEN.

Documentation-only exception: `README.md`, `LICENSE` and package metadata.
Independent verification, real host rendering and final reviews remain pending.

Package checks: `node --check index.js` exits 0. `npm pack --dry-run` could not
write the isolated user's default npm-cache log directory; retrying with
`npm pack --dry-run --cache ../.npm-cache` exits 0 and includes exactly
`index.js`, `README.md`, `LICENSE`, `package.json` (4 files, 6.7 kB packed at this
stage). Cache is outside the repository and no archive was created.

## Stage 3: clear visible foreign-account data before new responses

Accepted RED: `RED.md` stage 3, selected account-switch loading test fails
because the old account's 25% / 123456 values remain visible while both new
account requests are pending. The coordinator verified and authorized this fix.

Production change: `index.js` renders empty/unavailable sections immediately
after clearing the cache on a changed credential identity, before dispatching
the new requests. The locked regression test was not modified.

```powershell
node --test --test-isolation=none --test-name-pattern='account switch clears visible foreign metrics' test/usage.test.js
```

GREEN: **1 selected, 1 pass**, exit 0.

Broader regression: `npm test` — **35 tests, 35 pass, 0 failed/cancelled/skipped**,
exit 0. `node --check index.js` exits 0. Repeated
`npm pack --dry-run --cache ../.npm-cache` exits 0: exactly the same 4 intended
files, 6.7 kB packed. No refactoring performed. No behavior-change TDD exception.
Documentation and package metadata used the documentation/infrastructure exception.

Implementation ownership stops here for independent runner and review. Native
Electron UI and live backend verification remain external to this synthetic suite.

## Stage 4: stable account identity and failed verification

Both correctness findings accepted: failed auth resolution cannot verify account
ownership, and bearer rotation must not invalidate a verified account's cache.
The coordinator accepted Stage 4 RED: the five selected identity/rotation tests
failed against unchanged production code. Stage 4 supersedes the earlier
auth-resolution-stale rule; source failures still retain same-account stale data.

`index.js` now clears account identity and formatted cache when auth throws or
times out, and requires Pi's resolved `ChatGPT-Account-Id` header before HTTP
dispatch. That stable account value is the in-memory cache key; the bearer is
used only for request authorization. No token is retained as cache identity.
The README describes the corrected security boundary. Tests were not changed.

```powershell
node --test --test-isolation=none --test-name-pattern='unverified auth identity|rotated bearer|missing verified account' test/usage.test.js
```

GREEN: **5 selected, 5 pass**, exit 0. Broader regression: `npm test` — **39 tests,
39 pass, 0 failed/cancelled/skipped**, exit 0. `node --check index.js` exits 0.
`npm pack --dry-run --cache ../.npm-cache` exits 0: the same four intended files,
6.8 kB packed. No refactoring or behavior-change TDD exception. Independent rerun
and correctness re-review remain required.

## Stage 5: installed SDK's headerless OAuth

Accepted RED: Stage 5 in `RED.md`, seven selected tests with three failures and
four passing malformed-identity regressions. The installed SDK supplies a
resolved access token without prebuilt account headers. Production previously
refused that valid runtime account, producing zero requests instead of two.
Rotation tests initially failed at this same prerequisite.

`index.js` now imports the standard Node Buffer implementation and, only when
there is no usable account header, decodes the resolved token's base64url JSON
payload for `https://api.openai.com/auth.chatgpt_account_id`. A nonempty string
claim becomes both the outgoing account header and stable in-memory cache key.
Malformed/missing/non-string/empty claims still fail closed; a supplied header
retains precedence. This follows trusted Pi OAuth resolution and official-origin
validation; it makes no local signature-verification claim and reads no auth file.
README describes installed SDK compatibility and the provenance boundary.

```powershell
node --test --test-isolation=none --test-name-pattern='headerless OAuth|installed SDK headerless' test/usage.test.js
```

GREEN: **7 selected, 7 pass**, exit 0, including the formerly blocked rotation
assertions. Post-GREEN refactoring removed one redundant catch comment only.
The focused command passed again afterward. Broader regression: `npm test` —
**46 tests, 46 pass, 0 failed/cancelled/skipped**, exit 0.
`node --check index.js` exits 0; `npm pack --dry-run --cache ../.npm-cache` exits
0 with exactly four intended files, 7.1 kB packed. Tests were not changed by the
production owner; no behavior-change TDD exception.

Stopped for independent commands, native final-plugin execution and review.
