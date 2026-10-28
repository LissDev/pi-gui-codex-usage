# Codex Usage

Codex quotas in a compact native dock, with usage history, message counts and a graphical report in the right
workbench. A standalone extension for vanilla **pi-gui 1.0.1**, whose bundled
Pi SDK is 0.87.1. All frontend assets ship ready to use; no build or manual
settings are required.

## Install

```sh
pi install git:github.com/LissDev/pi-gui-codex-usage
```

Run this with the Pi installation used by pi-gui, then restart pi-gui or reload
its extensions. Sign in to `openai-codex` using Pi's existing OAuth flow.
The extension uses that runtime's current credentials; it never reads another
CLI's account or writes credentials to disk. It has no npm runtime dependencies.
Small vendored host-registration and Chord context modules carry their upstream
MIT notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Use

- `/codex-usage` opens the native **Compact / Detailed / Hide** chooser.
  Cancelling leaves the current state unchanged.
- `/codex-usage compact` shows quota windows in the current chat and refreshes
  immediately, then every three minutes. Repeating it shares an active refresh.
- `/codex-usage detailed` gives the native opening instructions without changing
  compact visibility: **Add tab (+) → Extension views → Codex Usage**, or the
  command palette's **Open Codex Usage**. This host version has no supported
  programmatic open/focus action, so this manual step is required.
- `/codex-usage hide` hides compact widget and status, stops its polling and
  cancels pending work. Visibility is persisted on the active session branch.
- New chats start hidden. Resuming a chat or navigating its session tree restores
  that branch's last saved visibility.

The command is `/codex-usage`; the older `/usage` name is no longer registered.

Compact contains only quota-window durations, a **used** fill bar and percentage,
remaining percentage, local reset dates with a relative countdown, and the last successful update. Failed
updates mark retained data **Stale**. Its collapsed summary is
`Codex usage · X% left`, using the first included window. The host's dock
collapse/expand and X controls remain native. X temporarily dismisses the
current compact widget; changed output may show it again. Use the Hide command
for durable hiding.

Each supplied quota reset date also shows **Resets in** days, hours and minutes,
or **Reset due** at/past that instant. Due does not claim that quota has been
restored: the source's usage and remaining percentages stay unchanged. Missing
reset dates have no countdown placeholder; exact local dates remain visible.
Compact recalculates relative text only during its existing show/data-refresh
renders. It has no extra minute timer, so time passing alone does not rewrite a
host-dismissed dock.

The right report has two keyboard-accessible tabs: **Overview** for graphical
quota meters, supplied account details and Usage limit resets, and **Analytics** for Usage history,
Messages, Token breakdown, Plugins, Skills, Top chats, all-time metrics,
invocation details and daily, cumulative and weekly charts with calendar heatmaps. Close it
with the native workbench control; Hide affects compact only. A mounted report
refreshes on entry and every three minutes. Closing/disposal stops its frontend
polling; an already accepted finite backend request may finish within 25 seconds.
Opening, refreshing or closing details never enables compact. Reopening the
native tab checks the current account before displaying cached metrics, then
resumes frontend polling. A failed initial refresh shows unavailable feedback
without prior-account metrics. Same-session branch navigation preserves the
account report independently of compact's branch visibility; a new session
clears the report before refreshing.

In Overview, quota countdown text updates every minute using the current report
and wall clock. This presentation timer changes only the relative text nodes;
it does not fetch data, change Updated/source freshness, rerender the report or
move keyboard focus. The three-minute HTTP cadence is unchanged. Closing or
aborting the report stops both timers. Countdown text is limited to quota reset
dates; credit status and expiry semantics remain as supplied.

### Usage limit resets

Overview includes a read-only **Usage limit resets** card. Its local **Available**
and **History** tabs inspect the same reset resource without making another
request. Selection survives live updates, source errors and outer-tab changes;
reopening defaults to Available. Both sources refresh with the full report.

Available shows the server's **Available** and **Total earned** counts independently
of the number of returned credit entries. These counts remain separate from the
usage endpoint's existing Earned resets and Applicable earned resets. Supplied
credit details include title, description, reset type/status, plan support and
granted/expiry dates. Explicit false plan support stays false; unknown support is
omitted. Empty lists and explicit zero counts remain distinct from unknown values.

History displays only the **returned history** and its supplied window start,
with safe event kinds and occurrence dates. It does not claim exhaustive lifetime
history or offer pagination. Each reset source retains its own same-account
last-known values, successful-fetch time, stale status and sanitized errors.
History's **Data as of** uses its source timestamp; Available's source freshness
is unknown. Both keep that separate from the local **Updated** time.

