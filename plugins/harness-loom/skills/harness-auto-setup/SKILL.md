---
name: harness-auto-setup
description: "Use when `/harness-auto-setup [<target>]` is invoked to safely install, refresh, or converge a target harness by snapshotting live `.harness/` state, preserving pair/finalizer intent as evidence, reseeding the foundation, and handing off explicit platform sync."
argument-hint: "[target-path] [--provider claude,codex,gemini]"
user-invocable: true
---

# harness-auto-setup

## Design Thinking

`harness-auto-setup` is the factory-side convergence workflow for a target harness. It exists because rerunning `/harness-init` is intentionally simple and destructive: it reseeds the foundation, but it does not preserve project-specific pairs, finalizer work, or active cycle state.

This workflow does not introduce a second human-authored setup source of truth. The durable truth remains the target's live harness files:

- `.harness/loom/registry.md` — pair roster, order, and reviewer topology
- `.harness/loom/skills/<pair>/` — pair skill bodies
- `.harness/loom/agents/<producer-or-reviewer>.md` — pair agents
- `.harness/loom/agents/harness-finalizer.md` — singleton cycle-end role

Snapshots are machine provenance and convergence input, not restore sources. Old files may explain intent, but current output must be regenerated against the current templates, authoring rubric, and target repo evidence.

## Methodology

### 1. Arguments

`/harness-auto-setup [<target>]`

- `<target>` — target project root path. If omitted, `process.cwd()` is the target.

### 2. Authority boundaries

- `/harness-init` remains the foundation installer. Auto-setup may invoke it, but must not move pair/finalizer authoring into `harness-init`.
- `/harness-pair-dev` remains the pair-authoring layer. Auto-setup may use existing pair files as evidence, but must author current pair outputs through the current templates, authoring rubric, and registry contract.
- `/harness-pair-dev --add ... --from <existing-pair-slug>` is only for evidence from a pair already registered in the current target registry. Snapshot paths, agent/skill paths, and derived platform paths remain auto-setup convergence inputs, not pair-dev inputs.
- `.harness/loom/registry.md` remains the pair roster SSOT. The planner and finalizer are never registry entries.
- `harness-finalizer` remains a singleton cycle-end role. Reviewer-less cycle-end work belongs in `.harness/loom/agents/harness-finalizer.md`, not in `## Registered pairs`.
- `node .harness/loom/sync.ts --provider <list>` remains an explicit user handoff after convergence. Auto-setup must not derive `.claude/`, `.codex/`, or `.gemini/` automatically.
- Auto-setup may reseed `.harness/cycle/` only as setup-time discard/reseed through the foundation install path. It must not fabricate pair task or review history.

### 3. Snapshot and provenance contract

Before any destructive refresh on a target with existing harness runtime state (`.harness/loom/` or `.harness/cycle/`), create a machine snapshot under:

```text
.harness/_snapshots/auto-setup/<YYYYMMDDTHHMMSSZ>/
```

Use the UTC run-start timestamp for the id; if a directory already exists for the same second, append `-NN` with a zero-padded monotonic counter. The snapshot directory contains:

- `manifest.json` — deterministic JSON summary with stable key order
- `loom/` — copy of pre-refresh `.harness/loom/` when present
- `cycle/` — copy of pre-refresh `.harness/cycle/` when present

`manifest.json` must include at least:

- `schemaVersion`
- `tool`
- `targetPath`
- `createdAt`
- `snapshotPath`
- `copiedNamespaces`
- `activeCycle`
- `registrySummary`
- `finalizerSummary`
- `nextAction`

Keep `copiedNamespaces` sorted and use target-relative namespace names such as `.harness/loom` and `.harness/cycle`. `activeCycle` must record the classification plus the parse reason. Do not snapshot derived platform trees by default; they are deployment outputs and are refreshed only by explicit sync.

If snapshot creation fails, stop before running install or deleting anything.

### 4. Active cycle policy

Inspect `.harness/cycle/` before refresh. Apply the classifications in the order below so the pristine scaffold is not treated as active only because its initial planner `Next` block is non-empty.

Classify the cycle as:

- `absent` — no `.harness/cycle/`
- `pristine` — fresh scaffold with `Goal (from <none yet>)`, `Phase: planner`, `loop: false`, no emitted EPICs, and the initial planner `Next`
- `active` — `loop: true`, a non-empty runnable `Next` outside the pristine scaffold, any live EPIC whose `current` is not `done` or `superseded`, or any ambiguous state that may still need runtime dispatch
- `halted` — `loop: false`, no runnable `Next`, and every EPIC is terminal or no EPIC exists
- `unknown` — state cannot be parsed safely

For `active` or `unknown`, silent deletion is forbidden. The default policy is:

1. emit a warning that the current cycle will be discarded after snapshot
2. include `.harness/cycle/` in the snapshot
3. run foundation refresh so `.harness/cycle/` is reseeded fresh
4. report that old cycle state is preserved only in the snapshot, not restored

This policy forbids silent destruction, not destruction itself.

### 5. Existing target flow

When `.harness/loom/` exists, or `.harness/cycle/` exists without `.harness/loom/`:

