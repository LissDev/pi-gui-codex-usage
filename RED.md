# RED evidence — native ExtensionDock

## Stage 5: installed SDK headerless OAuth compatibility

Production remained idle. Changed only tests, requirements and this evidence.
Installed SDK 0.87.1's resolved Pi OAuth auth has `auth.apiKey` without headers;
its own Codex request code decodes payload `https://api.openai.com/auth` then
`chatgpt_account_id` to construct the account header. Fixtures use synthetic JWT
strings and signatures with trusted Pi OAuth source; no real credentials.

Exact command:

```powershell
node --test --test-isolation=none --test-name-pattern='headerless OAuth|installed SDK headerless' test/usage.test.js
```

Result: **7 selected tests, 4 pass, 3 fail, 0 cancelled/skipped**, exit **1**.

Actual RED:

- `installed SDK headerless OAuth JWT supplies the account header and usage metrics`
  fails **Headerless Pi OAuth dispatches both usage endpoints**, **0 instead of
  2 requests**. Current code refuses the valid resolved account claim because
  there is no prebuilt header. Later assertions require both official GET URLs,
  matching bearer/account header, redirect rejection, metrics and no token output.
- `headerless OAuth JWT rotation preserves same-account stale limits` and the
  corresponding analytics case fail at **Headerless OAuth initially resolves
  the account**: native output is auth/account unavailable. These are prerequisite
  failures for installed-host auth compatibility; the later same-claim rotation,
  independent source update, original timestamp and stale-cache assertions remain
  acceptance checks, not independently observed rotation RED yet.

Passing regressions, **not RED**: malformed JWT, missing claim, non-string claim
and empty claim all fail closed with safe feedback, no HTTP and no token output.
Existing newer-SDK header fixtures and opaque missing-ID security tests remain
unchanged. Full suite was not rerun in this bounded RED phase.

Compatibility refinement: derive identity from the installed SDK's resolved
OAuth token claim when account headers are absent. This is decoding trusted
runtime provenance, not claiming local signature verification or adding a `sub`
stability requirement. Unknown account identity still fails closed. Never retain
raw tokens as cache identity. No production fix was made or authorized here.

---

## Stage 4: verified account identity and bearer rotation

Production owner idle after 35 tests passed; test owner changed only
`test/usage.test.js`, `REQUIREMENTS.md` and this evidence file.

Exact focused command:

```powershell
node --test --test-isolation=none --test-name-pattern='unverified auth identity|rotated bearer|missing verified account' test/usage.test.js
```

Result: **5 selected tests, 0 pass, 5 fail, 0 cancelled/skipped**, exit **1**.
All failures exercise the existing production extension, with no syntax, import,
fixture or runner errors. Full suite was not rerun during this bounded RED phase.

Observed failures:

- `unverified auth identity throws after account change suppresses prior metrics`
  and `unverified auth identity times out after account change suppresses prior metrics`:
  account A was displayed, credentials changed, then current Pi auth resolution
  threw or exceeded the injected 20ms timeout. No further HTTP dispatch occurred
  (passing assertion), but A's 25% quota / 123456 lifetime-token data remained
  visible under stale status. Both fail **Failed identity verification suppresses
  the previous account data**. The timed-out auth fixture is explicitly settled.
- `rotated bearer for the same verified account preserves stale limits and timestamp`
  and the corresponding `analytics` case: bearer changes while the verified
  ChatGPT-Account-Id stays `test-account`. One data endpoint fails and the other
  successfully updates. Current code discards the same-account source cache,
  failing **OAuth access-token rotation must not invalidate the same account cache**.
  Later assertions require original successful timestamp, stale status and the
  other source's new data. Those later checks are acceptance requirements, not
  separately observed RED failures yet.
- `missing verified account identity suppresses previous metrics and prevents dispatch`:
  Pi OAuth auth contains a synthetic token with neither account header nor a
  resolvable JWT account. Current code dispatches two more requests (**4 total
  instead of 2**), failing **Unknown account cannot dispatch account-scoped requests**.

Requirement correction: replaced the earlier test that required old cached data
after auth-resolution failure. That assumption could expose a prior account after
credentials changed: an exception/timeout cannot verify the current account.
Suppress previous metrics when auth identity is unverified; retain stale data
only when current auth successfully verifies the same stable account and its
data endpoint fails. This strengthens privacy and preserves the stale-data
contract for same-account HTTP failures. Tokens are request credentials, not
stable account identity; never persist them as cache identity.

This deliberately contradicts the historical Stage 2 auth-stale acceptance rule;
the corrected REQUIREMENTS.md and this Stage 4 rule supersede it. No production
fix was made or authorized by the test owner.

---

## Stage 3: clear foreign account data during loading

The implementer paused after the preceding 34-test GREEN run. Changed only
`test/usage.test.js` and this evidence file; production remained unmodified.