The card has no purchase, redeem, reset, toggle or load-more action. Credit/event
IDs, profile/avatar fields, purchase/configuration flags and unproved redemption
timestamps are excluded. Status remains as supplied; expiry dates do not trigger
an inferred status change.

### Usage history

The first chart in Analytics shows daily server-reported usage. Its independent
**7 days / 30 days** controls default to the latest seven inclusive local calendar
days. **Previous / Next** move a whole window; Next stops at today. Changing the
duration resets to the latest window. **Group by** selects feature, model, surface
or turn start using the same source attribution. These selections survive tab
changes and live updates; reopening resets to seven days, latest, By feature.
The compact **7d / 30d** segments and grouping share one toolbar row; the date
range and labelled arrow buttons occupy a separate row. Controls retain 40px
targets in narrow panes. Inline selections and live updates preserve the report's
scroll position and focused reader, as the available content height allows.

Stacked bars use the source's **percent** or **credits** units. Hover, focus or
touch a dated bar for exact daily amounts and group values, including tiny
positive amounts and explicit zero. Missing values stay unknown; mixed days show
a known subtotal, and legend shares identify the known selected usage denominator.
Percent charts use a fixed 0–100% axis with 25% ticks; credits scale to their
supplied amounts. Axis formatting does not round or normalize source values.
Days above 100% are named above the chart with their actual totals. Their bars
stop at 100%; tooltips and Day details retain every exact source amount.
These amounts do not represent token totals or a weekly quota percentage.

The source currently supplies no freshness timestamp, so **Data as of** says
**unknown**. **Updated** separately identifies the local successful fetch time.
Empty data, source errors and retained stale values have separate feedback.
Only the current account and selected range can reuse last-good history; changing
the range requests history alone when the account is unchanged. If Pi resolves a
different account, that refresh also reloads its subscription limits, token
profile and all four dated cards. Compact refreshes continue to request only limits and the
token profile.

### Messages

The Messages line chart follows Usage history. It displays the server's daily
message counts (`turns`) with independent **7 days / 30 days** and **Previous /
Next** controls. It defaults to seven inclusive local calendar days and **By
model**; **By surface** uses the same cached counts. Changing its range requests
only Messages for the same account. Both cards can refresh independently without
changing each other's range or the token calendars.

Use the native **Day details** selector for an exact dated total and grouped
counts. It remains usable in narrow panes. Selected dates, ranges and grouping
survive tab changes and live updates; dates outside the chosen range clear, and
reopening restores the defaults. Usage history has its own Day details selector.

Desktop combines the desktop app and Work desktop; the other supplied surfaces
are CLI, VS Code, Web, Web (Work), Mobile and Code review. Unknown source names
remain readable. The model group **Other** combines auto-review, explicit other
models and any positive remainder between the reported total and known groups.
If groups exceed the reported total, exact counts remain visible with a
discrepancy note; no negative remainder is invented. Missing counts remain
unknown, known subtotals are labelled, and explicit zero stays zero. The chart
does not fabricate a zero for a missing day.

Messages has its own local successful-fetch time, stale/error feedback and
account/range cache. **Data as of** remains unknown when the source supplies no
freshness timestamp. The Messages card shows message counts; its shared response
also supplies the separate Token breakdown below. No credit or user-count fields
enter these cards. Account changes clear all nine report sources and the next
public refresh reloads them, including when compact discovered the new account.

### Token breakdown

Token breakdown follows Messages and shares its selected period and source.
Change **7 days / 30 days** or **Previous / Next** in Messages to update both
cards with one existing request. There are no additional token period controls,
network sources or refresh timers. Messages' model/surface grouping does not
change the token measures; no per-model token data is inferred.

Four independent daily lines show **Uncached input**, **Cached input**, **Output**
and **Reported total**. Selected-window values are known subtotals of supplied
counts. Missing dates or measures mark completeness partial and remain chart
gaps; explicit zero stays zero. Reported total is preserved independently of
component and client sums. Discrepancies are labelled without forcing values to
match or inventing extra tokens. Chart axes use compact K/M labels where needed;
subtotals and exact details keep the full unrounded counts.

Its own native **Day details** selector includes token-known days even when their
message count is unknown. It shows all four daily measures and a horizontally
scrollable client table with the same four supplied measures. Missing cells say
Unknown, never zero. Client identities retain separate rows using readable
surface names. The selected token day survives live updates and tab changes,
clears outside Messages' selected range, and resets on reopening. It is separate
from Messages' selected day and the lifetime token calendars.

Token breakdown reuses Messages' last-success time, source freshness, stale/error
state and account/session checks. Invalid supplied token counts fail that shared
source safely, retaining same-account/range last-known data.

### Plugins and Skills

