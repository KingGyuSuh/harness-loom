# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **License changed from MIT to Apache License 2.0** ahead of the
  public flip. Apache 2.0 adds an explicit patent grant, a
  patent-retaliation clause, and the NOTICE attribution mechanism, which
  fits a methodology-heavy OSS project and aligns with the licensing of
  adjacent assistant-platform ecosystems. Safe to relicense because the
  repo is still private and has no external contributors. Plugin
  manifests (`plugins/harness-loom/.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`) now declare `"license": "Apache-2.0"`,
  and all READMEs / `TERMS.md` reference the new license.

### Added

- **`NOTICE` file** at repo root, required by Apache 2.0.
- **Public roadmap.** GitHub Milestones `v0.2.0`–`v0.5.0` opened as the
  single source of truth for forward-looking work, and `README.md` now
  carries a short `## Roadmap` section linking to them.
- **Branching and merge policy** documented in `CONTRIBUTING.md`
  (trunk-based, one-issue-per-branch, squash-merge, rebase-on-main).

### Fixed

- **Broken logo paths in all READMEs.** After the 0.1.3 monorepo
  relocation, `assets/` lives under `plugins/harness-loom/assets/`, but
  the five READMEs still pointed at the old root-level path. Image
  references in `README.md` and `docs/README.{ko,ja,zh-CN,es}.md` now
  resolve correctly on GitHub.

## [0.1.3] — 2026-04-19

### Changed

- **Factory relocated to `plugins/harness-loom/` monorepo layout.** The repo
  now follows the Codex/Claude standard layout: `.claude-plugin/marketplace.json`
  and `.agents/plugins/marketplace.json` at the root point at
  `./plugins/harness-loom`, and the actual plugin tree (skills, assets,
  `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`) lives under
  `plugins/harness-loom/`. This aligns with the 227-plugin
  [`openai/plugins`](https://github.com/openai/plugins) standard and fixes
  the `codex marketplace add ... → local plugin source path must not be
  empty` error caused by the previous root-as-plugin layout.
- **Gemini CLI reclassified as runtime-only.** Because Gemini's extension
  loader hardcodes the repo root as the extension root, it is incompatible
  with the `plugins/<name>/` monorepo layout adopted above. The factory's
  own `gemini-extension.json` has been removed. Gemini is still fully
  supported as a consumer of harnesses installed into target projects:
  `/harness-sync --provider gemini` deploys the target-side `.gemini/` tree
  that `gemini` auto-loads from workspace scope (agents, skills, hooks).

### Fixed

- **Gemini hook shape in `sync.ts`** aligned to the official 2-layer
  nested schema (`hooks.AfterAgent[].hooks[].type|command|timeout`). The
  prior flat shorthand `{ AfterAgent: [{ command }] }` was invalid per
  [`docs/hooks/reference.md`](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)
  and would have been rejected by Gemini's hook loader.
- **Claude marketplace install slug** — READMEs now correctly reference
  `harness-loom@harness-loom-marketplace` (the name from
  `.claude-plugin/marketplace.json`) instead of the earlier incorrect
  `harness-loom@harness-loom`.
- **Claude local-dir install path** updated to
  `claude --plugin-dir ./plugins/harness-loom` to match the new layout.

## [0.1.2] — 2026-04-19

### Added

- **Gemini CLI extension manifest** — `gemini-extension.json` at the
  repo root enables `gemini extensions install
  https://github.com/KingGyuSuh/harness-loom --ref v0.1.2`. Gemini's
  convention-based loader auto-discovers the three factory skills
  (`harness-init`, `harness-pair-dev`, `harness-sync`) via `/skills`;
  no extra registration required. Slash-command aliases matching the
  Claude/Codex UX (`/harness-init` etc.) are tracked for a later
  release.

### Fixed

- **Install commands in all READMEs aligned to official docs.** The
  previously shipped `claude plugin add <path>` syntax is not a real
  Claude Code CLI command; replaced with `claude --plugin-dir
  ./harness-loom` for sanity tests and the in-session `/plugin
  marketplace add` flow for persistent install (including GitHub
  shorthand `KingGyuSuh/harness-loom` and tag pinning
  `@v0.1.2`). Codex install copy now references the TUI `/plugins`
  command (not a vague "open the marketplace entry") and the public
  `owner/repo` + `@tag` shorthand. Gemini section now shows the real
  `gemini extensions install` command instead of pointing at
  `.agents/plugins/marketplace.json`, which Gemini CLI never read.
  Correction applied to `README.md`, `docs/README.ko.md`,
  `docs/README.ja.md`, `docs/README.zh-CN.md`, `docs/README.es.md`.

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

[Unreleased]: https://github.com/KingGyuSuh/harness-loom/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.3
[0.1.2]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.2
[0.1.1]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.1
[0.1.0]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.0