Exact command:

```powershell
node --test --test-isolation=none --test-name-pattern='account switch clears visible foreign metrics' test/usage.test.js
```

Result: **1 selected test, 0 pass, 1 fail, 0 cancelled/skipped**, exit **1**.
Test: `account switch clears visible foreign metrics before new account requests complete`.
Failure: **Foreign account metrics disappear while new-account responses are pending**.

The fixture first displays account A's 25% used quota and 123456 lifetime tokens.
Pi then resolves account B's OAuth auth, and both B HTTP requests are observed
pending (4 total requests including A's completed pair). Before resolving B's
responses, the native widget still displays A's values with an updated status.
The test fails at this visible cross-account data assertion, not syntax,
imports, timeouts or fixture setup. This is genuine RED for the loading gap.

Both deferred B responses settle in `finally`, even when the assertion fails;
there is no hanging request. When fixed, subsequent assertions require safe
loading/unavailable feedback before completion and B's 71% quota / 654321 tokens
after completion. Those later assertions are acceptance checks, not independent
RED claims. No state implementation or rendering helper is prescribed.

---

## Stage 2: verified against the real stage-1 extension

Sequential test ownership resumed after `index.js` and the manifest were added;
the implementer remained paused throughout these test changes. The original RED
record below is historical. Current tests load and exercise the actual extension.

Exact full command: `npm test` (same directory as below).
Result: **34 tests, 15 pass, 19 fail, 0 cancelled/skipped**, exit **1**.

Exact focused new-coverage command:

```powershell
node --test --test-isolation=none --test-timeout=3000 --test-reporter=dot --test-name-pattern='complete|independent source|auth failure after|runtime OAuth|pending Pi auth|overlapping poll|HTTP timeout|malformed' test/usage.test.js
```

Result: **16 selected tests, 1 pass, 15 fail**, exit **1**. No module, syntax,
fixture or compilation errors. The 3-second runner bound was not reached.

Observed behavioral failures:

- Original stale refresh loses the previous 25% limits value; independent cache
  cases lose either 25% limits or 123456 lifetime tokens when that source fails,
  despite the other source updating successfully.
- Auth failure after success makes no further HTTP calls (passing assertion),
  but discards last-good limits rather than showing them explicitly stale.
- Hide/shutdown clear the dock and timer (passing prerequisites), but provide no
  aborted request signal. Their pending request is now settled before assertions
  to avoid abandoned fixture promises.
- Old-session completion now deterministically appends a widget into the new
  session: widget write count is **2 instead of 1**. The corrected fixture defers
  only the obsolete limits request and returns analytics immediately, removing
  the accidental unresolved second request without weakening cancellation.
- Complete limits omit code-review windows (first failure), credit message
  arrays, model availability, spend controls and related actual schema fields.
  Complete analytics omits safe stats metadata (first failure) and named top
  invocations. Tests also retain all supplied dates and scalar metric checks.
- Resolving pending auth after hide, new session or shutdown makes **2 HTTP
  requests instead of 0**. These tests reach the actual dispatch race.
- Overlapping polling produces **2 in-flight limits requests instead of 1**.
- A hanging HTTP request is still pending after **500ms** despite the accepted
  **20ms** test timeout override. The fixture is then explicitly settled; this
  is an assertion failure, not test-runner cancellation. Required behavior is
  request abort, refresh settlement and stale-data retention. Production timeout
  remains 15–25 seconds; only optional injected services change its test duration.
- Empty/wrong-type bodies, a string quota percentage, an out-of-range percentage
  and malformed JSON discard last-good limits. An invalid -5% is currently shown
  with 105% remaining; it must be a failed update rather than healthy data.

Passing safety coverage is **not RED**: official origins, redirects disabled,
missing/non-OAuth auth feedback, no persisted/rendered credentials or profile PII,
basic null/zero handling, and a runtime OAuth account switch followed by errors
already pass at this stage. Keep these tests as regressions when adding caches.
Some later assertions within failing cases are still pending; the first concrete
failure for each category above is the actual observed evidence.

Changed only `test/usage.test.js`, `REQUIREMENTS.md` and this evidence file during
this resumed phase. No production changes or test weakening. Optional service
`requestTimeoutMs` was accepted by the coordinator to test timeout behavior
quickly; no timeout implementation or helper API is prescribed.

---

Observed 2026-10-27, Node v26.7.0, before any production implementation.
User confirmed the native ExtensionDock after the installed-host compatibility
check. The prior pin contract is superseded by REQUIREMENTS.md.

## Exact command

Working directory:
`C:/Users/ninet/Documents/Codex/2026-10-27/d-x20/work/pi-gui-codex-usage`

```powershell
npm test
```

Package script: `node --test --test-isolation=none test/*.test.js`.
Exit code **1**; **18 tests, 0 pass, 18 fail**, no skipped/cancelled tests.
Default Node process isolation initially failed with Windows `spawn EPERM`;
in-process isolation resolves this infrastructure issue. That earlier run is
not behavioral RED evidence.

## Failures and their meaning

| Test names / group | Observed intended failure |
| --- | --- |
| Pi package discovers a loadable default extension | Missing `pi.extensions`: installable package entry absent |
| /usage command is registered through the public extension API | `Extension registers /usage`: command not registered |
| new chat stays hidden without polling; /usage renders ExtensionDock and polls | `Extension handles session_start`: lifecycle absent |
| quota card labels actual window durations, remaining usage, reset, plan and credits | Empty widget output fails weekly-duration assertion |
| earned resets show available and applicable counts without mutation actions | Empty widget output fails reset-count assertion |
| server analytics shows token totals, dated buckets and useful stats without profile PII | `Server statistic 123456 appears without inference`: output absent |
| analytics failure remains independent from successful limits | Empty widget output fails retained-limit value assertion |
| null quota and credits are unavailable while explicit zero usage stays zero | `Weekly null usage is unavailable`: display absent |
| requests use Pi OAuth only, official usage URL and disabled redirects | Zero usage requests versus one expected |
| missing Pi auth / non-OAuth Pi auth / unofficial auth origin / unofficial provider origin prevents credential dispatch (4 tests) | Empty output fails required safe auth/unavailable status |
| failed refresh preserves last good values, timestamp and sanitized stale status | No scheduled refresh versus one expected |
| /usage hide persists hidden, clears dock and prevents late response restoring it | No initial usage request versus one expected |
| active branch visibility restores on start/tree; hidden branch does not refresh | Missing session_start handler |
| shutdown cancels timer and invalidates pending results | Missing session_shutdown handler |
| new session ignores an old session response | Missing session_start handler |

These are assertion failures about missing observable extension behavior, not
unhandled module-not-found, compilation, syntax, fixture, or environment failures.
Only the package test requires a declaration initially. Other tests use a
test-only no-op when no production entry is declared, allowing assertions about
command registration, native UI output, lifecycle, and requests to run. No
production stub was created. Once declared, the real default extension is loaded;
load errors remain explicit failures rather than silently using the no-op.

The negative auth tests currently demonstrate absent safe error feedback, not
an existing credential leak. Race/error tests first fail at their missing
prerequisite behavior; their later cancellation, privacy and stale assertions
remain required acceptance checks during GREEN. Do not describe those later
assertions as independently observed failures yet. Re-run the same tests as
registration and refresh behavior arrive, before changing those later behaviors.

## Files and implementation boundary

Test infrastructure only: `package.json`; tests: `test/usage.test.js`;
requirements/scenario map: `REQUIREMENTS.md`; evidence: this file.
Package/test infrastructure is the explicit TDD exception. Production is absent
and has not been edited. No commit, push, publication or host changes.

Implement the installable manifest and a default ESM extension `(pi, services?)`.
Optional services are fetch, interval functions and epoch-millisecond clock.
Use current Pi public SDK context, native `setStatus` and `setWidget` with
`aboveEditor` placement. Clear both with undefined. Persist only visibility custom
entries under `codex-usage.visibility`, restore the active branch and invalidate
old work on hide, session change and shutdown. Use AbortSignal for HTTP cancellation.
Never serialize credentials or raw profile/error bodies. Official read-only GET
limits and profile-stats endpoints must reject redirects and unofficial origins.
Synthetic fixture fields follow the independent live probe's sanitized schema;
they do not reuse account identity. No snapshots or implementation helper exports
are required. Tests permit presentation wording variations.

## Remaining verification

GREEN and regression verification are not performed in RED ownership. Later
verification must exercise the installed unchanged pi-gui 1.0.1 / Pi 0.87.1 UI,
native expand/collapse and temporary X, persistent command hide, branch restore,
and real OAuth refresh. Static fake-context tests do not prove native rendering
or live backend availability. Native X may reappear after widget text changes;
`/usage hide` is the durable hide action.

## Post-GREEN test-infrastructure cleanup

Removed the historical initial-RED `allowAbsent` no-op discovery fallback from
`test/usage.test.js`. The harness now loads the declared extension directly;
missing package declarations fail explicit discovery instead of simulating absent
behavior. Removed its obsolete explanatory comment. Historical RED runs above
remain unchanged records of the test harness at those times.

This is a test-infrastructure exception and behavior-preserving harness refactor;
no production changes or new production RED were required. Exact verification:
`npm test` — **39 tests, 39 pass, 0 fail/cancelled/skipped**, exit **0**.
Stage 4 TDD evidence remains five genuine pre-fix failures in this document,
followed by five focused passes and 39 regression passes in `GREEN.md`; the
post-cleanup full run independently confirms all 39 remain passing. This is a
TDD evidence check only, not a security, design or native-rendering review.