Two named invocation-count charts follow Token breakdown. Each defaults to the latest
**30 days**, with its own **7 days / 30 days**, **Previous / Next** and native
**Day details** selector. Their ranges and selected days survive tab changes and
live updates independently; reopening restores 30 days. A same-account range
change fetches only that card.

These sources return the **top 10 per day**. The report retains every supplied
name across the selected days, so a range can contain more than ten names. Charts
show the eight names with the highest known counts in the window; identity keys
break ties consistently. **Other reported** combines only returned known counts
for the remaining names. Day details retains every original named count.
Sums are **Reported subtotal**, qualified as partial when dates or counts are
unknown. They do not represent all tool activity; no unreported usage is inferred
for Other reported. Missing days and unknown counts remain gaps; explicit zero
remains inspectable. Line patterns and filled/outlined markers repeat in legends.

Plugin identity combines its source name and marketplace, keeping namespaces
separate. Skill identity uses its source name. Display names are plain text;
source names and marketplace labels keep identities readable. Plugin IDs and
skill IDs are excluded from the report. Each card has its own stale/error state
and local successful-fetch time. **Data as of** uses the source freshness timestamp
when supplied, and says unknown when absent.

### Top chats

Top chats lists server attribution for recent local Pi sessions with actual
`openai-codex` assistant usage. It considers sessions updated in the past 30 days,
queries at most the newest 100 eligible distinct sessions, and shows matched
coverage and the candidate cap. Each Pi session is queried independently with
no descendant aggregation. This is limited local coverage, not an account-wide
chat catalogue. Messages' date range does not filter this card.

Rows rank by known weekly percentage, with unknown percentages last. These are
server quota-window percentages; credits are reported attribution, not lifetime
chat usage or token estimates. Explicit zero stays zero, missing values stay
unknown, and credit decimals retain their exact values, including tiny positives.
Expand a chat inline for supplied five-hour/weekly amounts, credits, model,
reasoning, speed, product, status and source. Titles come only from explicit local
session names, otherwise Untitled with a local date; no message-derived titles.
Five rows appear initially. Show more reveals five cached rows and focuses the
first new chat. Expansion, visibility and table reading position survive live
updates and report-tab changes; reopening starts with five closed rows.

The public Pi SDK lists sessions and parses read-only session files; this feature
never opens, migrates or writes sessions. Discovery failures clear cached chat
rows with safe unavailable feedback. Same-account server failures retain stale
attribution; authentication loss and account changes clear it. Source Data as of
and local Updated remain separate. Compact and same-account card range requests
do not enumerate sessions or query Top chats.

### Token calendars

Analytics starts with **Year** selected. **7 days / 30 days / 90 days / Year / All** controls
apply together to all three histories; limited periods include today and the
preceding 6, 29, 89 or 364 days in the host's local calendar. Year is exactly
365 inclusive calendar days, including leap days when they fall in that window.
All uses each series' earliest and latest supplied dates.
Lifetime statistics and top invocations remain explicitly **all time**.
The period survives tab changes and live updates, and resets to Year when
the report is reopened.

Daily and cumulative heatmaps show the entire selected calendar window in seven
weekday rows and week columns, with fixed weekday labels and aligned month names.
Weekly heatmaps use a single row of week-start cells, without spreading a weekly
total across days. A visible date range identifies the chosen window even when
the server supplies only a few months of history. Unknown dates remain neutral;
calendar padding outside the range is layout only. Hover or focus a supplied cell for
its exact date and token count. Missing days and null counts stay neutral;
explicit zero has its own color. A Less/More legend shows zero plus four green
levels, scaled to the full supplied series so filtering does not change a
bucket's intensity. The same heatmaps adapt to host light/dark themes.

In a narrow pane, only the calendar matrix scrolls horizontally; month names move
with its columns while weekday labels stay fixed. A newly opened report or a
changed period starts at the latest dates on the right. Your reading position
survives live updates and switching tabs. Wide panes show the whole matrix when
it fits.

## What is shown

The report displays fields supplied by the server:

- Plan, included/code-review/additional quota windows, their actual durations,
  used and remaining percentages, reset times and reset countdowns.
- Credits, approximate local/cloud message ranges, model availability, spend
  controls, limit state and earned-reset available/applicable counts.
- Lifetime and peak token counts, streaks, threads, turn duration, fast-mode and
  reasoning-effort statistics, skill counts and available workspace statistics.
- Every returned daily, cumulative daily and weekly dated token bucket, named
  top plugin/skill invocations, and the server's statistics timestamps.

Missing or null field fragments and empty groups are omitted; an explicit zero
remains zero. Booleans use green ✓ and red ✕ with accessible True/False names.
Loading, authentication errors, source errors and stale feedback remain visible. Remaining
quota percentage is `100 − used percentage`. Other metrics come directly from
the server: the extension does not estimate subscription token costs or invent
token totals, reset credits or analytics endpoints.

