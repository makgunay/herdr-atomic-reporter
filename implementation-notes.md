# Implementation notes

## Frozen goal

Build and test a standalone Atomic 0.9.17 user extension that reports real Atomic lifecycle state to Herdr, without performing round-2 cutover or contacting the live Herdr socket.

## Acceptance matrix

| # | Contract behavior | Current-checkout evidence |
|---|---|---|
| 1 | Real Atomic 0.9.17 child loads the extension against a fake socket and reports session plus working/idle; real socket receives no traffic | `bun test tests/e2e.test.ts`; child environment overwrites all Herdr variables and test safety guard rejects the real path |
| 2 | Prompt start reports blocked with exact raw title, prompt end recovers; defensive refcount and precedence blocked > working > idle | `bun test tests/extension.test.ts tests/reducer.test.ts` |
| 3 | Unchanged state produces no duplicate send | `bun test tests/reducer.test.ts` |
| 4 | Sequence and last-published state survive extension re-evaluation through `sessionScopedExtensionState` | `bun test tests/reload.test.ts` |
| 5 | Workflow lifecycle and Intercom observability | Deferred only to the separately assigned round-2 findings; README contains the required exact anchor and no guessed result |
| 6 | `HERDR_ATOMIC_REPORT_AS_PI=1` switches exact identity; omitted/default is Atomic | `bun test tests/transport.test.ts` |
| 7 | README includes symlink install, flags, rollback, limitations; prototype copied verbatim | README inspection; `cmp reference/legacy-prototype.ts <source>` |
| 8 | Cutover | Explicitly excluded from round 1; no symlink or deletion in this task |
| 9 | All tests green; clean conventional commits; no external Git operations | `bun test`; `git log --oneline`; `git status --porcelain` |

## Constrained interface decisions

- Report output is `{ state, optional message, seq }`; `message` is omitted unless blocked.
- Prompt titles are preserved verbatim, including empty strings; an absent title uses `Waiting for input`.
- Defensive prompt starts retain order and duplicates. The newest active prompt supplies the label; ends remove one active span, while an unmatched end clears prompt state without going negative.
- Session paths are used verbatim only when absolute; otherwise a non-empty session id is used verbatim. Path takes precedence. Missing references omit both fields and suppress session-only reports.
- Root activation is TUI-only in production. RPC is accepted only when the explicit test flag `HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT=1` is set, preserving the production contract while enabling the required real-child acceptance check.

## Stateful model

Reducer states are idle (`agentActive=false`, no prompts), working (`agentActive=true`, no prompts), and blocked (one or more prompts, regardless of agent activity). Legal transitions are agent start/settle, prompt start/end, and initial sync. Duplicate starts are retained; unmatched ends clear defensively. Invariants: prompt count never negative; blocked wins over working, which wins over idle; sequences strictly increase; identical state/message is suppressed; persisted reducer state is reused across reload.

## Deferred list

- Round 2 must replace the exact workflow-verification README anchor with the separate verifier's evidence.
- Round 2 owns the global symlink and legacy prototype deletion.
