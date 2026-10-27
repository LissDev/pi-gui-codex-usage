# Codex Usage plugin acceptance contract

Ready for TDD: YES. Standalone installable Pi extension, vanilla pi-gui, no host
changes, rebuild or manual settings. First version is display-only. No remote
writes, account fallback, credential persistence or token estimates.

## Scenario and destination map - confirmed rich report

Ready for TDD: YES for the rich report. This map supersedes the dock-only map.
No host route change or new back stack is introduced.

| Entry | Destination / result to user | Close, cancellation and restoration | Owner |
| --- | --- | --- | --- |
| Initial session/branch | Compact initially hidden; restore persisted branch visibility | Cancel obsolete compact work on existing session/tree lifecycle | Backend session controller |
| Bare `/codex-usage` | Native menu Compact / Detailed / Hide | Cancellation changes nothing | Native selector and plugin choice routing |
| `/codex-usage compact` or Compact choice | Native ExtensionDock, quota windows only | Persist visible, immediate refresh then every few minutes | Backend compact controller; host collapse/X |
| `/codex-usage hide` or Hide choice | Clear compact widget and status | Durable branch hiding cancels compact timer/work; native X alone temporary | Backend compact controller |
| `/codex-usage detailed` or Detailed choice | Right workbench destination Codex Usage | Accepted manual entry Add tab > Extension views > Codex Usage or palette Open Codex Usage; compact visibility preserved exactly | Host destination, sanitized backend service |
| Overview / Analytics inner tabs | Two views of the same read-only account report | Local frontend selection justified by shared data and report lifetime, no independent full-screen task | Frontend |
| Workbench Back / native close | Host navigation | Dispose frontend polling/subscription/binding; finite request may finish within25s; never force compact visible | Host frame, frontend lifecycle |
| Remount / restored workbench tab | Same report destination hydrates current backend revision | Restart frontend polling on mount, host restores tab; no details-only perpetual backend timer | Frontend + host restoration |
| Session replacement / shutdown | Existing host navigation | Clear compact timer/state and invalidate old results; host owns session backend facet | Backend generation + host Chord |

Only kebab-case `/codex-usage` is required; no old `/usage` alias. Detailed entry
and report updates preserve compact visibility exactly. Results go only to the
current user's chat; no mutation or inference actions.

Compact shows ONLY actual quota-window duration, proportional USED fill bar,
used%, Left%, local reset date, last successful update and Stale marker. Weekly
primary stays weekly; bar edges0% and100% are exact. No plan, credits, earned-reset
counts or analytics in compact. Collapsed successful status is EXACTLY
`Codex usage · X% left`, without timestamp or extra words. Missing data uses safe
loading/unavailable feedback.

The graphical right report Overview includes all quotas/progress bars, plan,
credits and earned resets; Analytics includes all safe server metrics and complete
history through charts and tables. Frontend assets ship prebuilt and local,
without external network. Backend alone handles credentials. Details frontend
calls finite refresh on mount and periodic ticks; dispose/abort stops its timer.
Only compact visibility can own recurring backend refresh.

A fresh Details mount must not hydrate cached metrics/history before its initial
finite refresh finishes current identity verification. Suppress both initial and
replayed cached snapshots while that refresh is pending. Success can show the
newly verified report; failure shows safe unavailable/auth feedback without the
prior account's values, graphs or rows. Subsequent live updates retain the
existing sanitized service contract.

Same-session tree navigation changes compact visibility per branch without
discarding the account-scoped report consumed by an already mounted Details view.
Preserve that report or immediately replace it through finite refresh; do not
leave it unavailable until the frontend's next polling tick. Hidden compact
stays hidden and no Details-only backend interval is introduced.

Public view token is `pi-gui-codex-usage.details`, providing `state` and finite
`refresh({}, context)`. Sanitized state contract is `{summary, overview, analytics}`.
Finite refresh reports `{verified:boolean}`. Only explicit `verified:true` means
the current generation checked valid Pi OAuth, official origin and a usable
account identity; cancellation, auth failure or absent session context is not
verification. Rejection is also a failed check. Frontend must unlock cached
hydration only for explicit true, never a missing/undefined/empty result, and
revoke a previous rendering gate if a later refresh is unverified. Show safe
feedback and no cached foreign metrics/history. Data-endpoint errors after a
successful same-account check may still return verified true with stale sections;
verification concerns account ownership, not HTTP data-source health.
Overview has `{lines, windows, updatedAt, stale, error}`, windows contain
`{label, usedPercent, leftPercent, resetAt}`. Analytics has
`{lines, daily, cumulative, weekly, updatedAt, stale, error}`; series entries are
`{date,tokens}`. Percentages/timestamps/tokens can be null when unavailable.
Lines retain safe scalar statistics, metadata and named invocation summaries;
dated histories exist in structured series and drive charts/tables without
duplicating every bucket into report lines. Structured windows drive meters.
No extra revision counter is required because host replicated state owns versions.
Register stable view id `codex-usage`, title `Codex Usage`, canonical entry source
and a prebuilt local frontend. No runtime private host-package import or user build
step. Redistributed helper/browser code must carry correct upstream MIT notices,
including the Chord notice when its context code is bundled.

