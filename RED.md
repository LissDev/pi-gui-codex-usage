# RED evidence — native ExtensionDock

## Stage 9: open report follows host theme changes

Production frozen at 65-test GREEN. Changed only `test/browser-fixture.js`,
`test/desktop.test.js` and this evidence. No production assets changed.

Exact focused command, run under the primary account for isolated synthetic
headless Chrome:

```powershell
node --test --test-isolation=none --test-name-pattern='open details follows host theme changes' test/desktop.test.js
```

**1 selected test, 0 pass, 1 fail, 0 cancelled/skipped, exit 1**.
`open details follows host theme changes without remounting` passes the initial
dark-theme computed-color assertion. The fixture then applies the host frame's
actual theme contract: update the shared `host.theme` object and the document
root's `--background`, `--foreground`, `--accent` and `color-scheme`. The root
update assertion passes. The already-open report remains dark:

- background `rgb(29, 29, 28)` instead of `rgb(250, 249, 245)`;
- foreground `rgb(211, 211, 207)` instead of `rgb(35, 35, 35)`;
- selected-tab accent `rgb(122, 162, 247)` instead of `rgb(49, 91, 168)`;
- color scheme `dark` instead of `light`.

This is real computed rendering from the registered packaged frontend, not a
source-text assertion or a fixture/import failure. The host contract is visible
in `D:/Workspace/3dparty/pi-gui/apps/desktop/electron/extensions/extension-frame-document.ts`
(`applyTheme`, also called for `pi-gui:theme-changed`); the design review confirmed
the installed pi-gui 1.0.1 frame uses the same root-variable contract. An earlier
sandboxed attempt failed to launch Chrome with `spawn EPERM` and is excluded
from behavioral evidence.

The test requires an open report to update all three colors and color scheme
without remount, refresh, or loss of the selected Analytics tab. The post-color
identity/tab/call-count assertions are acceptance checks after the first observed
failure. The fixture now initializes root variables before mount, matching the
host frame. No fallback compatibility API, observer, helper export, or particular
production implementation is prescribed. GREEN and broader verification remain
with the next owner.

---

## Stage 8: explicit identity result across cancellation

Production frozen at 59-test GREEN. Changed only browser fixture/tests, backend
workflow tests, requirements and this evidence. No production assets changed.

Exact focused command (primary account for isolated synthetic Chrome):

```powershell
node --test --test-isolation=none --test-name-pattern='identity gate rejects|previously verified details|details refresh cancelled|same-account source failure' test/desktop.test.js test/workflow.test.js
```

**6 selected tests, 0 pass, 6 fail, 0 cancelled/skipped, exit1**. No import,
environment, fixture or runner failure. Actual observed RED:

- `details refresh cancelled by compact hide reports that identity was not verified`:
  populate account A through the public finite service while compact remains
  hidden, defer the next auth check for B, then issue compact hide. Cancelled
  service refresh resolves an empty result, failing **Cancelled auth work must
  not report successful identity verification**. A rejection or explicit false
  is required; the deferred auth fixture is always settled and cannot dispatch.
- `details identity gate rejects false refresh result without exposing cached metrics`
  plus `empty` and `undefined` cases: initial pending refresh correctly hides A
  (passing precondition), but resolving without explicit verified true renders
  A's **Used25% / Left75%**. Each fails **Only an explicit verified result can
  unlock cached account metrics** in the actual frontend DOM.
- `previously verified details clears metrics when a later refresh is cancelled unverified`:
  a view initially verified by explicit true receives false on its next finite
  refresh. A's25%/75% remain visible, failing **Cancelled identity refresh revokes
  the previous rendering gate**.
- `same-account source failure preserves stale data but reports verified identity`:
  successful auth with a failing limits endpoint correctly retains25% stale
  limits and updates analytics654321 (passing assertions). Its service result
  lacks the new explicit verified flag (**undefined instead oftrue**). This is
  RED for the new result contract, not a data-retention defect. Endpoint failure
  after a valid same-account check must not be treated as auth failure.

Browser success fixtures now explicitly return `{verified:true}`; deferred
completion can independently return false/empty/undefined without modifying the
cached snapshot. This tightens the agreed service protocol and does not relax
any existing assertions. All deferred operations settle before assertions,
with no hanging fixture. Later graph/table absence and safe error-feedback
assertions remain acceptance checks after each first observed metrics failure.

