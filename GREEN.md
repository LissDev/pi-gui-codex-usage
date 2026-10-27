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

## Stage 6: Compact and graphical Detailed workflows

Accepted RED is `RED.md` Stage 6: seven workflow failures and three actual browser
DOM/lifetime failures before production changed. Its full 56-test run had 55
failures; most earlier safety cases were blocked by the command rename, not new
independent safety defects. The confirmed scenario/destination map and sanitized
state contract are in `REQUIREMENTS.md`. The standalone native prototype proved
the view/Chord boundary but is not production verification.

Sequential implementation checkpoints:

1. Renamed to `/codex-usage`, added native chooser and direct compact/detailed/hide
   routing. `node --test --test-isolation=none test/workflow.test.js` gave 4 pass,
   3 fail (quota scope/bar and absent workbench declaration). `npm test` under the
   primary account gave 20 pass, 36 fail: missing public report state and browser
   destination were now reached after the rename prerequisite.
2. Registered the native view and finite service, published safe structured data,
   split quota-only compact rendering from the full report. Running
   `node --test --test-isolation=none test/usage.test.js test/workflow.test.js`
   gave 52 pass, 1 fail: restoring a hidden branch repainted a widget before its
   visibility flag changed. Moved rendering after restoration of that flag.
   Repeated command: **53 pass, 0 fail**, exit 0.
3. Before graphical implementation,
   `node --test --test-isolation=none test/desktop.test.js` exercised the declared
   package frontend and still failed all three actual DOM/lifetime assertions:
   absent Overview/Analytics tabs and polling interval. Implemented the plain
   browser ES module/CSS with native HTML semantics, graphical quota meters,
   three SVG histories and complete tables, keyboard tabs, finite refresh calls,
   subscription hydration and idempotent disposal. Repeated browser command:
   **3 pass, 0 fail**, exit 0, using headless Chrome under the primary account.

Final broader command: `npm test`, primary account to launch synthetic headless
Chrome — **56 tests, 56 pass, 0 failed/cancelled/skipped**, exit 0.

Production files:

- `index.js`: menu/command namespace, compact-only timer/visibility, sanitized
  host-owned replicated report and finite refresh service, graphical data fields.
- `dist/desktop.js`, `dist/desktop.css`, `dist/contract.js`: ready-to-load local
  report, responsive host-theme styling and shared stable service token.
- `vendor/register-desktop-view.js`, `dist/chord-context.js`: copied proven host
  registration helper and Chord context module; no backend Chord state duplicate.
- `package.json`, `package-lock.json`: version 0.2.0 and packaged local assets.
- `README.md`, `THIRD_PARTY_NOTICES.md`: new menu/manual native entry, independent
  compact/details lifetime, development/packaging instructions and both upstream
  MIT notices. Existing plugin MIT license retained.

No production test edits, no runtime npm dependencies, no user build step,
no private runtime package imports, host edits or user-settings changes. No
post-GREEN refactoring. Documentation/packaging metadata are the documented TDD
exception; behavior followed accepted RED. JavaScript syntax checks:

