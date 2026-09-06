# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Committed `minimumReleaseAge: 0` as repo-wide pnpm policy: this project
  tracks Atomic releases the day they publish, and pnpm 11's default
  release-age cooldown both held `@latest` back and failed frozen-lockfile
  installs whose committed entries were younger than the cooldown.

## [0.1.1] - 2026-09-06

### Changed

- Bumped the pinned `@bastani/atomic` from 0.9.17 to 0.9.18, declaring
  compatibility: the full suite passes against 0.9.18 locally and on both
  canary legs.
- Re-verified the version-scoped README claims against 0.9.18's shipped
  code: still exactly 36 public `pi.on(...)` events, still no workflow
  lifecycle or Intercom-ask events (the negative findings hold), and the
  `ui_prompt_start`/`ui_prompt_end` pair and `sessionScopedExtensionState`
  remain in place. README updated accordingly.
- Requirements note clarified: the pin is 0.9.18, and any Atomic release
  with the `ui_prompt` events (0.9.16+) should work.

## [0.1.0] - 2026-09-06

First public release: a standalone user extension that reports an Atomic TUI
session to a Herdr pane as idle, working, or blocked.

### Added

- Live pane state from Atomic lifecycle events: `working`/`idle` from
  `agent_start`/`agent_settled`, and real `blocked` state — with the actual
  prompt title as the label — from the `ui_prompt_start`/`ui_prompt_end`
  contract (Atomic ≥ 0.9.16).
- Session reference reporting (`pane.report_agent_session` with the session
  file path or id), ready for the day Herdr adds an Atomic restore arm.
- `pane.release_agent` on graceful quit, flushed before host shutdown so the
  release cannot race process exit.
- Lifecycle reducer with `blocked > working > idle` precedence, defensive
  span refcounting, and heartbeat suppression (unchanged state is never
  re-sent).
- Monotonic report sequence that survives `/reload` via Atomic's
  `sessionScopedExtensionState`, plus single-writer discipline per identity.
- Tier B identity flag `HERDR_ATOMIC_REPORT_AS_PI=1` (default off; local-only
  masquerade, documented with its collision warning).
- Test suite (17 tests): reducer, transport retry, reload survival, live
  socket guard, and a credential-free end-to-end against the real installed
  Atomic binary on a fake pane socket.
- Daily CI canary testing both the pinned Atomic version and `@latest`
  (release-age cooldown bypassed so a fresh release is tested immediately);
  a drift issue is filed only when the pinned leg passes and the latest leg
  fails.
- README documenting install, flags, rollback, the workflow-lifecycle and
  Intercom observability negative findings against installed Atomic 0.9.17,
  and every known limitation.

### Verified against

- Atomic 0.9.17 (pinned) and Atomic 0.9.18 (`@latest` canary leg), both
  green as of this release.

[Unreleased]: https://github.com/makgunay/herdr-atomic-reporter/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/makgunay/herdr-atomic-reporter/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/makgunay/herdr-atomic-reporter/releases/tag/v0.1.0
