# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-04-22

### Added

- **`/harness-auto-setup` setup-and-refresh workflow.**
  New factory-side skill that safely installs, refreshes, or converges
  a target harness. Fresh targets are seeded through the foundation
  installer and receive repo-grounded pair/finalizer recommendations.
  Existing targets snapshot `.harness/loom/` and `.harness/cycle/`
  under `.harness/_snapshots/auto-setup/<timestamp>/`, warn before
  discarding active or unknown cycle state, reseed the foundation,
  reconstruct valid registered pairs and customized finalizer intent
  against current templates, and stop with an explicit
  `node .harness/loom/sync.ts --provider <list>` handoff. Auto-setup
  never writes `.claude/`, `.codex/`, or `.gemini/` directly.
- **`/harness-pair-dev --remove <pair-slug>` guarded removal.**
  Safely unregisters a pair and deletes only pair-owned `.harness/loom/`
  files. Removal refuses foundation/singleton targets, missing pairs,
  paths outside `.harness/loom/{agents,skills}/`, active-cycle
  references in `## Next`, and live EPIC roster/current fields before
  mutating anything. Shared agents and skills referenced by other
  registered pairs are preserved. `.harness/cycle/` task and review
  history stays intact — historical evidence is runtime state, not
  pair-authoring state.
- **`/harness-pair-dev --add --from <existing-pair-slug>` template-first
  overlay.** `--add` now accepts an optional `--from` anchored to a
  currently registered pair. The new pair is authored from current
  templates first, then compatible source-pair domain material
  (identity, vocabulary, methodology, taboos, reviewer axes, extra
  domain skills) is overlaid on top. `<purpose>` wins over source
  intent on conflict, and the new pair skill plus `harness-context`
  remain mandatory `skills:` entries. Snapshot paths, filesystem paths,
  and derived platform paths are explicitly rejected.
- **Deterministic pair-dev helper.**
  `plugins/harness-loom/skills/harness-pair-dev/scripts/pair-dev.ts`
  validates `--add`/`--improve`/`--remove` arguments, resolves `--from`
  evidence from the current registry, and performs guarded removal
  with active-cycle safety checks. Add/improve return preparation JSON
  only; authoring bodies remains an LLM turn responsibility.
- **`references/authoring/from-overlay.md`.**
  New pair-authoring rubric describing the `--from` template-first
  overlay contract: mandatory new shape, preserve-by-default rules,
  skill preservation rule (`<new-pair-skill>` + `harness-context`
  first), and rename/conflict resolution.

### Changed

- **`/harness-pair-dev` command surface tightened.**
  `--add` and `--improve` now both require a positional `<purpose>`
  string. Placement anchors (`--before`/`--after`) are documented on
  both. `register-pair.ts --unregister` is reserved for the internal
  `--remove` path; file deletion and active-cycle safety checks live
  in `/harness-pair-dev --remove`, not in the registry helper.
- **`/harness-init` scope narrowed to foundation-only.**
  Install still reseeds `.harness/loom/` and `.harness/cycle/` every
  rerun, but existing-target refresh with pair/finalizer convergence
  now belongs to `/harness-auto-setup`. `harness-init` does not
  snapshot live harness state, parse old registry intent, or preserve
  customized finalizer work.
- **READMEs, AGENTS.md, and CLAUDE.md realigned to the 0.3.0 surface.**
  English README and the four pointer-doc translations surface
  `/harness-auto-setup` as the preferred setup entry, replace the
  removed `--split` command with `--remove`, and show `--from` as
  overlay source rather than evidence-only. The Codex marketplace
  `longDescription` and `defaultPrompt` entries now advertise
  auto-setup and remove instead of split.

### Removed

- **`/harness-pair-dev --split` command.**
  Split is no longer a single pair-dev command. The equivalent
  workflow is a user-directed multi-step sequence of `--add` +
  `--improve` + `--remove`. Running `--split` returns an explicit
  "unsupported in v0.3.0" error pointing at the replacement steps.
- **`/harness-pair-dev --improve --hint` flag.**
  Revision intent now travels exclusively through the required
  positional `<purpose>`. Running `--hint` returns an explicit
  "unsupported in v0.3.0" error.

