# Codex Usage

Codex quotas in a compact native dock, with usage history and a graphical report in the right
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
remaining percentage, local reset dates, and the last successful update. Failed
updates mark retained data **Stale**. Its collapsed summary is
`Codex usage · X% left`, using the first included window. The host's dock
collapse/expand and X controls remain native. X temporarily dismisses the
current compact widget; changed output may show it again. Use the Hide command
for durable hiding.

The right report has two keyboard-accessible tabs: **Overview** for graphical
quota meters and supplied account details, and **Analytics** for Usage history, all-time metrics,
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

### Usage history

The first chart in Analytics shows daily server-reported usage. Its independent
**7 days / 30 days** controls default to the latest seven inclusive local calendar
days. **Previous / Next** move a whole window; Next stops at today. Changing the
duration resets to the latest window. **Group by** selects feature, model, surface
or turn start using the same source attribution. These selections survive tab
changes and live updates; reopening resets to seven days, latest, By feature.

Stacked bars use the source's **percent** or **credits** units. Hover, focus or
touch a dated bar for exact daily amounts and group values, including tiny
positive amounts and explicit zero. Missing values stay unknown; mixed days show
a known subtotal, and legend shares identify the known selected usage denominator.
These amounts do not represent token totals or a weekly quota percentage.

The source currently supplies no freshness timestamp, so **Data as of** says
**unknown**. **Updated** separately identifies the local successful fetch time.
Empty data, source errors and retained stale values have separate feedback.
Only the current account and selected range can reuse last-good history; changing
the range requests history alone when the account is unchanged. If Pi resolves a
different account, that refresh also reloads its subscription limits and token
profile. Compact refreshes continue to request only those two sources.

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

Limits and analytics keep separate last-success timestamps in memory. A failed,
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

The extension makes only authenticated GET requests to:

```text
https://chatgpt.com/backend-api/wham/usage
https://chatgpt.com/backend-api/wham/profiles/me
https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown
```

History sends the selected `start_date`, `end_date`, `group_by=day` query and the
`x-openai-codex-usage-categories: 1` request header. Only sanitized dates, usage
amounts and attribution dimensions enter the report; per-model credit metadata
is not added again to the attribution values.

It checks Pi's provider and effective auth origins before sending credentials,
and rejects redirects. These are private ChatGPT endpoints and may change or
be unavailable for an account. A working Codex subscription does not guarantee
every metric is returned.

Only usage fields and safe statistics metadata enter the report. Profile names,
email, avatar URLs and opaque invocation IDs are omitted. Tokens, auth headers,
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