REQUIREMENTS.md defines finite refresh `{verified:boolean}` and frontend explicit
true gating. Cancellation/auth failure/no context must not imply verification;
successfully verified same-account data-source failures may show stale data.
Existing59 tests remain; full suite was not rerun during this bounded RED phase.
No fix was made or authorized by the test owner.

---

## Stage 7: fresh-mount identity gate and account report lifetime

Production frozen at 56-test GREEN. Changed only `test/browser-fixture.js`,
`test/desktop.test.js`, `test/workflow.test.js`, requirements and this evidence.
Existing safety tests and production assets were not changed.

Exact focused command (primary account for isolated headless Chrome):

```powershell
node --test --test-isolation=none --test-name-pattern='fresh details mount|same-session tree' test/desktop.test.js test/workflow.test.js
```

**3 selected tests, 0 pass, 3 fail, 0 cancelled/skipped, exit1**. Actual expected
behavioral assertions reached, with no import, environment, fixture or runner
errors:

- `fresh details mount suppresses cached account data until identity refresh success`
  and the corresponding `rejection` case both fail **Fresh mount must not expose
  cached account A before current identity is verified**. The real frontend
  immediately displays **Used25% / Left75%** from cached account A while the
  initial finite refresh remains deferred for account B's auth check. The fixture
  also replays A's service state through the subscription to exercise hydration
  and live delivery. Deferred refresh is always completed/rejected in `finally`,
  with no hanging promise. Later assertions require no old analytics charts/rows,
  B's71%/654321 after success, or safe unavailable feedback without A after
  rejection. These later assertions are acceptance checks, not independent RED
  failures yet. The fake service represents only the public async boundary;
  rendering uses the actual registered frontend in Chrome.
- `same-session tree navigation retains the mounted report while compact is hidden`
  establishes a report subscription, finite refresh and successful25% data, then
  navigates the same session to a hidden branch. Public report windows become
  empty: **undefined instead of25**. This confirms the account-scoped report is
  cleared despite the consuming Details view and no immediate replacement.
  Later checks retain analytics and forbid compact visibility/backend intervals.
  No private view-mount callback or controller state is inspected.

Requirement: gate cached report hydration on a fresh mount's initial identity
check; errors must not display previous account data. Preserve/revalidate the
account report across same-session tree navigation independently of branch-owned
compact visibility. No implementation helper or state layout beyond the existing
public service contract is prescribed. No production fix was made or authorized.
Full suite was not rerun during this bounded RED phase.

Stage 7 test-infrastructure follow-up: two historical analytics tests now compare
the public `analytics.daily`, `cumulative`, and `weekly` arrays directly instead
of requiring duplicate bucket serialization in scalar report lines. Exact dates,
tokens, order and complete fixture series are retained through literal deep-equal
assertions; scalar/metadata/PII and missing/null/malformed coverage is unchanged.
No formatter or production helper was added. REQUIREMENTS.md clarifies scalar
lines versus structured histories. This is a behavior-preserving test refinement
for the accepted later post-GREEN duplication cleanup, not new production RED.

```powershell
node --test --test-isolation=none --test-name-pattern='server analytics shows|complete analytics retains' test/usage.test.js
```

**2 selected tests, 2 pass, exit0** against the still-unmodified production.

---

## Stage 6: command menu, quota-only compact and graphical right report

Ready for TDD: YES. Confirmed user handoff and proven vanilla-host prototype
`../details-prototype/HANDOFF.md` were read before tests. REQUIREMENTS.md now
records the complete entry/destination/close/restoration/state-owner map and
the coordinator-approved sanitized public snapshot contract. Production files
were not edited. Baseline was the committed 46-test GREEN implementation.

Exact workflow command:

```powershell
node --test --test-isolation=none test/workflow.test.js
```

**7 tests, 0 pass, 7 fail, exit1**. Genuine observed RED:

1. `command namespace is kebab-case codex-usage`: new name absent.
2. `bare command offers native Compact Detailed Hide choices; cancellation changes nothing`:
   no native selection call, **0 instead of1**.
3. `compact displays only quotas with used bars and exact collapsed summary`:
   current widget still contains plan/credits/analytics, violating compact scope.
