# Herdr reporter for Atomic

A standalone user extension for installed `@bastani/atomic` 0.9.17. It reports an Atomic TUI root session to Herdr as idle, working, or blocked and publishes the Atomic session reference when one exists.

## Status

This is an interim community extension, not the official integration. Atomic's maintainers plan a built-in reporter once the Herdr-side contract is settled (see the discussion in herdrdev/herdr#2423 about recognizing an `herdr:atomic` source pair, process detection, and session restoration). Until that lands, this extension provides working presentation-level reporting today; when an official reporter ships, prefer it and uninstall this one.

## Requirements

- Atomic 0.9.17
- Node.js and pnpm (to install the exact runtime dependency)
- A Herdr-managed pane exporting `HERDR_ENV=1`, `HERDR_SOCKET_PATH`, and `HERDR_PANE_ID`

Install the pinned dependency from this repository:

```sh
pnpm install
```

The extension imports `ExtensionAPI` and `sessionScopedExtensionState` only from the installed `@bastani/atomic` package root. Keeping the dependency local to this repository makes the import resolvable when Atomic evaluates the symlinked entry file.

## Install

Atomic discovers a directory extension at `~/.atomic/agent/extensions/<name>/index.ts`:

```sh
mkdir -p ~/.atomic/agent/extensions
ln -s /absolute/path/to/herdr-atomic-reporter \
  ~/.atomic/agent/extensions/herdr-atomic-reporter
```

Start a new Atomic session or run `/reload` in an existing one. Production activation is deliberately limited to `ctx.mode === "tui"`, so RPC, JSON, and print sessions do not contend for the pane's single lifecycle writer.

## Reported states

- `blocked` while an extension-owned `ctx.ui` prompt is active
- `working` from `agent_start` until qualifying `agent_settled`
- `idle` otherwise

Precedence is `blocked > working > idle`. Atomic 0.9.17 already coalesces overlapping UI prompts into one outer span; the reducer also tracks spans defensively and cannot decrement below zero. An active prompt's title is preserved verbatim. If the title is absent, the message is `Waiting for input`.

Identical state/message pairs are suppressed. Report sequence numbers start from `Date.now() * 1000`, increase strictly, and survive `/reload` through `sessionScopedExtensionState`. Outbound requests share one serialized writer for this extension's identity and use one 500 ms attempt followed by one 1500 ms retry. This discipline cannot prevent a separate extension from writing to the same pane.

## Environment flags

| Variable | Meaning |
|---|---|
| `HERDR_ENV=1` | Enables reporting when the socket path and pane id are also present. |
| `HERDR_SOCKET_PATH` | Herdr Unix-socket path (or Windows pipe name). |
| `HERDR_PANE_ID` | Target pane id. |
| `HERDR_ATOMIC_REPORT_AS_PI=1` | **Local-only Tier B masquerade:** report as `herdr:pi` / `pi` instead of the default `herdr:atomic` / `atomic`. Default is off. Do not enable while Herdr's own Pi reporter is also installed; see the warning below. |

**Tier B collision warning:** on machines where Herdr installed
`~/.pi/agent/extensions/herdr-agent-state.ts`, Atomic loads that legacy global extension in TUI
sessions too. Enabling `HERDR_ATOMIC_REPORT_AS_PI=1` then makes both extensions publish the same
`herdr:pi` / `pi` identity to one pane with independent sequence counters, which is worse than the
default behavior of showing two distinct agents. Check for that file and remove or disable one of
the two writers before enabling Tier B.

`HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT=1` exists only for the spawned acceptance test. Do not set it in normal use. It lets a real `atomic --mode rpc` child exercise the otherwise TUI-only root predicate against a fake socket.

No PATH shim is installed or required.

## Protocol

The reporter sends newline-delimited JSON requests directly to the Herdr pane socket:

- `pane.report_agent`
- `pane.report_agent_session`
- `pane.release_agent` on a quit shutdown

An absolute Atomic session file is sent as `agent_session_path`; otherwise a non-empty session id is sent as `agent_session_id`. The session path takes precedence. On Windows, the configured socket value is mapped to `\\.\pipe\<path>`.

## Acceptance test boundary

The end-to-end test launches the installed Atomic 0.9.17 binary in RPC mode with an explicit test-only root opt-in and a temporary session directory. It sends one RPC prompt, observes the real host emit initial idle, agent working, and settled idle transitions, then closes stdin and verifies that the graceful quit delivers `pane.release_agent` before the child exits. Provider completion content is not part of the assertion. Every child Herdr variable is explicitly overridden to a temporary fake socket and fake pane id.

## Workflow-lifecycle verification

**Negative finding:** installed `@bastani/atomic` 0.9.17 exposes exactly 36 public `pi.on(...)` events (`dist/core/extensions/api-types.d.ts:26-62`), and none is a workflow lifecycle event. A background workflow entering `awaiting_input` is recorded only for internal dedupe/status/UI purposes: `emitStageAwaitingInputNoticeOnce` and `emitRunAwaitingInputNoticeOnce` (`dist/builtin/workflows/src/extension/index.bundle.mjs:98023-98038`) add a dedupe key and never call the lifecycle delivery path used by terminal, control, and budget events (`:97991-98020`, `:98039-98047`). The installed documentation confirms this is deliberate: awaiting-input is tracked without waking the main agent (`docs/workflows.md:3284,3292,3648-3652`). Therefore this reporter cannot consume workflow waits and does not fake them.

