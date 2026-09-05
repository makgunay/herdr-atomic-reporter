# herdr-atomic-reporter — agent notes

A standalone user extension reporting Atomic session state (idle/working/blocked) to a
Herdr pane. Public repo, pushed to github.com/makgunay/herdr-atomic-reporter.

## Rules

- **Run tests only via `npm test`** (it wraps `bun run scripts/run-tests.ts`). Bare
  `bun test` bypasses the harness env scrubbing and fails 6/6 by design.
- **Never point tests or spawned children at a real Herdr socket.** The suite's preload
  guard refuses a live `HERDR_SOCKET_PATH`; keep it that way. Development often happens
  inside a live Herdr pane — a stray report corrupts the developer's own pane state.
- This directory is **symlinked into `~/.atomic/agent/extensions/herdr-atomic-reporter`**.
  Edits take effect in *new* Atomic sessions (or after `/reload` in an existing one);
  running sessions keep the already-loaded version until then. There is no build step.
- Target the **installed `@bastani/atomic` pinned in package.json** (exact pin). Do not
  import from any Atomic source checkout.
- CI: `.github/workflows/canary.yml` runs the suite daily against the pinned version and
  `@latest`, and opens a drift issue when only the latest leg fails. If you bump the pin,
  you are declaring compatibility — run the full suite first.
- Conventional commits. Keep README "Known limitations" honest — it is the public
  contract of what this extension cannot see (trust prompts, background workflow waits,
  supervisor asks); update it whenever capability changes, in either direction.
- Upstream context: this is an interim community integration. Atomic's maintainers plan an
  official reporter pending herdrdev/herdr#2423; related upstream threads are
  bastani-inc/atomic#2873 (trust-prompt emission question) and the closed
  bastani-inc/atomic#2551 (superseded block-door design, historical context).