```powershell
$scripts = @('index.js') + @(Get-ChildItem -LiteralPath dist, vendor -Filter *.js | ForEach-Object FullName)
foreach ($script in $scripts) { node --check $script; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Result: exit 0. `npm pack --dry-run --cache ../.npm-cache` exits 0 and includes
exactly 10 files: manifest, index, README, LICENSE, THIRD_PARTY_NOTICES,
dist/desktop.js, dist/desktop.css, dist/contract.js, dist/chord-context.js and
vendor/register-desktop-view.js (15.0 kB packed after the final source-link doc edit).
No archive, push or publication performed by this implementation owner.

Independent native-host execution, accessibility/visual evaluation and review
remain required. Synthetic browser success does not prove native iframe loading,
host close/remount, current backend availability or every desktop theme.

## Stage 7: fresh mount identity and same-session report lifetime

Accepted reviewer findings and verified Stage 7 RED: the two fresh-mount browser
tests exposed cached account A while current identity checking was pending;
the same-session tree test exposed an empty account report after branch change.
Exact command:

```powershell
node --test --test-isolation=none --test-name-pattern='fresh details mount|same-session tree' test/desktop.test.js test/workflow.test.js
```

RED: 3 selected, 3 failed, exit 1, recorded by the test designer against unchanged
production. `dist/desktop.js` now gates initial state hydration and subscription
replays until the first finite refresh succeeds, renders safe loading/unavailable
feedback before that point and retains disposal guards. `index.js` preserves
account-scoped sections on session-tree events while still cancelling obsolete
work and restoring branch-owned compact visibility. Session starts continue to
clear account data. Tests were not edited by the implementation owner.

GREEN: repeated focused command under primary-account headless Chrome —
**3 selected, 3 pass**, exit 0. Then `npm test` — **59 tests, 59 pass, 0 failed/
cancelled/skipped**, exit 0, before any refactoring.

The accepted slop finding was addressed only after GREEN, using the bounded
`code-simplification` skill: removed duplicate bucket serialization from
`analytics.lines` in `index.js` and its compensating filter in `dist/desktop.js`.
Scalar lines, safe metadata, exact validated structured histories, charts and
tables remain. The designer had already refined two historical tests to compare
literal complete public series and demonstrated both passed before the cleanup.

Post-refactor focused command:

```powershell
node --test --test-isolation=none --test-name-pattern='fresh details mount|same-session tree|server analytics shows|complete analytics retains' test/desktop.test.js test/workflow.test.js test/usage.test.js
```

Result: **5 selected, 5 pass**, exit 0. `npm test` again gives **59 tests, 59 pass,
0 failed/cancelled/skipped**, exit 0. All shipped JS passed the Stage 6 syntax
check command. `npm pack --dry-run --cache ../.npm-cache` exits 0 with the same
10 intended assets; a final dry run after the README clarification exits 0 with
15.1 kB packed.
No new dependencies, host/config changes, publication or test edits. No
behavior-change TDD exception. Production is frozen for independent rechecks and
native final-source verification; this report is implementation evidence only.

## Stage 8: explicit finite-refresh identity result

Accepted reviewer finding: an empty successful RPC completion after cancelled
auth work could unlock old cached account data. Stage 8 RED in `RED.md` records
six selected failures, including the real public backend cancellation boundary,
browser false/empty/undefined results, revoking a previously verified view and
same-account stale data with an explicit verified result.

```powershell
node --test --test-isolation=none --test-name-pattern='identity gate rejects|previously verified details|details refresh cancelled|same-account source failure' test/desktop.test.js test/workflow.test.js
```

`index.js` now returns an explicit verification boolean from refresh work and
exposes `{verified:boolean}` through the finite service. Missing session context,
failed identity checks and invalidated generations return false. Current work
that successfully checked official Pi OAuth and a usable account remains true
when a data endpoint fails, allowing safe same-account stale sections.
`dist/desktop.js` unlocks only for explicit true; unverified results and rejected
refreshes revoke the gate, clear its snapshot and show safe unavailable feedback.
Existing disposal guards prevent repaint after close.

GREEN: exact focused command above, primary account for isolated synthetic
Chrome — **6 selected, 6 pass**, exit 0. Broader `npm test` — **65 tests, 65 pass,
0 failed/cancelled/skipped**, exit 0. All shipped JS passed the recorded syntax
check loop. `npm pack --dry-run --cache ../.npm-cache` exits 0, version 0.2.0,
same ten intended files, **15.1 kB** packed. No test edits, new dependencies,
refactoring, publication or host/config changes; no behavior-change TDD exception.

Finding accepted and addressed. Source frozen for independent rerun, reviewer
recheck and final native verification; no overall completion claim.

## Stage 9: inherit live host theme

Accepted RED is the completed Stage 9 record in `RED.md`: initial dark computed
colors pass, then an open report retains dark inline colors after the host root
switches to light. The exact focused command was:

```powershell
node --test --test-isolation=none --test-name-pattern='open details follows host theme changes' test/desktop.test.js
```

Production change is limited to deleting the four article-level theme snapshots
in `dist/desktop.js`. The existing CSS now inherits root background, foreground,
accent and color-scheme, which the installed host updates on theme changes.
No observer, fallback, remount or refresh was added. Test files were not edited.

GREEN: exact focused command, primary account for isolated synthetic Chrome —
**1 selected, 1 pass**, exit 0. Broader `npm test` — **66 tests, 66 pass,
0 failed/cancelled/skipped**, exit 0. `node --check dist/desktop.js` exits 0.
`npm pack --dry-run --cache ../.npm-cache` exits 0: version 0.2.0, same ten intended
files, **15.0 kB** packed. No new refactoring or behavior-change TDD exception.
Finding accepted and fixed; production source frozen for independent verification.

## Analytics display refinement — GREEN (2026-10-27)

Accepted RED: `RED.md`'s completed analytics refinement handoff, following the
confirmed scenario/destination map and atomic typed contract in REQUIREMENTS.
Backend focus had seven tests: six behavioral failures, one already-passing
null-history check (not claimed as RED). Browser focus had eight actual DOM
failures. The coordinator accepted both runs before production edits.

Production changes:

- `index.js`: migrated report sections atomically from legacy strings to typed
  scalar metrics and whitelisted invocation fields, omitted absent fragments
  while preserving zero/false and null series gaps, parsed safe metadata times,
  and formatted compact local timestamps without seconds. No legacy lines field
  remains. Credential origins, generation/identity gates and polling are retained.
- `dist/desktop.js`: typed values and accessible boolean icons, conditional empty
  groups, shared local-calendar 7/30/All history filtering (default 30), separate
  all-time statistics/invocations, dense charts with MM.DD ticks, and complete
  dated heatmaps. Supplied cell values have pointer/keyboard tooltips; weekly
  buckets stay on supplied week starts. Colors use each full series maximum,
  retaining null/missing gaps separately from explicit zero.
- `dist/desktop.css`: heatmap layout, zero/four-level green scale and Less/More
  legend, light/dark semantic colors, boolean icon colors, compact charts and
  period controls. History tables were replaced rather than retained.
- README and package/lock metadata: documented refined behavior; version 0.2.1.

Focused commands and GREEN results:

```powershell
node --test --test-isolation=none --test-name-pattern='refinement:|null quota and credit|complete limits|complete analytics' test/usage.test.js
```

**7 selected, 7 pass**, exit 0.

```powershell
node --test --test-isolation=none --test-name-pattern='refinement:|Analytics tab shows' test/desktop.test.js
```

**8 selected, 8 pass**, exit 0, primary account solely for isolated synthetic
Chrome. Full broader `npm test`: **77 tests, 77 pass, 0 failed/cancelled/skipped**,
exit 0. All shipped JavaScript passes the recorded syntax-check loop.
`npm pack --dry-run --cache ../.npm-cache`: exit 0, version **0.2.1**, same ten
intended files, **17.4 kB** packed. No runtime dependencies or new assets added.

No tests edited, no post-GREEN refactoring, no behavior-change TDD exception,
no host/config edits or publication by this owner. Source frozen for independent
commands, native-host and visual checks plus role-owned reviews. Browser results
do not establish real Electron rendering or live endpoint availability.

## History calendar-date normalization — GREEN (2026-10-27)

Accepted correctness finding and RED in `RED.md`: three public-service tests
failed because all three histories retained missing/non-calendar/impossible dates
and published valid entries out of order. Exact focused command:

```powershell
node --test --test-isolation=none --test-name-pattern='history date normalization:' test/usage.test.js
```

`index.js` now checks each source date against strict YYYY-MM-DD syntax and a UTC
calendar round-trip, omits invalid entries and sorts each normalized series by
its unchanged source date. Existing token validation remains in place; valid
zero counts and null gaps are preserved. No frontend, auth, invocation or test
changes; no compatibility parser or new helper abstraction.

GREEN: focused **3 selected, 3 pass**, exit 0. Broader `npm test`, primary account
for synthetic Chrome — **80 tests, 80 pass, 0 failed/cancelled/skipped**, exit 0.
`node --check index.js` exits 0. `npm pack --dry-run --cache ../.npm-cache` exits
0: version 0.2.1, ten intended files, **17.5 kB** packed. No refactoring or
behavior-change TDD exception. Source frozen for independent verification/review.

## Period focus and heatmap targets — GREEN (2026-10-27)

Accepted RED in `RED.md`: three focused interaction tests, two behavioral
failures (period focus lost, 12px heatmap target) and one already-passing touch
tooltip check. The latter is preserved existing behavior, not new RED.

```powershell
node --test --test-isolation=none --test-name-pattern='interaction accessibility:' test/desktop.test.js
```

`dist/desktop.js` remembers a focused period button only when it is inside the
panel being rebuilt, then focuses its equivalent after rendering. Keyboard
selection and background snapshots retain focus without moving it from report
tabs/outside controls. `dist/desktop.css` gives supplied cells 24x24px interaction
targets with 14px visual colored squares and matching neutral gaps. No new touch
handler, table, dialog or focus abstraction was added.

GREEN: focused **3 selected, 3 pass**, exit 0, primary account solely for isolated
synthetic Chrome. Full `npm test`: **83 tests, 83 pass, 0 failed/cancelled/skipped**,
exit 0. `node --check dist/desktop.js` exits 0. Package dry run
`npm pack --dry-run --cache ../.npm-cache` exits 0: version 0.2.1, ten intended
files, **17.7 kB** packed. No test edits, refactoring, behavior-change TDD exception
or host/config changes. Source frozen for independent/native verification/review.

## Observed Electron touch completion — GREEN (2026-10-27)

Accepted RED in `RED.md`: the independently recorded Electron sequence ends
with touchend after pointerleave, without focus/click, hiding exact-value
feedback. The real-DOM regression deliberately dispatches that recorded order;
it does not claim hardware-event generation. Exact command:

```powershell
node --test --test-isolation=none --test-name-pattern='Electron touch sequence:' test/desktop.test.js
```

The only production change in `dist/desktop.js` attaches the existing tooltip
show callback to touchend. It does not depend on synthetic focus/click and keeps
existing pointerenter/leave, focus/blur, targets and period focus behavior.

GREEN: focused **1 selected, 1 pass**, exit 0. Full `npm test`, primary account
for synthetic Chrome — **84 tests, 84 pass, 0 failed/cancelled/skipped**, exit 0.
`node --check dist/desktop.js` exits 0. Package dry run
`npm pack --dry-run --cache ../.npm-cache` exits 0: version 0.2.1, ten intended
files, **17.7 kB** packed. No test edits, refactoring or behavior-change TDD
exception. Source frozen; fresh installed Electron verification is still required.

## Calendar heatmaps — GREEN (2026-10-28)

Accepted RED is the completed Calendar heatmaps section and scroll-restoration
follow-up in `RED.md`: six real-DOM calendar failures plus one behavioral failure
losing a user-selected scroll position. The confirmed scenario/destination map
was read before edits and the supplied GitHub calendar image was inspected.

```powershell
node --test --test-isolation=none --test-name-pattern='calendar:' test/desktop.test.js
```

`dist/desktop.js` now defaults the common period to Year (365 inclusive local
calendar days) and adds 90 days. Daily/Cumulative show all selected dates,
including unknown dates, in weekday rows and aligned week columns. Fixed
Mon/Wed/Fri labels sit beside the scrolling matrix; month labels share its
column geometry. Weekly uses one row of exact week starts/unknown weeks.
Each calendar shows its dotted date range. A source with no buckets is omitted;
an existing source with no buckets in the selected period still has the full
neutral calendar and no invented chart points.

Per-calendar scroll positions remain mount-local: fresh entry/period changes
open at the latest dates, while background updates and tab returns retain the
reader's position. Existing period keyboard focus, tooltips, touchend, null gaps,
24px targets/14px visual squares, colors and verified-account lifecycle remain.
`dist/desktop.css` provides fixed axes and matrix-only scrolling, fitting the
full year in wide panes. Chart rendering was separated only as necessary to
retain a calendar when the filtered series has no chart points.

README documents the new default, axes, unknown window and scrolling behavior;
package/lock versions are 0.2.2. No backend, auth, compact, test or host/config
edits. No commits or publication. No behavior-change TDD exception.

GREEN: focused **7 selected, 7 pass**, exit 0, primary account solely to launch
synthetic Chrome. Full `npm test`: **91 tests, 91 pass, 0 failed/cancelled/skipped**,
exit 0. `node --check dist/desktop.js` exits 0. Package dry run
`npm pack --dry-run --cache ../.npm-cache` exits 0: version 0.2.2, ten intended
files, **18.7 kB** packed. No post-GREEN refactoring. Source frozen for independent
commands, native-host validation and role-owned reviews.

## Shared-week month labels — GREEN (2026-10-28)

Accepted RED in `RED.md`: three real-Chrome cases lose Sep when Oct begins in
the same first week, including a one-column seven-day view at 320px. Exact focus:

```powershell
node --test --test-isolation=none --test-name-pattern='calendar month boundary:' test/desktop.test.js
```

`dist/desktop.js` groups month names by their week column instead of replacing
the first name. Each remains a separate text element, stacked when sharing a
column. `dist/desktop.css` expands that calendar's month header and matching
weekday offset to 40px when needed; individual labels occupy 20px rows above
the cells. No scroll, focus, data or interaction behavior was changed.

The first focus passed 3/3, but the broader run found one existing semantic-label
regression (93/94): joined text did not expose an individual January label.
Separate stacked spans corrected it without changing tests. The combined focus
then passed all four cases:

```powershell
node --test --test-isolation=none --test-name-pattern='calendar month boundary:|calendar: daily and cumulative month' test/desktop.test.js
```

Final full `npm test`, primary account solely for isolated synthetic Chrome —
**94 tests, 94 pass, 0 failed/cancelled/skipped**, exit 0.
`node --check dist/desktop.js` exits 0. Package dry run
`npm pack --dry-run --cache ../.npm-cache` exits 0: version 0.2.2, ten intended
files, **18.9 kB** packed. Only frontend JS/CSS and this evidence changed. No
refactoring, test edits, commits or behavior-change TDD exception. Source frozen
for independent/native boundary verification and design recheck.