The workflow-looking bundle strings `workflow_stage_admission`, `workflow_stage_route`, `workflow_stage_message`, `workflow_ui`, `workflow_not_found`, and `workflow_tool` are bundler initializers, internal Intercom broker protocol frames, or provenance-tag values, not subscribable extension events. Type-level verification agrees: `tsc` rejects `pi.on("workflow_awaiting_input", ...)` with TS2769 because that name is absent from the public overload union.

The nearest non-event alternatives are intentionally not used. The `workflow` tool/command `status` action with `statusFilter: "awaiting_input"` is agent-facing dispatch rather than an event; polling it would create turns and side effects. The derived status file is disabled by default (`statusFile: false`, `docs/workflows.md:3648-3650`), so observing it would require user configuration, watchers, diffing, and all defect-map protections. `~/.atomic/workflows/runs/` is not an authoritative lifecycle store; DBOS/Postgres is the durable catalog. If a future Atomic release exposes workflow lifecycle events, a consumer must never replay historical `started` on snapshot invalidation or resume, must collapse or refcount sibling continuation lineages without dropping a live sibling, must keep stable lineage identity across predecessor pruning, and must preserve terminal tombstones across publisher replacement.

**Intercom/supervisor asks are also not observable through the public extension API.** Inbound asks live in Intercom's private `ReplyTracker.pendingAsks` (`dist/builtin/intercom/index.bundle.mjs:58948-59046`), and the public `pending` tool action reads that private tracker (`:60246-60264`). `ExtensionAPI` exposes neither an `intercom_ask`/`supervisor_ask` event nor a pending-ask accessor. The `subagent:parent-ask-handoff-request` channel (`:59075-59089`) is internal sender-side coordination, not a receiver-side blocked signal.

**Confidence:** the negative is proven statically from the shipped type union and installed workflow implementation, while a live RPC probe confirmed that the loader and documented session/agent hooks fire. A real background workflow reaching `awaiting_input` was not launched because its DBOS durable backend would write outside the permitted probe boundary; that live path is therefore unproven by probe but directly proven by shipped code.

## Known limitations

- Atomic's project-trust prompt is host-owned and is not exposed through `ui_prompt_start` / `ui_prompt_end`, so this extension cannot report that trust wait.
- Background workflow waits are invisible because Atomic 0.9.17 exposes no workflow lifecycle extension event; they are not reported as blocked.
- Supervisor and Intercom asks are invisible from extension land in this design; they are not reported as blocked.
- The default `herdr:atomic` / `atomic` identity provides presentation-level acceptance only until Herdr recognizes that pair as a full-lifecycle authority. Screen/process fallback can still compete. Tier B is a local-only compatibility masquerade.
- On machines where Herdr installed `~/.pi/agent/extensions/herdr-agent-state.ts`, Atomic also loads that TUI-only legacy global reporter. It is a second concurrent writer to the same pane (`herdr:pi` / `pi`) alongside this reporter's default `herdr:atomic` / `atomic` identity. The cutover deliberately does not remove or modify that Herdr-managed file because it is outside this project's scope. Disable one writer before enabling Tier B; otherwise both writers collide on the same identity with independent sequence counters.
- State and sequence continuity survive `/reload` in the current Atomic process, not a process restart.
- Herdr cannot restore Atomic sessions today: the session reference this extension publishes is retained by Herdr but there is no restore arm for Atomic, so it stays inert until Herdr adds one.
- Herdr's own process detection varies with how Atomic is launched. A plain `atomic` shim is detected by basename; `npx`/`bunx` launches resolve to `dist/cli.js` and read as `cli` on the Herdr side. This does not block presentation-level reports, but it affects any future detection-gated behavior.

## Rollback

Remove the global extension symlink, then start a new Atomic session or run `/reload`:

```sh
rm ~/.atomic/agent/extensions/herdr-atomic-reporter
```

The legacy project-local prototype removed during cutover is preserved verbatim at
[`reference/legacy-prototype.ts`](reference/legacy-prototype.ts). To return to the old behavior,
copy it back to `<project>/.atomic/extensions/herdr-atomic-prototype.ts` and reload. Note that the
prototype reports a simulated blocked state behind its `/herdr-block` command rather than a real one,
and that running both at once double-reports to the same pane.

## Development

```sh
pnpm install
pnpm test
```

The suite uses a real temporary Unix socket. Its preload guard refuses the known live socket and any inherited environment with live Herdr reporting enabled before replacing the environment with disabled test values; each transport test then creates and uses its own fake pane endpoint.

A scheduled GitHub Actions canary (`.github/workflows/canary.yml`) runs the suite daily against both the pinned Atomic version and `@latest`, and opens a repo issue when only the latest leg fails — separating upstream drift from repo regressions.