4. `compact text bars handle zero and fully used windows`: no proportional text bar.
5. `detailed entry leaves hidden compact hidden and gives native opening instructions`:
   starts **1 recurring backend timer instead of0**.
6. `detailed entry preserves shown compact state without a new visibility write`:
   appends **2 visibility entries instead of1**.
7. `right workbench report is registered with sanitized finite-refresh service and packaged assets`:
   native workbench declaration absent.

Display/menu tests invoke the existing registered public handler independently
of spelling to reach real behavior before rename. The namespace assertion is
separate; no no-op controller or production stub was introduced.

Exact browser command:

```powershell
node --test --test-isolation=none test/desktop.test.js
```

Run under the primary Windows account for a separate headless Chrome process.
**3 tests, 0 pass, 3 fail, exit1**, all actual DOM/lifetime assertions:

- `graphical Overview renders real progress and preserves report semantics on state updates`:
  Overview tab **0 instead of1**.
- `Analytics tab shows all dated series as actual charts and tables using keyboard access`:
  Analytics tab **0 instead of1**.
- `details mount polls finitely; dispose and abort stop timers and release the binding`:
  frontend polling interval **0 instead of1**.

Browser launched successfully with no environment, import or fixture failures.
Without a registration the fixture mounts nothing; it never imports a guessed
missing module. After registration it mounts the actual declared frontend in the
browser. Later meter/chart/table, keyboard, subscription, remount, interval and
dispose assertions are acceptance checks pending the missing destination, not
independently observed defects yet. No extra history-period navigation is required.

Exact full command: `npm test` (includes browser suite, primary account).
**56 tests, 1 pass, 55 fail, 0 cancelled/skipped, exit1**. No unhandled-rejection
warnings in the final run. Most prior 46 safety checks now encounter the missing
`/codex-usage` prerequisite; those failures do NOT establish new safety defects.
They were mechanically migrated to explicit `compact` invocation. Full safe
metrics now read the view's public sanitized report state; compact-specific/auth
feedback checks remain widget-facing. Keep all prior safety requirements.

Added test-only Playwright devDependency/lockfile and node_modules ignore rule;
test infrastructure exception, zero runtime dependencies added. Browser channels
are configurable for dev verification and no machine-specific D: path is embedded.
Updated only requirements/evidence, test sources/harness, and test infrastructure.
No index, frontend, vendor or other production assets changed; no push/spawn.

Implementer boundary: register the proven host workbench view/service, prebuilt
frontend mount(root,host), native bare menu and direct compact/detailed/hide;
preserve compact visibility independently, publish only sanitized account-scoped
report state, retain existing cancellation/auth/data guarantees. Compact has only
quota bars/percentages/reset/update/stale, exact successful collapsed summary.
Overview/Analytics render graphical meters and all supplied histories as charts
and tables; frontend owns details polling/disposal, backend refresh is finite.
Correct MIT notices must accompany redistributed helper/Chord browser code.

---

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

## Analytics display refinement — RED (2026-10-27)

Scenario/destination map and typed public presentation contract were recorded in
REQUIREMENTS.md before choosing the first regression. Ownership covered only
REQUIREMENTS.md, this record, and test files; no production code changed.

Specified behavior: omit missing field fragments/empty groups but retain real
zero, false and error/loading/stale feedback; use accessible boolean icons;
calendar 7/30/all filtering shared by all three histories with local today,
absolute cumulative/weekly values and mount-local restoration; replace tables
with keyboard/pointer heatmaps, stable full-series intensity and null gaps;
compact/local dotted minute timestamps and MM.DD chart ticks; sanitized inline
invocation details with nullable names and zero counts.

Changed tests:
- test/usage.test.js: revised `null quota and credit fragments are omitted while
  explicit zero usage stays zero`, existing complete limits/analytics assertions;
  added `refinement:` tests for typed scalar metrics, sanitized invocation rows,
  compact omitted fragments/local timestamps, and existing missing-history/null
  semantics (the last test passes and is not claimed as RED).
- test/desktop.test.js: revised Analytics chart/table assertion to require
  keyboard-accessible heatmaps; seven `refinement:` tests cover mixed fields and
  boolean icons, empty groups/errors, calendar boundaries, period lifecycle,
  heatmap intensity/tooltips, local dates/dense ticks and invocation detail rows.
