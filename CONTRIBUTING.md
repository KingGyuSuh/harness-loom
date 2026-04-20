# Contributing to harness-loom

Thanks for your interest in improving the plugin. This guide covers the
development loop, conventions, and what a good change looks like.

## Development setup

Requirements:

- **Node.js ≥ 22.6** (native TypeScript stripping; no build step).
- **Claude Code** for plugin-side interactive testing (optional for PRs
  that don't touch skill bodies).

Clone and link locally:

```bash
git clone https://github.com/KingGyuSuh/harness-loom.git
cd harness-loom
```

To use the plugin against a scratch project:

```bash
mkdir /tmp/scratch && cd /tmp/scratch
claude --plugin-dir /absolute/path/to/harness-loom
# then in Claude Code:
/harness-init
/harness-pair-dev --add harness-sample "scratch test"
```

## Project layout

```
.claude-plugin/marketplace.json     # Claude Code marketplace (source: ./plugins/harness-loom)
.agents/plugins/marketplace.json    # Codex marketplace (source: {local, ./plugins/harness-loom})
plugins/
  harness-loom/                     # factory plugin root (standard monorepo layout)
    .claude-plugin/plugin.json      # Claude plugin manifest
    .codex-plugin/plugin.json       # Codex plugin manifest
    assets/                         # logos referenced by plugin.json
    skills/
      harness-init/                 # /harness-init (user-invocable)
      harness-pair-dev/             # /harness-pair-dev (user-invocable)
      harness-init/references/runtime/   # target-side runtime templates (`*.template.md`)
tests/                              # node:test integration suite
docs/README.*.md                    # translated READMEs
```

Gemini CLI has no factory-level manifest: Gemini's extension loader expects the
manifest at repo root, which conflicts with the monorepo layout. Gemini support
exists at the *runtime* layer — `sync.ts` deploys `.gemini/` into each target
project it initializes, and `gemini` auto-loads that workspace-scope tree.

## What changes are in scope

**Happy to accept:**
- Bug fixes with a minimal reproducing E2E case.
- Factory rubric improvements (`plugins/harness-loom/skills/harness-pair-dev/references/example-skills/*.md`).
- Documentation polish, especially in English-facing materials.
- Platform spec conformance fixes (Codex TOML, Gemini frontmatter).
- Additional runtime template refinements that don't break existing
  targets.

**Please open a discussion first:**
- New user-invocable skills (would expand the factory surface).
- Changes to the orchestrator rhythm (pair / response contract).
- New platform targets beyond Claude / Codex / Gemini.

## Branching and merge policy

- **Trunk-based.** Branch off `main`, PR back into `main`. Don't merge feature branches into each other.
- **One issue per branch, one PR per branch.** Keep branches short-lived; delete after merge.
- **Naming:** `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`. Prefix with the issue number if one exists (`feat/12-parallel-mode`).
- **Rebase on `main`, don't merge `main` into your branch.** Resolve conflicts by rebasing so history stays linear.
- **Squash merge only.** Each PR lands as a single commit on `main`; the PR title becomes the commit subject and should match the [commit style](#making-a-change) below.
- **Parallel work is fine** — milestone items that touch different files (CI, `install.ts`, `examples/`, docs) can ship out of order. Coordinate only when two PRs edit the same file.

## Making a change

1. **Fork and branch.** Follow the naming rules above (e.g. `feat/pair-hint-flag`, `fix/codex-toml-schema`).
2. **Run the test suite.**
   ```bash
   node --test tests/*.test.mjs
   ```
   The suite spins up temp directories, runs `install.ts` / `sync.ts` /
   `register-pair.ts` / `hook.sh` against them, and asserts on the
   generated files (Codex nested `hooks.json`, `[features] codex_hooks`,
   platform-dispatched `hook.sh reason`, register-pair contract format,
   no absolute-path leaks, etc). No external dependencies — Node 22.6+'s
   built-in `node:test` runner is the only requirement. CI runs the same
   command on every push and pull request.
3. **Type check (editor-based).** This repo is zero-build — scripts run via
   Node 22.6+ native type stripping, and there is no `package.json` /
   `tsconfig.json`. Keep signatures honest by opening the edited `scripts/*.ts`
   in an editor with a bundled TS language server (VS Code, WebStorm, etc.)
   and resolving any reported diagnostics before sending the PR. The test
   suite in step 2 catches runtime regressions; type drift is caught by the
   editor, not a CI-style `tsc` invocation.
4. **Commit style.**
   - `feat: <scope> — <change>` for user-visible additions
   - `fix: <scope> — <what broke → what fixed>` for bug fixes
   - `polish: <scope> — <change>` for cosmetic / phrasing
   - `docs: <scope> — <change>` for markdown-only changes
   - `chore: <scope> — <change>` for tooling / metadata
5. **Update `CHANGELOG.md`.** Add your change under `## [Unreleased]`.
6. **PR checklist** (the template will show this): smoke test passes,
   editor type diagnostics clean, CHANGELOG updated, no `{{PLACEHOLDER}}`
   residue.

## Skill authoring discipline

Skills under `plugins/harness-loom/skills/` and runtime templates under
`plugins/harness-loom/skills/harness-init/references/runtime/` follow the
factory's own rubric:

- Description acts as a trigger mechanism. "Use when X / Invoke whenever Y"
  in active voice. Do not describe permissions ("loaded only by ..."); the
  platform will drop the skill body entirely.
- Body stays under 200 lines (soft) / 300 lines (hard). Overflow goes into
  a sibling `references/{kebab-topic}.md`.
- Sections are ordered `Design Thinking → Methodology → Evaluation Criteria → Taboos`.
- Body explains *why*, not just what. Avoid oppressive MUSTs; give
  reasoning so agents can judge edge cases.
- Files under `plugins/harness-loom/skills/harness-init/references/runtime/` are written from the
  deployed harness's
  point of view only. They should describe live runtime contracts
  (orchestrator, planner, pair, `.harness/`, state/events, dispatch, review),
  not factory operations such as `/harness-init`, `/harness-pair-dev`, plugin
  installation, or marketplace/distribution concerns.

See `plugins/harness-loom/skills/harness-pair-dev/references/example-skills/skill-authoring.md`
and `agent-authoring.md` for the full rubric (it's the same rubric applied
to target-generated pairs).

## Questions

Open a GitHub Discussion or issue with the `question` label.
