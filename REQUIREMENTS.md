# Codex Usage plugin acceptance contract

Ready for TDD: YES. Standalone installable Pi extension, vanilla pi-gui, no host
changes, rebuild or manual settings. First version is display-only. No remote
writes, account fallback, credential persistence or token estimates.

## Scenario and destination map

| Entry | Destination and result | Cancellation / restoration | Owner |
| --- | --- | --- | --- |
| Initial session | Existing chat; ExtensionDock hidden, no requests | Restore latest visibility entry on the active branch | Plugin session controller |
| `/usage` | Read-only native ExtensionDock widget and status in current chat, immediate refresh and refresh every few minutes | Command persists visible; native collapse stays host-owned | Plugin owns data, timer and request generation; host owns dock controls |
| `/usage hide` | Clear `codex-usage` widget and status | Persist hidden on active branch; cancel timer/request; ignore late results until explicit `/usage` | Plugin session controller |
| Session start / resume / tree navigation | Same chat surface, branch-specific persisted visibility | Restore active branch via `sessionManager.getBranch()`, invalidate old work | Plugin session controller |
| Session shutdown / replacement | Existing host navigation | Stop refresh, abort work, ignore late results | Plugin session controller |
| Native X | Host temporarily hides the current widget | Changed widget text may reappear; durable hiding uses `/usage hide` | Host behavior, documented limitation |

No new screen, route or back stack. Back/Up remains host-owned. There are no
custom buttons. All results go to the current chat's user.

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
Manual follow-up after GREEN: install on unchanged pi-gui, run `/usage`, inspect
native collapse/X, run `/usage hide`, switch/restore branches, and confirm no
credentials appear. Live backend availability remains a separate probe.
