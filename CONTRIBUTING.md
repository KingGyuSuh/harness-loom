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
/harness-pair-dev --add sample --purpose "scratch test"
```

## Project layout

```
skills/
  harness-init/          # /harness-init (user-invocable)
  harness-pair-dev/      # /harness-pair-dev (user-invocable)
  harness-sync/          # /harness-sync (user-invocable)
skills/harness-init/references/runtime/  # target-side runtime templates (`*.template.md`)
.claude-plugin/          # Claude Code manifest
.codex-plugin/           # Codex CLI manifest
.agents/plugins/         # Gemini CLI marketplace
```

## What changes are in scope

**Happy to accept:**
- Bug fixes with a minimal reproducing E2E case.
- Factory rubric improvements (`skills/harness-pair-dev/references/example-skills/*.md`).
- Documentation polish, especially in English-facing materials.
- Platform spec conformance fixes (Codex TOML, Gemini frontmatter).
- Additional runtime template refinements that don't break existing
  targets.

**Please open a discussion first:**
- New user-invocable skills (would expand the factory surface).
- Changes to the orchestrator rhythm (pair / response contract).
- New platform targets beyond Claude / Codex / Gemini.

## Making a change

1. **Fork and branch.** Branch name should be a short slug (`fix/codex-toml-schema`, `feat/pair-hint-flag`).
2. **Run locally.** If you touched any `scripts/*.ts`, run the install + sync smoke test:
   ```bash
   rm -rf /tmp/harness-ci && mkdir /tmp/harness-ci
   node skills/harness-init/scripts/install.ts /tmp/harness-ci
   cd /tmp/harness-ci && node /absolute/path/to/harness-loom/skills/harness-pair-dev/scripts/sync.ts --provider codex,gemini
   ```
   Both should exit 0 and produce valid output.
3. **Type check (editor-based).** This repo is zero-build — scripts run via
   Node 22.6+ native type stripping, and there is no `package.json` /
   `tsconfig.json`. Keep signatures honest by opening the edited `scripts/*.ts`
   in an editor with a bundled TS language server (VS Code, WebStorm, etc.)
   and resolving any reported diagnostics before sending the PR. The smoke
   test in step 2 catches runtime regressions; type drift is caught by the
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

Skills under `skills/` and runtime templates under
`skills/harness-init/references/runtime/` follow the
factory's own rubric:

- Description acts as a trigger mechanism. "Use when X / Invoke whenever Y"
  in active voice. Do not describe permissions ("loaded only by ..."); the
  platform will drop the skill body entirely.
- Body stays under 200 lines (soft) / 300 lines (hard). Overflow goes into
  a sibling `references/{kebab-topic}.md`.
- Sections are ordered `Design Thinking → Methodology → Evaluation Criteria → Taboos`.
- Body explains *why*, not just what. Avoid oppressive MUSTs; give
  reasoning so agents can judge edge cases.
- Files under `skills/harness-init/references/runtime/` are written from the
  deployed harness's
  point of view only. They should describe live runtime contracts
  (orchestrator, planner, pair, `.harness/`, state/events, dispatch, review),
  not factory operations such as `/harness-init`, `/harness-pair-dev`,
  `/harness-sync`, plugin installation, or marketplace/distribution concerns.

See `skills/harness-pair-dev/references/example-skills/skill-authoring.md`
and `agent-authoring.md` for the full rubric (it's the same rubric applied
to target-generated pairs).

## Questions

Open a GitHub Discussion or issue with the `question` label.
