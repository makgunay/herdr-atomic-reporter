# Herdr reporter for Atomic

A standalone user extension for installed `@bastani/atomic` 0.9.17. It reports an Atomic TUI root session to Herdr as idle, working, or blocked and publishes the Atomic session reference when one exists.

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

Identical state/message pairs are suppressed. Report sequence numbers start from `Date.now() * 1000`, increase strictly, and survive `/reload` through `sessionScopedExtensionState`. Outbound requests share one serialized writer and use one 500 ms attempt followed by one 1500 ms retry.

## Environment flags

| Variable | Meaning |
|---|---|
| `HERDR_ENV=1` | Enables reporting when the socket path and pane id are also present. |
| `HERDR_SOCKET_PATH` | Herdr Unix-socket path (or Windows pipe name). |
| `HERDR_PANE_ID` | Target pane id. |
| `HERDR_ATOMIC_REPORT_AS_PI=1` | **Local-only Tier B masquerade:** report as `herdr:pi` / `pi` instead of the default `herdr:atomic` / `atomic`. Default is off. |

`HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT=1` exists only for the spawned acceptance test. Do not set it in normal use. It lets a real `atomic --mode rpc` child exercise the otherwise TUI-only root predicate against a fake socket.

No PATH shim is installed or required.

## Protocol

The reporter sends newline-delimited JSON requests directly to the Herdr pane socket:

- `pane.report_agent`
- `pane.report_agent_session`
- `pane.release_agent` on a quit shutdown

An absolute Atomic session file is sent as `agent_session_path`; otherwise a non-empty session id is sent as `agent_session_id`. The session path takes precedence. On Windows, the configured socket value is mapped to `\\.\pipe\<path>`.

## Acceptance test boundary

The end-to-end test launches the installed Atomic 0.9.17 binary in RPC mode with an explicit test-only root opt-in and a temporary session directory. It sends one RPC prompt and observes the real host emit initial idle, agent working, and settled idle transitions. Provider completion content is not part of the assertion. Every child Herdr variable is explicitly overridden to a temporary fake socket and fake pane id.

## Workflow-lifecycle verification
<!-- ROUND2: workflow verification findings go here -->

## Known limitations

- Atomic's project-trust prompt is host-owned and is not exposed through `ui_prompt_start` / `ui_prompt_end`, so this extension cannot report that trust wait.
- Supervisor and Intercom asks are invisible from extension land in this design; they are not reported as blocked.
- The default `herdr:atomic` / `atomic` identity provides presentation-level acceptance only until Herdr recognizes that pair as a full-lifecycle authority. Screen/process fallback can still compete. Tier B is a local-only compatibility masquerade.
- State and sequence continuity survive `/reload` in the current Atomic process, not a process restart.

## Rollback

Remove the global extension symlink, then start a new Atomic session or run `/reload`:

```sh
rm ~/.atomic/agent/extensions/herdr-atomic-reporter
```

If the legacy project-local prototype was removed during cutover, restore it separately before reloading if you want the old behavior back.

## Development

```sh
pnpm install
pnpm test
```

The suite uses a real temporary Unix socket. Its preload guard refuses to run if `HERDR_SOCKET_PATH` is the known live socket, and each transport test creates and uses its own fake pane endpoint.