## Data and safety

Use current Pi ChatGPT OAuth for `openai-codex` via public
`ctx.modelRegistry.getProviderAuth()`, which SDK 0.87.1 and 1.4.0 delegates to
`ModelRuntime.getAuth()`. Verify OAuth and official HTTPS origin before dispatch;
request only official GET `/backend-api/wham/usage` and
`/backend-api/wham/profiles/me` on `https://chatgpt.com`; disallow redirects.
Never consult another CLI account. Missing auth and server errors are sanitized.
Keep last successful values and their timestamp on a failed refresh.

Show every supplied quota window by its actual duration, including weekly
primary windows, used/remaining percentages, reset time, plan and credits.
Null/missing values are unavailable, never zero. Explicit zero remains zero.
Show earned-reset details and server token analytics only if verified server
fields/endpoints exist. Do not invent analytics endpoints or infer tokens.

## Test boundary

Tests discover the default extension through `package.json`'s `pi.extensions`.
The extension default function accepts `(pi, services?)`; optional services
contain `fetch`, `setInterval`, `clearInterval`, and `now` (epoch milliseconds).
`requestTimeoutMs` is an optional test override for the bounded production HTTP
timeout (15–25 seconds); it is not a user setting. The timeout must abort the
request, settle refresh and preserve stale data for the failing source.
Production defaults use the standard globals. Tests exercise only registered
commands, supported lifecycle events, outgoing requests, native widget/status
output and persisted visibility entries. A fake public SDK context supplies modelRegistry and sessionManager.
Persist visibility in custom entry type `codex-usage.visibility` with
`{ visible: boolean }`; restore only entries on the active branch.

SDK evidence: installed `@earendil-works/pi-coding-agent` extension types expose
`session_start`, `session_tree`, `session_shutdown`; there is no `session_switch`.
Public ModelRegistry exposes `getProviderAuth`, `getProvider`, `isUsingOAuth`.
Native UI contract: `ctx.ui.setStatus('codex-usage', text)` and
`ctx.ui.setWidget('codex-usage', stringLines, {placement:'aboveEditor'})`.
Clear both with `undefined`. The user confirmed ExtensionDock after discovering
that installed vanilla pi-gui 1.0.1 bundles Pi 0.87.1 without pin support.
Native expand/collapse and temporary X remain host-owned.

Verified live probe (2026-10-27): both official endpoints returned 200 using Pi
OAuth. Synthetic fixtures match its schemas; profile PII is deliberately excluded
from display. Include all supplied stats, reset-credit counts, dated token buckets
and scalar metrics, preserve independent last-good sections and source timestamps.
Caches are scoped to the active Pi OAuth account. A changed account must not see
cached data from its predecessor. Auth resolution can outlive hide, session
replacement or shutdown; obsolete auth completion must never dispatch HTTP or
restore the dock. Concurrent polling ticks must not duplicate in-flight refresh.
Retain stale source data only after current Pi auth successfully verifies the
same stable account identity and that account's data endpoint fails. Resolving
auth unsuccessfully (including exceptions/timeouts) leaves the current identity
unverified: suppress all prior account metrics and show safe auth-unavailable
feedback. This tightens the earlier auth-failure stale rule to prevent exposing
an old account after credentials change. A verified account ID remains stable
across OAuth bearer rotation; neither a rotated token nor its token bytes define
a new account. If no trustworthy account ID can be resolved from Pi OAuth auth,
fail closed without account-scoped HTTP dispatch or old metrics. Never persist
tokens as cache identity. Invalid JSON, bodies and quota percentages are failed
updates, never fresh successes or numeric zero. Validate without rejecting
legitimate null/missing fields.

