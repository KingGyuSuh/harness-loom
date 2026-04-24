---
name: harness-auto-setup
description: "Use when `/harness-auto-setup` is invoked to bootstrap and configure a project-shaped harness, expand an existing harness without refreshing its foundation, or migrate an existing harness foundation with snapshot-first preservation."
argument-hint: "[--setup | --migration] [--provider claude,codex,gemini]"
user-invocable: true
---

# harness-auto-setup

## Design Thinking

`harness-auto-setup` is the factory-side setup and migration workflow for a target harness. `--setup` bootstraps fresh targets or expands an existing harness without changing its foundation, then the assistant continues with project analysis, concise user dialogue when needed, and actual pair/finalizer authoring. `--migration` exists because rerunning `/harness-init` is intentionally simple and destructive: it reseeds the foundation, but it does not preserve project-specific pairs, finalizer work, or active cycle state.

This workflow does not introduce a second human-authored setup source of truth. The durable truth remains the target's live harness files:

- `.harness/loom/registry.md` — pair roster, order, and reviewer topology
- `.harness/loom/skills/<pair>/` — pair skill bodies
- `.harness/loom/agents/<producer-or-reviewer>.md` — pair agents
- `.harness/loom/agents/harness-finalizer.md` — singleton cycle-end role

Snapshots are machine provenance and convergence input, not restore sources. Old files may explain intent, but current output must be regenerated against the current templates, authoring rubric, and target repo evidence.

## Methodology

### 1. Arguments

`/harness-auto-setup [--setup | --migration] [--provider <list>]`

The workflow always targets the current working directory. Run `/harness-auto-setup` from the project root. `--setup` is the default mode and covers fresh bootstrap plus project-shaped authoring for fresh or existing harnesses. `--migration` is for snapshot-first foundation refresh of an existing harness. `--provider` only shapes the printed sync command; sync itself is never run here.

### 2. Authority boundaries

- `/harness-init` remains the foundation installer. Auto-setup may invoke it, but must not move pair/finalizer authoring into `harness-init`.
- `/harness-pair-dev` remains the pair-authoring layer. Auto-setup may use existing pair files as evidence, but must author current pair outputs through the current templates, authoring rubric, and registry contract.
- `/harness-pair-dev --add ... --from <source>` remains the pair-source resolver. Live registered pair slugs, `snapshot:<ts>/<pair>`, and `archive:<ts>/<pair>` are valid sources; arbitrary filesystem paths and provider-tree paths are not.
- `.harness/loom/registry.md` remains the pair roster SSOT. The planner and finalizer are never registry entries.
- `harness-finalizer` remains a singleton cycle-end role. Reviewer-less cycle-end work belongs in `.harness/loom/agents/harness-finalizer.md`, not in `## Registered pairs`.
- `node .harness/loom/sync.ts --provider <list>` remains an explicit user-run command after convergence. Auto-setup must not derive `.claude/`, `.codex/`, or `.gemini/` automatically.
- Auto-setup may reseed `.harness/cycle/` only for fresh setup or migration-mode foundation refresh. Existing-target `--setup` must not reseed cycle state or fabricate pair task/review history.

### 3. Snapshot and provenance contract

Before any destructive refresh on a target with existing harness runtime state (`.harness/loom/` or `.harness/cycle/`), create a machine snapshot under:

```text
.harness/_snapshots/auto-setup/<YYYYMMDDTHHMMSSZ>/
```

The snapshot preserves pre-refresh `.harness/loom/` and `.harness/cycle/` when present, plus deterministic `manifest.json` provenance. Read `references/snapshot-provenance.md` before changing snapshot id allocation, copied namespaces, manifest keys, active-cycle fields, or failure behavior.

Do not snapshot derived platform trees by default; they are deployment outputs and are refreshed only by explicit sync.

If snapshot creation fails, stop before running install or deleting anything. Existing-target `--setup` does not refresh the foundation and therefore does not create a snapshot.

