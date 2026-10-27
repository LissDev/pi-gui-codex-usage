# Codex Usage

Codex subscription limits and server usage analytics in Pi's native extension
dock. A standalone JavaScript extension for vanilla **pi-gui 1.0.1**, whose bundled
Pi SDK is 0.87.1. No frontend changes, rebuild or manual settings are required.

## Install

```sh
pi install git:github.com/LissDev/pi-gui-codex-usage
```

Run this with the Pi installation used by pi-gui, then restart pi-gui or reload
its extensions. Sign in to `openai-codex` using Pi's existing OAuth flow.
The extension uses that runtime's current credentials; it never reads another
CLI's account or writes credentials to disk. It has no bundled SDK or runtime
dependencies.

## Use

- `/usage` shows the native dock in the current chat and refreshes immediately.
  Visible usage refreshes every three minutes. Running `/usage` again also
  refreshes, sharing an existing refresh if one is already in progress.
- `/usage hide` hides both widget and status, stops polling and cancels pending
  work. The command persists visibility on the active session branch.
- New chats start hidden. Resuming a chat or navigating its session tree restores
  that branch's last saved visibility.

Use the host's native collapse/expand control to inspect the full report. The
host's X temporarily dismisses the current widget; a later changed report may
show it again. Use `/usage hide` for durable hiding. There are no custom controls
or reset actions.

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

Tests use a fake public Pi context and synthetic server responses. They verify
commands, lifecycle, outgoing requests, native widget/status calls, safe output,
source caching and cancellation. They do not establish real Electron rendering
or live backend availability. The runtime package contains only `index.js`, this
README, `LICENSE` and the package manifest. Test and TDD evidence stay in Git.

MIT licensed.