- test/helpers.js: report observation can read typed metrics/windows/invocations
  while observing legacy lines before GREEN. This is test infrastructure only.
- test/workflow.test.js: preserve branch/auth assertions via the same public
  report observer rather than reading superseded legacy lines directly.

Exact backend command (exit 1):
`node --test --test-isolation=none --test-name-pattern="refinement:|null quota and credit|complete limits|complete analytics" test/usage.test.js`

Result: 7 tests, 1 pass, 6 expected behavioral failures. Actual failures:
null quota and complete limits still emit unavailable fragments; null workspace
rank is still printed; public Overview lacks typed metrics; structured
invocations are undefined; compact prints `Used unavailable · Left unavailable ·
Reset unavailable` and old timestamp `27.10.2026, 20:00:00`.

Exact Chrome command (exit 1; elevated solely for Chrome process launch):
`node --test --test-isolation=none --test-name-pattern="refinement:|Analytics tab shows" test/desktop.test.js`

Result: 8 tests, 0 pass, 8 expected behavioral failures. Actual failures:
3 tables instead of heatmaps; unavailable mixed-field/reset fragments; 2 empty
Overview headings; absent 30-day and 7-day controls; remaining ISO dates;
nullable invocation placeholders. All pages mounted the actual registered
packaged frontend without runtime/fixture errors. Fixed browser clock is
2026-10-27 00:30 Europe/Moscow (2026-10-26 in Los Angeles), independent of real
today. Server data remains synthetic and no real account is contacted.

Valid RED: extension/service and real frontend loaded successfully; assertions
failed on visible legacy behavior or missing public typed values, not compilation,
syntax, fixtures or auth setup. Browser fixtures temporarily contain both typed
metrics and legacy lines so the old renderer can demonstrate visible defects.
Production must migrate atomically; no legacy service compatibility is required.
Implementation constraints: retain identity gates and lifecycle assertions,
preserve null token points, all-time stats/invocations and absolute cumulative
values; local date-only source buckets must not shift timezone. Period controls
have accessible button names `7 days`, `30 days`, `All`; focusable cells expose
an accessible name beginning yyyy.mm.dd and exact-value role=tooltip content.
Full-history colors are compared before/after filtering out the old maximum.
No GREEN or implementation was performed by the RED owner.

## History calendar-date normalization follow-up — RED (2026-10-27)

Accepted correctness finding: missing/invalid source dates or descending bucket
order can make the All heatmap bounds invalid and hide otherwise valid history.
Public service must omit entries without real calendar dates and publish each
of daily/cumulative/weekly chronologically; preserve source dates and exact
counts, including zero and null gaps. Invalid entries must not discard the
remaining valid source history.

Changed only test/usage.test.js and this RED record for this follow-up. Added
three parameterized tests named `history date normalization: <daily|cumulative|
weekly> omits invalid calendar dates and sorts valid buckets without changing
zero or null`. Each public-extension fixture starts with missing date,
`not-a-date`, impossible `2026-02-30`, then valid unsorted 27th/25th/26th buckets.
Expected public snapshot contains only sorted 25th (0), 26th (null), 27th (456).

Exact command:
`node --test --test-isolation=none --test-name-pattern="history date normalization:" test/usage.test.js`

Exit 1: **3 tests, 0 pass, 3 fail**, no cancellation or skip. All three fail the
same meaningful `deepStrictEqual`: actual series includes synthetic
`date: 'unavailable'`, `not-a-date`, `2026-02-30` and leaves valid 27th before
25th/26th. The source error assertion passes, proving the extension successfully
loads and processes the fixture. Failure is date validity/order, not compilation,
syntax, harness setup or missing service. No production edits before this run.

Implementation constraint: normalize all three series at the existing sanitized
public service boundary, before frontend bounds/filtering. Preserve valid
calendar strings unchanged; do not convert missing dates into fake dates or
reinterpret zero/null counts. No browser fixture bypass is needed to reproduce
the defect. RED ownership stops here; GREEN remains unperformed by this owner.

## Period focus and heatmap targets follow-up — RED (2026-10-27)