All nine sources keep separate last-success timestamps in memory. A failed,
timed-out or malformed source update leaves its previous report marked **stale**,
while a successful source can still update. Stale data is retained only after Pi
successfully resolves the same current account using its `ChatGPT-Account-Id`
auth header. The installed SDK 0.87.1 supplies only the resolved OAuth access
token; for that version the extension derives the account ID from the token's
`https://api.openai.com/auth` → `chatgpt_account_id` payload claim, matching the
SDK's own Codex requests. A supplied account header takes precedence. This
decodes a token obtained through trusted Pi OAuth resolution; it does not perform
local signature verification. Access-token rotation within that account preserves the cache.
Authentication errors, auth timeouts and missing account identity suppress
previous metrics and use a short sanitized message. Changing accounts discards
the previous account's cache before new requests start.
Hide, session changes and shutdown abort requests and ignore late completions.
Refreshes have a 25-second deadline, including authentication resolution.

Reset, last-success and server metadata timestamps use the runtime's local
`yyyy.mm.dd HH:mm` format. Bucket dates display as `yyyy.mm.dd`, preserving the
source calendar date across timezones; compact chart ticks use `MM.DD`.

## Network and privacy

The extension makes authenticated GET requests to:

```text
https://chatgpt.com/backend-api/wham/usage
https://chatgpt.com/backend-api/wham/profiles/me
https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown
https://chatgpt.com/backend-api/wham/analytics/daily-workspace-usage-counts
https://chatgpt.com/backend-api/wham/analytics/daily-plugin-usage-metrics
https://chatgpt.com/backend-api/wham/analytics/daily-skill-usage-metrics
https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/history
```

History sends the selected `start_date`, `end_date`, `group_by=day` query and the
`x-openai-codex-usage-categories: 1` request header. Only sanitized dates, usage
amounts and attribution dimensions enter the report; per-model credit metadata
is not added again to the attribution values.

Messages sends its selected `start_date`, `end_date`, `group_by=day` and
`workspace_user=true`. Only sanitized source dates, message counts and the four
proved token measures in daily totals/client rows enter the shared data. Model
rows contain message counts only. These cards do not request private
thread contents or account mutations.

Plugins and Skills send their selected dates, `group_by=day`,
`workspace_user=true` and respectively `top_plugin_limit=10` or
`top_skill_limit=10`. Only source dates, safe names/marketplace labels, invocation
counts and the supplied freshness timestamp enter these cards.

Top chats adds one authenticated POST to
`https://chatgpt.com/backend-api/wham/usage/thread_usage/query_v2` when candidates
exist. Its body contains only session UUIDs, creation timestamps (or null) and
empty descendant lists, up to 100 sessions. Local names, file paths, message
content, model details and local usage never enter requests. Names remain local
display metadata; raw session IDs and paths never enter public report state.
There is no empty-catalog POST, additional provider or chat-content request.

The two reset-detail sources use no query parameters. Full report refreshes read
the eight GET sources and Top chats; compact refreshes continue to read only limits and the token
profile. Switching the reset card's local tabs changes presentation only.

It checks Pi's provider and effective auth origins before sending credentials,
and rejects redirects. These are private ChatGPT endpoints and may change or
be unavailable for an account. A working Codex subscription does not guarantee
every metric is returned.

Only usage fields and safe statistics metadata enter the report. Profile names,
email, avatar URLs and opaque invocation IDs are omitted. OAuth tokens, auth headers,
raw error bodies and usage reports are never logged or persisted by this
extension. Its only session entries are `codex-usage.visibility` with a boolean.
Pi and pi-gui retain ownership of their own credential and UI storage.

## Development

```sh
npm test
node --check index.js
npm pack --dry-run
```

Install development dependencies with `npm ci`. The browser suite uses locally
installed Chrome (or `PLAYWRIGHT_CHANNEL`); synthetic tests require no Pi account
or backend connection. They verify commands, lifecycle, outgoing requests,
widget/status calls, typed safe report state, source caching, cancellation,
calendar filters, heatmap values/colors, local dates, graphical DOM, keyboard
access and polling disposal. They do not establish real Electron
rendering or live backend availability.

The package includes `index.js`, `dist/` (plain browser ES modules and CSS),
`vendor/`, this README, the package manifest and license notices. The frontend is
authored directly as ready-to-load JavaScript and CSS; there is no transpilation
or install-time build. Browser assets use local imports and make no network
requests. The backend uses the host-owned replicated state and finite service
calls; it does not load a private host package at runtime. Test and TDD evidence
stay in Git.

MIT licensed.