1. Snapshot `.harness/loom/` when present and `.harness/cycle/` when present per the snapshot contract.
2. If the snapshot contains `loom/registry.md`, parse it for registered pair order, producer slug, reviewer slug(s), and skill slug.
3. Inspect pair agent/skill bodies when present and target repo evidence to infer current intent.
4. Inspect snapshot `harness-finalizer.md` when present and decide whether it is missing, default no-op, or customized.
5. Run `/harness-init` or its installer implementation to reseed the foundation.
6. Reconstruct each known pair against the current pair templates and authoring rubric. Preserve topology and order from the old registry when valid.
7. Preserve customized finalizer intent by rewriting it on the current finalizer skeleton and Output Format contract.
8. Leave split/reorder decisions as recommendations unless the old registry already proves the intended topology.
9. End with the exact sync handoff command the user should run from the target root.

Old pair and finalizer files are evidence only. Do not blind-copy them over the refreshed foundation.

If `.harness/cycle/` existed without `.harness/loom/`, there is no pair/finalizer source to converge; snapshot the cycle, reseed the foundation, then follow the fresh target repo-inspection rules.

### 6. Fresh target flow

When both `.harness/loom/` and `.harness/cycle/` are absent:

1. Run `/harness-init` or its installer implementation to seed the foundation.
2. Inspect the target repo before proposing project-specific harness work.
3. Recommend or author an initial pair roster grounded in real repo surfaces.
4. Recommend or author a concrete finalizer body when the repo has obvious cycle-end duties.
5. Leave the finalizer as the safe no-op only when no concrete cycle-end duty is justified yet.
6. End with the exact sync handoff command the user should run from the target root.

Do not create generic stock pairs just to fill the registry. If repo evidence is insufficient, emit recommended `/harness-pair-dev --add` commands and leave the roster empty.

### 7. Pair convergence rules

- Treat snapshot `registry.md` as a strong topology/order hint, not as immutable truth.
- Registered producer, reviewer, and skill slugs should be preserved when they remain coherent with the target repo and current namespace rules.
- Each pair must have at least one reviewer.
- Missing or unparsable pair files do not block the whole workflow when registry intent plus repo evidence is enough to reconstruct the pair; record the gap in `manifest.json` and the user summary.
- If a pair has clearly become two jobs, recommend a split instead of silently changing the roster.
- If a pair belongs in a different global roster position, recommend a reorder instead of silently moving it unless the user supplied an explicit roster instruction.
- Use `/harness-pair-dev --add ... --from <existing-pair-slug>` only after the source pair exists in the refreshed current registry. Use snapshot pair files directly as auto-setup evidence; do not pass snapshot or file paths through `--from`.
- Re-registration must preserve duplicate-free `## Registered pairs` order and use the registry helper rather than hand-editing the section.

### 8. Finalizer convergence rules

- The finalizer is customized when its body declares concrete cycle-end duties beyond the default no-op summary, writes out-of-cycle artifacts, performs coverage/release/docs/audit work, or changes the default Task section materially.
- A customized finalizer's intent should be preserved, but its body must be rewritten against the current `harness-finalizer` skeleton, principles, Structural Issue shape, and Output Format.
- A missing or no-op finalizer should trigger repo-grounded recommendations for concrete cycle-end work. Author it only when the target repo evidence makes the duty clear.
- Do not turn finalizer work into a pair, and do not add a finalizer line to `## Registered pairs`.

### 9. Sync handoff

Auto-setup must stop before platform derivation. The final user-facing summary must include a target-local command such as:

```bash
node .harness/loom/sync.ts --provider claude,codex,gemini
```

Use any subset the user requested or that the workflow recommends, but never execute sync automatically.

### 10. Execution

Run the script-owned execution path:

```bash
node plugins/harness-loom/skills/harness-auto-setup/scripts/auto-setup.ts [<target>] [--provider claude,codex,gemini]
```

The script snapshots existing `.harness/loom/` / `.harness/cycle/`, classifies active-cycle risk, calls the `harness-init` installer for foundation refresh, reconstructs valid registered pairs and customized finalizer intent on current templates, and returns JSON. `--provider` only shapes the printed sync handoff; it never runs sync.

## Evaluation Criteria

- Existing targets are snapshotted before any destructive refresh.
- Active or unparsable `.harness/cycle/` state is warned about and copied before discard/reseed.
- Snapshot data is machine provenance with deterministic path and manifest shape, not a human-authored setup SSOT.
- `/harness-init` remains foundation-only.
- Pair convergence uses old files only as evidence and regenerates current pair outputs against current templates, rubric, and repo evidence.
- `registry.md` remains the sole pair roster source of truth and contains only executable producer-reviewer pairs.
- Customized finalizer intent is preserved in the singleton finalizer body, not converted into a pair.
- Fresh targets receive repo-grounded pair/finalizer recommendations or authored outputs, not stock generic harness content.
- Derived platform trees are not modified; the result ends with an explicit `node .harness/loom/sync.ts --provider <list>` handoff.

## Taboos

- Create a persistent human-edited `setup.md` or equivalent setup SSOT.
- Restore stale pair or finalizer files by blind copy after foundation refresh.
- Delete an active or unparsable cycle silently.
- Treat snapshot content as canonical after convergence.
- Register the planner or finalizer as a pair.
- Author reviewer-less pair stages.
- Move pair/finalizer authoring into `/harness-init`.
- Run `sync.ts` automatically or write `.claude/`, `.codex/`, or `.gemini/` directly.

## References

- `../harness-init/SKILL.md` — foundation installer boundary
- `../harness-pair-dev/SKILL.md` — pair authoring and registry mutation boundary
- `../harness-init/references/runtime/registry.md` — target-side pair roster contract
- `../harness-init/references/runtime/harness-finalizer.template.md` — singleton finalizer skeleton and Output Format