Accepted UI findings: keyboard activation rebuilds period controls and loses
focus; each exact-value heatmap button is only 12x12px. Observable requirements:
activating 7 days/30 days/All retains focus on the equivalent selected control;
background snapshots preserve that focus and never steal focus from report tabs;
supplied bucket targets are at least 24x24px while their visible GitHub-style
square may remain compact. Keyboard and touch expose exact date/count inline.

Changed only test/desktop.test.js and this record for this follow-up. Three
`interaction accessibility:` tests cover period focus/background snapshots,
computed target geometry for Daily/Cumulative/Weekly, and keyboard plus actual
Chrome touch tap exact-value feedback. The existing page helper accepts optional
browser context options to enable hasTouch; it still mounts the real registered
frontend with synthetic report state and fixed clock.

Exact command (Chrome launch elevated):
`node --test --test-isolation=none --test-name-pattern="interaction accessibility:" test/desktop.test.js`

Exit 1: **3 tests, 1 pass, 2 fail**, no cancellation or skip. Behavioral RED:
`7 days retains keyboard focus after activation` fails false versus true;
`Daily exact-value target is 12x12px; requires at least 24x24px` fails computed
geometry. Frontend mounted successfully; no fixture/runtime errors occurred.
No UI production edits preceded this run.

The third test PASSES before production changes: keyboard focus and a completed
`cell.tap()` in a hasTouch Chrome context both leave a visible tooltip containing
`2026.10.26` and exact `2000` count. Native focus already supplies touch access.
This is existing-behavior evidence, not RED; do not manufacture a touch failure
or require an unnecessary click handler based solely on the earlier static
absence of onclick. Preserve this observable access while fixing the two proven
issues. No dialog/table or enlarged visual square is required by these tests.
RED ownership stops here; no production change was made by this owner.

## Observed Electron touch sequence follow-up — RED (2026-10-27)

Native evidence in work/native-analytics-final/result.json (with failure.png)
records a real installed Electron report receiving touch emulation events on a
fresh heatmap cell after period focus: pointerenter(pointerType=touch),
pointerdown, touchstart, pointerup, pointerleave, touchend, with no cell focus or
click. It reports activeCell=false and tooltipHidden=true. This supplies actual
host evidence missing from the earlier static concern. The earlier Chrome
hasTouch `cell.tap()` pass remains valid for Chrome's different focus behavior;
it does not cover this observed Electron event sequence.

Added ONE real-rendered-view event regression in test/desktop.test.js:
`Electron touch sequence: exact bucket feedback survives touch completion
without synthesized cell focus`. It dispatches that observed pointer/touch
sequence on the registered frontend's actual Daily cell with synthetic date/count
2026.10.26 / 2000. The harness does not synthesize cell focus or click. Expected
visible inline exact-value feedback survives touch completion.

Exact command (elevated for Chrome launch):
`node --test --test-isolation=none --test-name-pattern="Electron touch sequence:" test/desktop.test.js`

Exit 1: **1 test, 0 pass, 1 fail**, no cancellation or skip. Failure is
`Observed Electron touch completion must leave exact-value feedback visible
without a synthesized focus/click`: actual tooltip visibility false, expected
true. The registered frontend and actual target cell load successfully; no
fixture/runtime failure. No production code was edited for this RED.

Scope/limits: DOM-dispatched events are untrusted and do not reproduce native
hardware event generation or browser default focus actions. They deliberately
exercise the view's actual handlers with the independently recorded host event
order, avoiding Chrome's extra synthesized focus. Later GREEN needs both this
view regression and fresh installed Electron touch verification. Preserve the
existing keyboard/pointer tooltip behavior; no extra dialog or table is required.
RED ownership stops here.

## Calendar heatmaps — RED (2026-10-28)

The confirmed calendar scenario/destination/state map was appended to
REQUIREMENTS.md before tests were edited. No production code changed in this
RED phase. Reference inspected: clipboard image ending 30d1b.png (month axis,
weekday axis, seven-row daily calendar).

Changed test/desktop.test.js: six `calendar:` tests specify default Year/full365
unknown-date coverage and visible dotted range; inclusive local-year/leap dates;
Daily/Cumulative actual month/weekday column geometry across December/January;
Weekly single-row exact week starts/month labels; narrow initial right scroll,
fixed weekday/moving month geometry and wide fit; 90-day common chart/calendar
filter with keyboard focus, update/tab retention and remount Year. Existing
30-day filtering test now explicitly selects 30 days; existing remount assertion
expects Year; existing keyboard-focus loop also covers 90 days/Year. All prior
auth, lifecycle, pointer/touch, date and explicit-zero assertions remain.