### Migration

For projects upgrading from v0.2.x to v0.3.0:

1. Prefer `/harness-auto-setup` for existing-target refresh. It
   snapshots `.harness/loom/` and `.harness/cycle/` before touching
   anything and reconstructs valid registered pairs against current
   templates, so manually tuned pair bodies are preserved as snapshot
   evidence and folded back in through the overlay rules.
2. If you previously invoked `/harness-pair-dev --split <slug>`,
   replace it with an explicit `--add` + `--improve` + `--remove`
   sequence. The clean-break error message names the replacement.
3. If you previously invoked
   `/harness-pair-dev --improve <slug> --hint "<text>"`, move the
   hint body into the new required positional `<purpose>` argument.
4. After any pair-dev mutation or auto-setup run, re-run
   `node .harness/loom/sync.ts --provider <list>` from the target
   root to refresh the derived platform trees.

## [0.2.2] — 2026-04-21

### Changed

- **Built-in `harness-doc-keeper` removed from the default runtime seed.**
  `harness-init` no longer seeds a docs-specific cycle-end producer.
  The runtime now treats cycle-end work as project-defined
  customization. Targets keep the generic singleton
  `harness-finalizer` skeleton and replace its body with repository-
  specific cycle-end work when needed. This keeps the factory neutral
  instead of assuming every target wants an automatic documentation
  curator. Tracked in issue
  [#6](https://github.com/KingGyuSuh/harness-loom/issues/6).
- **Cycle-end runtime simplified around one singleton finalizer.**
  The orchestrator no longer owns or dispatches a `## Registered
  finalizers` list. Finalizer entry is now the single
  `harness-finalizer` turn, and `registry.md` is reduced to pair-roster
  SSOT only. Install seeds that singleton as a safe no-op skeleton so
  fresh targets halt cleanly even before they customize cycle-end work.
- **`harness-init` rerun semantics were simplified.**
  Re-running install now reseeds both `.harness/loom/` and
  `.harness/cycle/` every time, and the `--force` flag is removed.
  This drops the older mixed mode where loom was wiped while cycle was
  preserved, and it avoids stale registry / old-layout upgrade drift on
  reinstall. Pair-authored loom content and current cycle state are now
  explicitly wipe-on-rerun; preservation of finished cycle history
  remains the orchestrator's archive path.
- **Reviewer-less pair authoring removed from `/harness-pair-dev`.**
  Pair authoring now always requires at least one reviewer (1:1 or
  1:M). Reviewer-less cycle-end work is modeled only through the
  singleton finalizer, not through `--reviewer none` or producer-only
  roster entries.
- **Pair-authoring references were reorganized by role.**
  Completed exemplars now live under `examples/agents/`, while
  authoring rules (`agent-authoring`, `skill-authoring`,
  `oversized-split`) live under `references/authoring/`. Example
  agents were refreshed to match the current agent template
  (`harness-context` included, `turn` wording, simplified advisory
  field wording).
- **Top-level docs were realigned to the 0.2.2 contract.**
  The English README, AGENTS.md, and CLAUDE.md now describe the
  singleton finalizer model, pair-only registry, and current pair-dev
  contract. Non-English READMEs were reduced to short pointer docs so
  they no longer preserve stale `harness-doc-keeper` or reviewer-less
  pair instructions.

### Added

- **Runtime `registry.md` template.**
  `harness-init` now seeds `.harness/loom/registry.md` as the pair
  roster SSOT. The orchestrator reads it at dispatch time, and
  `register-pair.ts` is its deterministic writer.
- **Supporting runtime references for orchestration.**
  `dispatch-envelope.md` and `state-machine.md` were added under
  `harness-orchestrate/references/` so the canonical orchestrator body
  can stay focused on the gradeable contract while detailed envelope
  shape and state-machine summaries live beside it.

## [0.2.1] — 2026-04-20

### Changed

- **Defer-to-end planner continuation.** Replaces the previous
  one-shot planner turn with a flag-driven re-entry. The planner's
  Output Format now carries a load-bearing `next-action: <"done" |
  "continue — <reason>">` line; `continue` writes
  `planner-continuation: pending` into a **new fourth header line** on
  `state.md`, and Phase advance rule 4 consumes that flag by recalling
  the planner (instead of halting) once every EPIC reaches terminal.
  The recalled planner plans the next batch against real `events.md`
  execution evidence rather than a pre-cycle prediction. The planner
  distinguishes the two recall modes via `Next.Intent` prefix —
  `(retreat reason: ...)` for a structural-issue retreat,
  `(planner continuation: ...)` for a defer-to-end recall.
- **Producer / reviewer advisory fields are optional forward hints.**
  `Suggested next-work` (producer) and `Advisory-next` (reviewer) no
  longer carry mandatory placeholder text; `none` is the canonical
  value when there is nothing non-obvious to pass forward. The
  orchestrator does **not** consume these fields to decide `Next.To` —
  that is determined by Phase advance rules from the verdict. Treating
  them as routing authority is documented as a role leak into the
  planner meta-role that alone owns its `next-action` signal.
- **Naming disambiguation.** Executor-side advisory comments that
  previously referenced "actual Next-action" now reference "the Next
  block" (informal shorthand for `state.md` `## Next`). The literal
  `next-action` field is reserved for the planner meta-role's
  load-bearing continuation grammar. Prevents cross-role confusion
  introduced by the new planner field.

### Added

- **Planning rubric gains concrete continue/done signals + two-mode
  recall section.** `harness-planning` §2 now lists specific triggers
  for `continue` (later EPIC shape depends on earlier execution, goal
  is exploratory, follow-up feature depends on shipped behavior) vs.
  `done` (plan is fully decidable up front). §5 teaches the planner to
  tell structural-issue recall from defer-to-end recall via the
  `Next.Intent` prefix and to treat `Recent events` as the evidence
  base on a continuation recall. New taboos forbid padding-style
  continuation and ignoring `Recent events` on recall.
- **Runtime anchor tests for the new contracts.**
  `tests/runtime-template-anchors.test.mjs` pins eight load-bearing
  strings: the 4-line header schema, `planner-continuation: none`
  template default, defer-to-end `Phase advance rule 4` wiring in the
  orchestrator, zero-emit safety discriminator, `next-action` grammar
  on both planning skill and planner agent, Intent-prefix mode
  distinction, and a legacy-token regression block that fails if old
  wording (`NEEDS-MORE-TURNS`, `no further planning required`,
  `actual Next-action`) ever reappears.

### Fixed

- **Zero-emit safety discriminator.** The safety clause that prevents
  a pathological continuation-recalled planner from stalling halt now
  keys off `planner-continuation: pending` being on the state header at
  turn start, not off `Phase: planner` alone. The prior wording would
  have misfired on cold start, goal-reset, structural retreat to
  planner, and ready-set-empty recall — all of which legitimately
  arrive with `Phase: planner` and must not trip the safety.
- **Additional-pairs halt policy.** Turn Algorithm step 8-a now
  explicitly labels the `Additional pairs required` halt as a
  **blocked halt** (user intervention required) and states that step
  10 (cycle-end doc-keeper dispatch) does **not** run there. Doc-keeper
  fires only through Phase advance rule 4 with
  `planner-continuation: none`. Removes ambiguity flagged during audit
  between immediate halt and normal cycle-end halt.

## [0.2.0] — 2026-04-20

### Changed

- **Canonical source moved from `.claude/` to `.harness/loom/`.** Every
  target now uses a three-namespace `.harness/` layout: `loom/` is the
  canonical staging tree owned by install + sync, `cycle/` holds runtime
  state owned by the orchestrator, and `docs/` is owned by the new
  built-in `harness-doc-keeper` reviewer-less producer. `harness-init` no
  longer touches `.claude/`; `.claude/` is now a derived platform tree
  written by the sync script. **Breaking** — pre-0.2.0 targets that
  authored harness artifacts directly into `.claude/skills/harness-*`
  must be migrated by hand (see Migration note below).
- **`/harness-sync` slash skill removed.** The factory's user-facing
  surface is now two slash skills (`/harness-init`, `/harness-pair-dev`)
  plus the script entry `node .harness/loom/sync.ts --provider <list>`
  that `harness-init` copies into every target. The script remains
  importable as a library (`runSync({ targetRoot, providers })`), so
  callers that scripted around the old slash skill can switch to the
  direct script invocation. **Breaking** — any tooling or automation
  that issued `/harness-sync ...` must replace the call with
  `node .harness/loom/sync.ts --provider <list>`.
- **Sync deploy is always an explicit opt-in.** A bare
  `node .harness/loom/sync.ts` with no `--provider` is now an error.
  The previous auto-detect (which treated a pre-existing `.claude/`,
  `.codex/`, or `.gemini/` directory as proof of a prior harness deploy)
  is removed — a directory may predate the harness, and overwriting it
  silently would clobber unrelated user settings. **Breaking** for any
  workflow that invoked sync without flags and expected the discovered
  platforms to be re-synced.
- **Cycle reset is performed by the orchestrator directly, not by a
  separate `init.ts` script.** When `/harness-orchestrate` classifies a
  new goal as *different*, the orchestrator itself moves the current
  cycle into `.harness/_archive/<timestamp>/` and reseeds `state.md` /
  `events.md` in the same response before continuing Cold start.
  Removing `init.ts` eliminates a duplicate template body and makes the
  reset path auditable from the orchestrate SKILL alone.
- **Roster is sourced from a single file.** The orchestrator SKILL's
  `## Registered pairs` section is the sole roster SSOT. `register-pair.ts`
  writes only that section, and the planner receives the current roster
  through the dispatch envelope (`Registered roster` field); the earlier
  mirrored list in `harness-planning/SKILL.md` is gone, removing the
  drift risk where a partial write could leave the two files out of
  sync. `--unregister` is likewise bounded to that one section, and
  prose elsewhere in the SKILL is preserved.
- **`/harness-pair-dev` no longer auto-runs sync.** After `--add`,
  `--improve`, or `--split`, the user re-runs
  `node .harness/loom/sync.ts --provider <list>` explicitly to deploy
  authored pairs into platform trees. Removing the implicit sync makes
  the authoring step idempotent, keeps `.harness/loom/` writes off the
  hot path of platform deployment, and lets the user batch multiple
  pair edits before paying for a single sync. **Breaking** — workflows
  that relied on the implicit sync after `--add` must add the explicit
  command.
- **Cycle-end doc-keeper dispatch added to `/harness-orchestrate`.**
  Every cycle's halt-prep step now auto-dispatches the new built-in
  `harness-doc-keeper` reviewer-less producer as a final turn before
  clearing `Next`. The producer reads the project + goal + cycle
  activity and authors or evolves project documentation **directly in
  the target** — root master files (`CLAUDE.md`, `AGENTS.md`,
  `ARCHITECTURE.md`, …) plus a `docs/` subtree (`design-docs/`,
  `product-specs/`, `exec-plans/`, `generated/`, etc. — only the subset
  the project's evidence supports). Existing hand-authored content
  outside the pointer section is preserved byte-for-byte. Verdict comes
  from the producer's own `Status: PASS|FAIL` per the reviewer-less
  verdict path; on `FAIL` the slot reworks once and then halts so
  documentation drift never blocks the cycle. **Breaking** in the
  sense that every cycle now ends with one extra automatic turn, and
  any target with a hand-authored `CLAUDE.md` / `AGENTS.md` will see
  its pointer section (enumerating root + `docs/` master files)
  rewritten on the next halt.

### Added

- **`.harness/loom/` and `.harness/cycle/` namespaces** — the new
  two-way split of the runtime workspace. Authority is exclusive:
  install + sync own `loom/`, and the orchestrator owns `cycle/`.
  `_archive/` holds past cycles that the orchestrator moves there on a
  goal-different reset. Project documentation is **not** under
  `.harness/` — it lives at the target root (`*.md`) and in `docs/`,
  right where a team would look for it.
- **`harness-doc-keeper` built-in producer templates.** Two new runtime
  templates ship under
  `plugins/harness-loom/skills/harness-init/references/runtime/`:
  `harness-doc-keeper/SKILL.template.md` defines the docs-curator
  rubric (analyze project + goal, design a project-appropriate layout,
  author/evolve master files and `docs/` subtree, keep the pointer
  section in `CLAUDE.md` / `AGENTS.md` surgical), and
  `harness-doc-keeper-producer.template.md` provides the producer body
  (Self-verification carries files created/modified/left-alone, layout
  rationale, and a cycle-to-docs impact map). Registration line uses
  the reviewer-less form `(no reviewer)` without `↔`.
- **Self-contained target sync.** `harness-init` now copies
  `sync.ts` next to `hook.sh` under `<target>/.harness/loom/`, so
  `node .harness/loom/sync.ts --provider <list>` works without the
  factory plugin being on `node`'s search path.

### Removed

- **`/harness-sync` slash skill** (factory side). Replaced by the
  `node .harness/loom/sync.ts --provider <list>` script entry that the
  installer copies into every target.
- **Auto-sync from `/harness-pair-dev`.** `--add`, `--improve`, and
  `--split` write only into `.harness/loom/`; the user runs sync as an
  explicit follow-up.
- **`init.ts` script.** Cycle reset is now inlined into the orchestrate
  SKILL (§Goal entry step 3). There is no longer a separate reset tool
  in the factory or in `.harness/loom/`; one template body fewer to keep
  in sync.
- **`detectDeployedProviders` export from `sync.ts`.** The function was
  only referenced by its own `main()`, and that call site is gone. The
  public library surface is `runSync({ targetRoot, providers })` only.
- **Auto-detect fallback in bare `node .harness/loom/sync.ts`.** Every
  deploy must now come with `--provider <list>` or one of
  `--claude` / `--codex` / `--gemini`.

### Migration

For projects upgrading from v0.1.x to v0.2.0 there is no automated
migration script (out of cycle scope). Manual steps:

1. Back up the existing `.harness/` directory and any hand-authored
   harness files under `.claude/skills/harness-*` and
   `.claude/agents/harness-*`.
2. Re-run `/harness-init`. This creates the new
   `.harness/{loom,cycle}/` layout and seeds the runtime skills,
   `harness-planner` agent, and the new built-in `harness-doc-keeper`
   pair under `.harness/loom/`.
3. Move project-specific harness pairs from
   `.claude/skills/harness-<pair>/` into
   `.harness/loom/skills/harness-<pair>/`, and from
   `.claude/agents/harness-<pair>-{producer,reviewer}.md` into
   `.harness/loom/agents/`.
4. Run `node .harness/loom/sync.ts --provider claude,codex,gemini`
   (use only the providers you actually deploy) to re-derive the
   platform trees from canonical staging. The script overwrites
   `.claude/`, `.codex/`, and `.gemini/` deterministically; do not
   hand-edit them afterward.
5. Continue normal `/harness-orchestrate` and `/harness-pair-dev`
   usage; the cycle-end auto-doc-keeper dispatch will author or evolve
   project documentation at the target root (`CLAUDE.md`, `AGENTS.md`,
   `ARCHITECTURE.md`, etc.) and under `docs/` on the next halt. Any
   hand-authored content outside the pointer section is preserved.

## [0.1.5] — 2026-04-20

### Changed

- **`/harness-pair-dev --add` now takes `<purpose>` as a positional
  second argument.** The legacy `--purpose "<text>"` flag form is gone.
  New shape: `/harness-pair-dev --add <pair-slug> "<purpose>" [--reviewer
  <slug>|none ...]`. **Breaking** for any caller still using the
  `--purpose` flag — re-run with the positional form. Reduces the
  argument-hint to a single self-evident line and removes a parse path
  that could silently swallow an empty purpose.
- **User-facing `--target` and `--provider` flags are removed from
  `/harness-pair-dev`.** Target is fixed to the current working
  directory; provider sync is delegated to `sync.ts`'s on-disk detection
  (claude is always present; codex/gemini only when their derived trees
  already exist). To enable a new provider for the first time, call
  `/harness-sync --provider <list>` separately. The internal
  `register-pair.ts` script still accepts `--target` for integration
  tests; only the user-facing slash entry changes.
- **Runtime `harness-orchestrate` template recognizes the producer-only
  registration shape and dispatches reviewer-less producer turns
  cleanly.** When the `## Registered pairs` line carries the
  load-bearing `(no reviewer)` token (and lacks the `↔` arrow), the
  orchestrator skips reviewer dispatch, writes no review file, and
  treats the producer's own `Status: PASS|FAIL` plus
  `Self-verification` as the verdict source. A producer
  `## Structural Issue` block remains the only retreat trigger.
  Reviewer-less is framed as **"not subject to review"** in the
  reviewed-work contract, never as **"passed without review"**.
- **`harness-pair-dev` authoring rubric documents when reviewer-less is
  appropriate.** A new `### 7. When reviewer-less is appropriate`
  section in the SKILL body, plus matching Evaluation Criteria and
  Taboos, scope `--reviewer none` to deterministic / auxiliary work
  (sync, format, mirror, mechanical translation) and explicitly forbid
  it for creative / judgment / generative work (code authoring, doc
  writing, marketing copy, planning, schema design). Pair-first
  identity is preserved across the rubric and the example-skills
  references.

### Added

- **`--reviewer none` reviewer-less opt-in for `/harness-pair-dev
  --add`.** Pair authoring stays the default; passing the literal
  `none` value (and only that, never mixed with real reviewer slugs)
  produces a producer-only group with no reviewer agent file. The
  `register-pair.ts` script writes a third registration shape:
  `` - <pair>: producer `<p>` (no reviewer), skill `<s>` ``. The
  missing `↔` arrow plus the literal `(no reviewer)` token are the
  load-bearing markers the runtime uses to dispatch the turn without
  expecting a reviewer.

### Fixed

- **Stale canonical references inside
  `plugins/harness-loom/skills/harness-pair-dev/SKILL.md`.** The file
  claimed `references/example-agents/` held "7 files" / "seven pair
  examples" when the directory has always carried eight, and it cited
  `register-pair.ts:174` as the registration-entry line after the
  0.1.4 prefix-validation block pushed it to line 181. Updated both
  counts and the line citation so canonical references match disk.
- **Phase advance Retreat rule allowed an empty `Prior reviews` for
  reviewer-less producer turns.** Rule 2 in the runtime
  `harness-orchestrate` template previously demanded a structural-issue
  review file in `Next.Prior reviews`, but reviewer-less turns write
  zero review files; the structural issue lives inside the producer's
  task file, which is already in `Next.Prior tasks`. Rule 2 now matches
  the Rework rule's pattern (paired = `[the structural issue review]`,
  reviewer-less = `[]`), so a producer-emitted `## Structural Issue`
  retreat no longer references a non-existent review artifact.

## [0.1.4] — 2026-04-19

### Changed

- **All pair-generated subagents and skills are now namespaced with
  `harness-`.** `/harness-pair-dev --add`'s pair slug, producer slug,
  reviewer slugs, and shared-skill slug are normalized at authoring
  time (idempotent prepend) and hard-rejected by `register-pair.ts` if
  any slug still lacks the prefix. This unifies the naming convention
  across factory-installed artifacts (`harness-orchestrate`,
  `harness-planning`, `harness-context`, `harness-planner`) and
  project-specific pairs, so everything under `.claude/agents/` and
  `.claude/skills/` owned by the harness is recognizable at a glance.
  The eight reference files under
  `plugins/harness-loom/skills/harness-pair-dev/references/example-agents/`
  were renamed with the prefix to keep the rubric self-consistent with
  the new rule. Breaking for any pre-existing unprefixed pairs, but
  the repo owns no such pairs and has no external clones yet.
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

[Unreleased]: https://github.com/KingGyuSuh/harness-loom/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.3.0
[0.2.2]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.2.2
[0.2.1]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.2.1
[0.2.0]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.2.0
[0.1.5]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.5
[0.1.4]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.4
[0.1.3]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.3
[0.1.2]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.2
[0.1.1]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.1
[0.1.0]: https://github.com/KingGyuSuh/harness-loom/releases/tag/v0.1.0
