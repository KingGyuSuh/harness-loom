# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-04-19

### Added

- **Integration test suite** (`tests/*.test.mjs`) covering `install.ts`,
  `sync.ts`, `register-pair.ts`, and `.harness/hook.sh`. Built on Node's
  built-in `node:test` runner with zero external dependencies — each
  test spins up a real tempdir, runs the script under test, and asserts
  against the produced files. Coverage includes Codex nested `hooks.json`
  shape, `[features] codex_hooks` feature flag, Gemini `AfterAgent` hook,
  platform-dispatched `hook.sh` reason payload, register-pair 1:1 / 1:M
  format, and absolute-path leak regression.
- **CI workflow** (`.github/workflows/ci.yml`) running
  `node --test tests/*.test.mjs` on Node 22.x for every push and pull
  request.

### Changed

- **Factory skill surface fully translated to English.** All SKILL.md
  bodies (`harness-init`, `harness-pair-dev`, `harness-sync`), runtime
  templates under `skills/harness-init/references/runtime/`, example
  agents and skills under `skills/harness-pair-dev/references/`, and
  pair authoring templates are now English-first for OSS consumers.
  Frontmatter trigger descriptions, rubric language, orchestrator
  contract, and reviewed-work shape are all consistent across the
  surface.

### Fixed

- **Codex hook config shape** — `.codex/hooks.json` is now emitted in the
  canonical nested form `{ hooks: { Stop: [ { hooks: [ { type, command,
  timeout } ] } ] } }` expected by `codex-rs/hooks/src/engine/config.rs`.
  The prior shorthand `{ Stop: [ { command } ] }` failed serde parsing and
  prevented Codex from loading the Stop hook at all.
- **Codex feature flag** — `sync.ts` now writes `[features] codex_hooks =
  true` into `.codex/config.toml` (creating or merging as needed). Without
  this flag Codex ignores `hooks.json` entirely.
- **Platform-specific orchestrator invocation** — `.harness/hook.sh` now
  takes a `<platform>` argument (`claude|codex|gemini`) and emits the
  correct invocation syntax in the Stop-hook `reason` payload:
  `/harness-orchestrate` for Claude/Gemini, `$harness-orchestrate` for
  Codex (Codex reserves `/name` for built-in CLI commands; user skills are
  mentioned via `$`). Each platform's hook config now passes the matching
  argument. Bare `bash .harness/hook.sh` still defaults to Claude syntax
  for back-compat.

## [0.1.0] — 2026-04-19

First public release.

- **Three user-invocable skills** — `/harness-init` seeds the canonical
  `.claude/` foundation into a target repo; `/harness-pair-dev` adds,
  improves, or splits producer-reviewer pairs anchored to the target
  codebase; `/harness-sync` one-way derives `.codex/` and `.gemini/`
  from `.claude/`.
- **Installed runtime** — `harness-orchestrate`, `harness-planning`,
  `harness-context` skills plus a `harness-planner` agent, coordinated
  through `.harness/state.md` + `.harness/events.md` with Stop-hook
  re-entry.
- **Multi-platform** — Claude Code, Codex CLI, Gemini CLI.
- **Repo scaffolding** — README, CONTRIBUTING, SECURITY,
  CODE_OF_CONDUCT, PRIVACY, TERMS, and `.github/` issue + PR templates.

[Unreleased]: https://github.com/KingGyuSuh/harness-loom/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.1
[0.1.0]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.0
