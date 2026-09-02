# Implementation notes

## Frozen goal

Build, test, document, and cut over a standalone Atomic 0.9.17 user extension that reports real Atomic lifecycle state to Herdr without contacting the live Herdr socket.

## Acceptance matrix

| # | Contract behavior | Current-checkout evidence |
|---|---|---|
| 1 | Real Atomic 0.9.17 child loads the extension against a fake socket and reports session plus working/idle; real socket receives no traffic | `npm test` runs `tests/e2e.test.ts`; child environment overwrites all Herdr variables. `tests/safety.test.ts` proves the preload rejects any inherited enabled Herdr environment. |
| 2 | Prompt start reports blocked with exact raw title, prompt end recovers; defensive refcount and precedence blocked > working > idle | `npm test`: `tests/extension.test.ts`, `tests/reducer.test.ts` |
| 3 | Unchanged state produces no duplicate send | `npm test`: `tests/reducer.test.ts` |
| 4 | Sequence and last-published state survive extension re-evaluation through `sessionScopedExtensionState` | `npm test`: `tests/reload.test.ts` |
| 5 | Workflow lifecycle and Intercom observability | README “Workflow-lifecycle verification” records the installed 0.9.17 negative findings, direct shipped-code/type evidence, rejected alternatives, future invariants, and live-probe confidence boundary. |
| 6 | `HERDR_ATOMIC_REPORT_AS_PI=1` switches exact identity; omitted/default is Atomic | `npm test`: `tests/transport.test.ts` |
| 7 | README includes symlink install, flags, rollback, limitations; prototype copied verbatim | README inspection; before deletion, `cmp` returned 0 and both files had SHA-256 `19bfbff4807307d168291544fa8aa80bbcf3c3429522229bee5da00e66a8f163`. |
| 8 | Global cutover symlink resolves and the old project prototype is removed | `/tmp/herdr-verify/global-discovery.json` captures a real no-`-e` Atomic RPC child reporting session and `idle → working → idle` through the global symlink to a temporary fake socket; state assertions confirm the old path is absent. |
| 9 | All tests green; clean conventional commits; no external Git operations | `npm test` reports 14 pass/0 fail; `git log --oneline`; empty `git status --porcelain`; empty `git remote -v`. |

## Constrained interface decisions

- Report output is `{ state, optional message, seq }`; `message` is omitted unless blocked.
- Prompt titles are preserved verbatim, including empty strings; an absent title uses `Waiting for input`.
- Defensive prompt starts retain order and duplicates. The newest active prompt supplies the label; ends remove one active span, while an unmatched end clears prompt state without going negative.
- Session paths are used verbatim only when absolute; otherwise a non-empty session id is used verbatim. Path takes precedence. Missing references omit both fields and suppress session-only reports.
- Root activation is TUI-only in production. RPC is accepted only when the explicit test flag `HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT=1` is set, preserving the production contract while enabling the required real-child acceptance check.

## Stateful model

Reducer states are idle (`agentActive=false`, no prompts), working (`agentActive=true`, no prompts), and blocked (one or more prompts, regardless of agent activity). Legal transitions are agent start/settle, prompt start/end, and initial sync. Duplicate starts are retained; unmatched ends clear defensively. Invariants: prompt count never negative; blocked wins over working, which wins over idle; sequences strictly increase; identical state/message is suppressed; persisted reducer state is reused across reload.

## Deferred list

None within the frozen contract.
