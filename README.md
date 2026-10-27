# Codex Usage

Codex quotas in a compact native dock, with a graphical report in the right
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
quota meters and full account details, and **Analytics** for metrics plus daily,
cumulative and weekly charts and tables covering every returned date. Close it
with the native workbench control; Hide affects compact only. A mounted report
refreshes on entry and every three minutes. Closing/disposal stops its frontend
polling; an already accepted finite backend request may finish within 25 seconds.
Opening, refreshing or closing details never enables compact. Reopening the
native tab checks the current account before displaying cached metrics, then
resumes frontend polling. A failed initial refresh shows unavailable feedback
without prior-account metrics. Same-session branch navigation preserves the
account report independently of compact's branch visibility; a new session
clears the report before refreshing.

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

Missing or null values say `unavailable`; an explicit zero remains zero. Remaining
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

Reset and last-success times use the runtime's local timezone. Server bucket
dates and `stats_as_of`/`generated_at` strings are preserved as supplied; no
timezone is inferred for a date-only bucket.

## Network and privacy

The extension makes only authenticated GET requests to:

```text
https://chatgpt.com/backend-api/wham/usage
https://chatgpt.com/backend-api/wham/profiles/me
```

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
widget/status calls, safe report state, source caching, cancellation, graphical
DOM, keyboard access and polling disposal. They do not establish real Electron
rendering or live backend availability.

The package includes `index.js`, `dist/` (plain browser ES modules and CSS),
`vendor/`, this README, the package manifest and license notices. The frontend is
authored directly as ready-to-load JavaScript and CSS; there is no transpilation
or install-time build. Browser assets use local imports and make no network
requests. The backend uses the host-owned replicated state and finite service
calls; it does not load a private host package at runtime. Test and TDD evidence
stay in Git.

MIT licensed.