### 4. Active cycle policy

Inspect `.harness/cycle/` before refresh. Apply the classifications in the order below so the pristine scaffold is not treated as active only because its initial planner `Next` block is non-empty.

Classify the cycle as:

- `absent` — no `.harness/cycle/`
- `pristine` — fresh scaffold with `Goal (from <none yet>)`, `Phase: planner`, `loop: false`, no emitted EPICs, and the initial planner `Next`
- `active` — `loop: true`, a non-empty runnable `Next` outside the pristine scaffold, any live EPIC whose `current` is not `done` or `superseded`, or any ambiguous state that may still need runtime dispatch
- `halted` — `loop: false`, no runnable `Next`, and every EPIC is terminal or no EPIC exists
- `unknown` — state cannot be parsed safely

For `active` or `unknown`, silent deletion is forbidden. In `--migration`, the default policy is:

1. emit a warning that the current cycle will be discarded after snapshot
2. include `.harness/cycle/` in the snapshot
3. run foundation refresh so `.harness/cycle/` is reseeded fresh
4. report that old cycle state is preserved only in the snapshot, not restored

This policy forbids silent destruction, not destruction itself. Existing-target `--setup` reports the cycle classification but leaves cycle files untouched.

### 5. Mode split

`harness-auto-setup` has two execution modes:

- `--setup` — bootstrap a fresh target, or expand an existing harness with project-shaped pair/finalizer authoring. Existing-target `--setup` must not snapshot, reseed, restore, reconstruct, migrate, or otherwise refresh existing foundation files. It may add new pair files, register new pairs, and update the singleton finalizer after LLM project analysis and any necessary user clarification.
- `--migration` — upgrade an existing harness foundation with the smallest reasonable blast radius. This mode optimizes for snapshot-first contract refresh and customization preservation. It refreshes contract-owned surfaces, preserves compatible user-authored H2 sections, restores non-pair custom loom entries, and emits an explicit migration plan for pair/finalizer overlay review.

Fresh targets may use only `--setup`. `--migration` requires existing `.harness/loom/` or `.harness/cycle/` state.

### 6. Existing target flow

When `.harness/loom/` exists, or `.harness/cycle/` exists without `.harness/loom/`:

In `--setup`:

1. Run the script to inspect `.harness/loom/registry.md`, `harness-finalizer.md`, `.harness/cycle/`, and target repo signals.
2. Do not snapshot, run install, reseed `.harness/cycle/`, restore snapshot files, reconstruct pairs, migrate finalizer text, or edit provider trees.
3. Continue after the script: read README/pointer docs, source trees, scripts, tests, workflows, architecture notes, and any explicit user request.
4. Ask the user at most three concise questions only when the project purpose, desired workflow boundary, or review axis is genuinely ambiguous; otherwise proceed from repo evidence.
5. Author the actual additional pair/finalizer configuration rather than stopping at recommendations. Registered pairs are treated as existing coverage, not as rewrite targets.
6. Report the exact sync command as a post-authoring next step; do not run sync automatically.

In `--migration`:

1. Snapshot `.harness/loom/` when present and `.harness/cycle/` when present per the snapshot contract.
2. If the snapshot contains `loom/registry.md`, parse it for registered pair order, producer slug, reviewer slug(s), and skill slug.
3. Inspect pair agent/skill bodies when present and target repo evidence to infer current intent.
4. Inspect snapshot `harness-finalizer.md` when present and decide whether it is missing, default no-op, or customized.
5. Run `/harness-init` or its installer implementation to reseed the foundation.
6. Restore non-pair custom `loom/skills/*` and `loom/agents/*.md` entries that are not foundation or registered-pair artifacts.
7. Preserve user-authored pair/finalizer bodies where possible while refreshing contract-owned surfaces such as runtime frontmatter, required `skills:`, and Output Format blocks.
8. Preserve topology and order from the old registry when valid.
9. Leave split/reorder decisions as recommendations unless the old registry already proves the intended topology.
10. End with the exact sync command the user should run from the target root.