Exact focused command (elevated Chrome launch):
`node --test --test-isolation=none --test-name-pattern="calendar:" test/desktop.test.js`

Exit 1: **6 tests, 0 pass, 6 fail**, no skips/cancellations. Relevant failures:

- default Year: control count 0, expected 1;
- inclusive leap Year: 2 accessible dated cells, expected 365;
- axes: Daily Mon row-label count 0, expected 1;
- Weekly: 7 cell-center rows, expected 1;
- narrow pane: initial latest/right scroll assertion false;
- 90 days: control count 0, expected 1.

Each test reached the loaded registered frontend and failed on an intended
observable assertion. The first sandbox attempt failed Chrome spawn EPERM and
is NOT RED evidence; the elevated rerun above supplied actual behavioral RED.

Constraints: Year is exactly365 inclusive host-local days ending today (leap
fixture ends2024.03.01, starts2023.03.03); expose each in-window unknown calendar
date as no-value/unknown, never inferred0; layout padding is not dated history.
Keep existing Sunday-first calendar alignment; Mon/Wed/Fri labels align with
actual rows. Month labels begin over the week containing each month start.
Retain original >=24px targets/14px squares, exact supplied counts, unrebased
cumulative values, null chart gaps, all auth/lifecycle/touch guarantees. Tests
use existing heatmap/grid/scroll CSS hooks and semantic dates/axis text; no
internal renderer export or new backend fixture is required. Full regression
and host visual verification belong after GREEN. RED owner stops here.

### Calendar reading-position restoration — RED follow-up

Added one bounded test in test/desktop.test.js:
`calendar: user horizontal reading position survives live updates and tab return`.
It uses a real narrow Chrome DOM with All history extending to2026.01.01,
chooses scrollLeft120, publishes an existing-shape snapshot, and expects120;
it also requires the same position after Overview/Analytics return. The scenario
map clarifies per-calendar frontend mount-local ownership, fresh latest/right on
mount/period change and reset on remount.

Exact command (elevated Chrome):
`node --test --test-isolation=none --test-name-pattern="calendar: user horizontal" test/desktop.test.js`

Exit1: **1 test, 0 pass, 1 fail**, no skip/cancellation. Actual scrollLeft0 versus
expected120 after snapshot (`A background snapshot preserves the user-selected
horizontal position`). The frontend loaded and the fixture's nonzero scroll
precondition passed, so this is behavioral RED rather than setup failure. Tab
return assertion is present but lies after this expected failure. No production
edits or commits; RED ownership stops here again.

### Shared-week month labels — RED (accepted native design finding)

Added one parameterized real-Chrome regression (three cases) to
`test/desktop.test.js`, named `calendar month boundary: <period> keeps both
months readable when they share the first week`. Cases are7days ending2026.10.03
(one calendar column, starts2026.09.27),30days ending2026.10.28
(starts2026.09.29), andYear ending2027.09.29 (starts2026.09.30).
Daily/Cumulative must retain readable Sep andOct over the first week at320px.
DOM text-range geometry checks individual month names regardless of combined,
separate or stacked markup, no clipped first-week labels, no overlap with cells
or neighboring month text. Existing month-column alignment checks remain.

Exact command (elevated Chrome):
`node --test --test-isolation=none --test-name-pattern="calendar month boundary:" test/desktop.test.js`

Exit1: **3 tests,0pass,3fail**, no skipped/cancelled tests. Each reaches the loaded
report and fails `Daily <period>: Sep is readable above the first week, not
overwritten by the other month`: actual undefined, expected true. The first Sep
label is missing where Oct starts in the same calendar week. This reproduces the
accepted native finding rather than a fixture, compilation or environment error.

Constraints: preserve both visible readable month names when their axis column
coincides, including one-column7days; combined/wrapped/stacked text is allowed.
Keep labels above cells, unclipped at320px, and without neighboring-label
overlap. No production edits or commits by this RED owner; stop before GREEN.
