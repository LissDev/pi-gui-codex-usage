Run `npm ci` then `npm test`. Node tests use no process isolation because the
Windows sandbox disallows default test-worker spawning. Browser tests use a
separate headless Chrome instance, synthetic state, and a local HTTP fixture.
Chrome must be installed; `PLAYWRIGHT_CHANNEL` can select another installed
Playwright browser channel. Browser process launch may require the primary
Windows account in this environment. No real host profile or credentials are used.

`workflow.test.js` invokes the registered public usage handler independently of
its spelling to establish display/menu RED before the rename; a separate test
requires `codex-usage` and rejects the old name. `usage.test.js` explicitly targets
`codex-usage compact` and preserves previous safety/metric assertions through
the sanitized public report service, while compact auth-error assertions still
observe the actual widget. No production controller is exported for testing.

`desktop.test.js` discovers the frontend from the actual workbench registration.
Without a declaration it mounts nothing, so missing view/timer assertions fail;
it never imports a guessed missing file or substitutes a production stub. Once
registered, it imports and mounts the actual packaged module in a real browser.
The fixture implements only the proven typed Chord service boundary and lifecycle.