Old pair and finalizer files are evidence only. Do not blind-copy them over the refreshed foundation.

If `.harness/cycle/` existed without `.harness/loom/`, there is no pair/finalizer source to converge:

- in `--setup`, leave the cycle untouched and recommend `--migration` for foundation repair or refresh
- in `--migration`, snapshot the cycle, reseed the foundation, and report that no live loom source was available for pair/finalizer migration

### 7. Fresh target flow

When both `.harness/loom/` and `.harness/cycle/` are absent:

1. Run the auto-setup script; on fresh `--setup` targets it invokes the foundation installer and collects script-level repository signals.
2. After the script completes, inspect the target repo with LLM judgment before creating project-specific harness work: read README/pointer docs, source trees, scripts, tests, workflows, and any existing project architecture notes.
3. Ask the user at most three concise questions only when project intent or desired harness workflow cannot be inferred safely from repo evidence.
4. In `--setup`, author the initial pair roster from that project analysis and user clarification. Docs/tests/CI presence alone is not enough to author a stock pair.
5. In `--setup`, update the singleton finalizer only when project analysis or user clarification identifies a concrete cycle-end duty; otherwise keep the safe no-op.
6. `--migration` is invalid here because there is no existing harness state to preserve.
7. End with the exact sync command the user should run from the target root after setup authoring is complete.

Do not create evidence-free stock pairs just to fill the registry. If repo evidence is insufficient, ask focused questions before authoring; leave the roster empty only when the project is effectively blank or the user declines to choose a workflow boundary.

### 8. Pair convergence rules

- Treat snapshot `registry.md` as a strong topology/order hint, not as immutable truth.
- Registered producer, reviewer, and skill slugs should be preserved when they remain coherent with the target repo and current namespace rules.
- Each pair must have at least one reviewer.
- Missing or unparsable pair files do not block migration when registry intent plus repo evidence is enough to migrate the pair; record the gap in `manifest.json` and the user summary.
- If a pair has clearly become two jobs, recommend a split instead of silently changing the roster.
- If a pair belongs in a different global roster position, recommend a reorder instead of silently moving it unless the user supplied an explicit roster instruction.
- In `--setup`, author concrete project-shaped pairs after analysis or user clarification. Do not stop after listing recommendations.
- In existing-target `--setup`, do not rewrite or reconstruct registered pair files unless the user explicitly asks for an improvement pass. Registered pairs are current coverage; new setup work is additive.
- In `--migration`, use `/harness-pair-dev --add ... --from snapshot:<ts>/<pair>` (or `archive:` when appropriate) as the source-resolution path for preserved pair intent. Do not pass arbitrary file paths through `--from`; record the resulting source/target overlay plan in `convergence.migrationPlan`.
- In `--migration`, preserve compatible custom H2 sections instead of silently dropping renamed sections such as `## Approach` or extra sections such as `## Rollout Plan`.
- In fresh `--setup`, do not author `harness-document`, `harness-verification`, or generic implementation pairs solely from docs/tests/CI/code-directory presence.
- Migration re-registration must preserve duplicate-free `## Registered pairs` order and use the registry helper rather than hand-editing the section.

### 9. Finalizer convergence rules

- The finalizer is customized when its body declares concrete cycle-end duties beyond the default no-op summary, writes out-of-cycle artifacts, performs coverage/release/docs/audit work, or changes the default Task section materially.
- In existing-target `--setup`, do not rewrite a customized `harness-finalizer.md` unless the user explicitly asks to change the cycle-end role.
- In fresh `--setup`, keep the safe no-op until cycle-end work is selected through project analysis or user clarification.
- In `--migration`, preserve the customized finalizer's intro, principles, task, and compatible custom H2 sections where possible while refreshing contract-owned surfaces such as required skills, Output Format, and Structural Issue block. Use `references/finalizer-overlay.md` for singleton finalizer overlay rules.
- A missing or no-op finalizer should trigger repo-grounded recommendations, not script-authored cycle-end work.
- Do not turn finalizer work into a pair, and do not add a finalizer line to `## Registered pairs`.