Installed SDK 0.87.1 may resolve OAuth as `{auth:{apiKey},source:'OAuth'}` with
no headers. In that case derive the nonempty string account ID from the resolved
access token's `payload['https://api.openai.com/auth'].chatgpt_account_id` claim,
matching the installed SDK's own Codex request path, and send it as
`ChatGPT-Account-Id`. This is decoding trusted runtime OAuth provenance, not
local JWT signature verification. Newer SDK account headers remain supported.
Use the same stable account identity across bearer rotation. Malformed tokens,
missing/non-string/empty account claims and opaque tokens without a usable
account ID remain fail-closed; never expose tokens or profile data. No additional
subject-stability requirement is introduced.

## Scope and verification

Package scripts and test harness are a test-infrastructure TDD exception.
Production code must follow verified RED. Run `npm test` in this directory.
Manual follow-up after GREEN: install unchanged pi-gui, exercise the menu,
compact/hide, right report tabs, close/remount via Add tab or palette, and branch
restoration; confirm no credentials appear. Live backend availability remains a separate probe.

## Scenario and destination map — analytics display refinement (confirmed)

Ready for TDD: YES. This supersedes legacy unavailable field placeholders,
report `lines`, ISO date display and history tables above. Included: compact,
Overview and Analytics presentation; excluded: host navigation, account actions,
new endpoints, persisted UI preferences and additional dialogs.

| Entry/scenario | Destination/result | Back, cancellation, restoration | State owner |
| --- | --- | --- | --- |
| Existing command/menu or host workbench catalogue | Existing Codex Usage destination, Overview initially | Existing host close/Back; compact visibility unchanged | Host frame and existing backend controller |
| Overview tab | Supplied quota windows and typed scalar details only | Existing report tabs; no new route | Frontend report selection |
| Analytics tab | All-time statistics/invocations and daily, cumulative, weekly charts plus heatmaps | Overview returns within same destination; filter retained | Frontend mount-local selection and period |
| 7 days / 30 days / All | Common period filters all three dated series only; default 30 | Inclusive host-local calendar days ending today; switching tabs and live updates retains period; close/remount defaults 30 | Frontend period, current local calendar clock |
| Pointer hover / keyboard focus on supplied heatmap bucket | Exact yyyy.mm.dd date and exact count tooltip | Pointer leave/blur dismisses; no independent task or dialog | Cell-local transient interaction state |
| Missing/null field, empty group or history | Omit unavailable field fragments and empty sections; preserve explicit 0/false | Error, loading and stale feedback stays visible | Backend typed sanitizer; frontend conditional rendering |
| Top invocation inline details | Only provided type, pluginName, skillName and usageCount, including 0 | No extra dialog or navigation; omit empty entries/section | Sanitized analytics snapshot and frontend rows |
| Live state / identity verification / disposal | Preserve existing cached-data gate, finite refresh, polling and abort behavior | Existing close/Back releases timers/binding; no secondary back stack | Existing service/backend identity and frontend lifecycle |

Public presentation contract: overview `{metrics, windows, updatedAt, stale,
error}`, analytics `{metrics, invocations, daily, cumulative, weekly, updatedAt,
stale, error}`. Metrics are flat `{label, value: string|number|boolean,
format?: 'datetime'}`; datetime values are epoch milliseconds. Missing scalar
fields are omitted. Invocations contain only provided `type`, `pluginName`,
`skillName`, `usageCount`. No IDs, profile PII, nested arbitrary server data or
compatibility `lines` are required. Histories remain `{date,tokens}`; null token
counts remain gaps. Tests may temporarily supply legacy lines alongside typed
metrics only to exercise the old renderer without fixture/runtime failures in RED.

Booleans render green ✓ / red ✕ with accessible True/False names. Report and
compact timestamps use local yyyy.mm.dd HH:mm, metadata dates follow the same
rule; chart ticks use MM.DD. Source calendar dates are preserved across timezones.
Heatmaps replace all history tables: daily/cumulative cell = supplied day,
weekly cell = supplied week start without apportionment. Missing days/null
buckets are neutral and visually distinct from explicit zero. Each metric has
zero + four green levels based on its full supplied series maximum, stable when
period changes, and a Less/More legend in both themes. Charts are smaller/denser,
fit narrow panes and keep null gaps. Lifetime statistics and invocations remain
all-time and are clearly scoped even while histories are filtered.

Manual follow-up after GREEN: open existing report in narrow and wide host
panes, switch both tabs and all periods, focus/hover cells, change host theme,
receive a live update, close/remount and verify default 30; inspect loading,
stale, error, zero/false, empty groups and sanitized invocation details.