### 10. Sync Next Action

Auto-setup must stop before platform derivation. The final user-facing summary must include a target-local command such as:

```bash
node .harness/loom/sync.ts --provider claude,codex,gemini
```

Use any subset the user requested or that the workflow recommends, but never execute sync automatically.

### 11. Execution

Run the script-owned execution path:

```bash
node plugins/harness-loom/skills/harness-auto-setup/scripts/auto-setup.ts [--setup | --migration] [--provider claude,codex,gemini]
```

The script installs the foundation on fresh `--setup` targets. On existing `--setup` targets, it inspects the live harness and emits setup summary data without refreshing `.harness/`. Setup-mode JSON includes `convergence.setupAuthoring` so callers can tell that the script phase is not the end of the user-facing workflow. On `--migration`, it snapshots existing `.harness/loom/` / `.harness/cycle/`, classifies active-cycle risk, calls the `harness-init` installer for foundation refresh, restores non-pair custom loom entries, and applies protected overlay for pairs/finalizer. The script is only the mechanical phase of setup: the assistant must continue with LLM project analysis, ask focused questions when needed, then author actual pair/finalizer files under `.harness/loom/` before finishing. `--provider` only shapes the printed sync command; it never runs sync.

## Evaluation Criteria

- Existing targets are snapshotted before migration-mode destructive refresh.
- Existing-target `--setup` leaves foundation and already-registered pair files untouched unless the user requests an improvement pass; additive pair/finalizer authoring is allowed.
- Active or unparsable `.harness/cycle/` state is warned about and copied before discard/reseed.
- Snapshot data is machine provenance with deterministic path and manifest shape, not a human-authored setup SSOT.
- `/harness-init` remains foundation-only.
- Pair convergence distinguishes setup-mode project-shaped authoring from migration-mode minimal-delta overlay.
- `registry.md` remains the sole pair roster source of truth and contains only executable producer-reviewer pairs.
- Customized finalizer intent is preserved in the singleton finalizer body, not converted into a pair.
- Fresh `--setup` targets do not receive docs/tests-driven stock pairs; authored pairs come from assistant-side LLM project analysis and cite project-specific evidence when available.
- Non-pair custom `loom/skills/*` and `loom/agents/*.md` entries survive migration refreshes.
- Derived platform trees are not modified; the result includes an explicit `node .harness/loom/sync.ts --provider <list>` next action.

## Taboos

- Create a persistent human-edited `setup.md` or equivalent setup SSOT.
- Stop setup after recommendation text when enough repo/user evidence exists to author the harness.
- Restore stale pair or finalizer files by blind copy after foundation refresh.
- Refresh or repair existing `.harness/` foundation state in `--setup`; use `--migration` for that.
- Use `--migration` on a fresh target with no harness state to preserve.
- Delete an active or unparsable cycle silently.
- Treat snapshot content as canonical after convergence.
- Register the planner or finalizer as a pair.
- Author reviewer-less pair stages.
- Move pair/finalizer authoring into `/harness-init`.
- Run `sync.ts` automatically or write `.claude/`, `.codex/`, or `.gemini/` directly.

## References

- `../harness-init/SKILL.md` — foundation installer boundary
- `../harness-pair-dev/SKILL.md` — pair authoring and registry mutation boundary
- `references/snapshot-provenance.md` — snapshot directory, manifest shape, and failure contract
- `references/finalizer-overlay.md` — singleton finalizer migration overlay rules
- `../harness-init/references/runtime/registry.md` — target-side pair roster contract
- `../harness-init/references/runtime/harness-finalizer.template.md` — singleton finalizer skeleton and Output Format
