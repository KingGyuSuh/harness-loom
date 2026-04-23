---
name: harness-auto-setup
description: "Use when `/harness-auto-setup` is invoked to safely bootstrap, improve, or migrate the current working directory's harness by snapshotting live `.harness/` state, reseeding the foundation, and handing off explicit platform sync."
argument-hint: "[--setup | --migration] [--provider claude,codex,gemini]"
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

`/harness-auto-setup [--setup | --migration] [--provider <list>]`

The workflow always targets the current working directory. Run `/harness-auto-setup` from the project root. `--setup` is the default mode and covers fresh bootstrap plus intentional improvement. `--migration` is for minimal-delta upgrades of an existing harness. `--provider` only shapes the printed sync handoff; sync itself is never run here.

### 2. Authority boundaries

- `/harness-init` remains the foundation installer. Auto-setup may invoke it, but must not move pair/finalizer authoring into `harness-init`.
- `/harness-pair-dev` remains the pair-authoring layer. Auto-setup may use existing pair files as evidence, but must author current pair outputs through the current templates, authoring rubric, and registry contract.
- `/harness-pair-dev --add ... --from <source>` remains the pair-source resolver. Live registered pair slugs, `snapshot:<ts>/<pair>`, and `archive:<ts>/<pair>` are valid sources; arbitrary filesystem paths and provider-tree paths are not.
- `.harness/loom/registry.md` remains the pair roster SSOT. The planner and finalizer are never registry entries.
- `harness-finalizer` remains a singleton cycle-end role. Reviewer-less cycle-end work belongs in `.harness/loom/agents/harness-finalizer.md`, not in `## Registered pairs`.
- `node .harness/loom/sync.ts --provider <list>` remains an explicit user handoff after convergence. Auto-setup must not derive `.claude/`, `.codex/`, or `.gemini/` automatically.
- Auto-setup may reseed `.harness/cycle/` only as setup-time discard/reseed through the foundation install path. It must not fabricate pair task or review history.

### 3. Snapshot and provenance contract

Before any destructive refresh on a target with existing harness runtime state (`.harness/loom/` or `.harness/cycle/`), create a machine snapshot under:

```text
.harness/_snapshots/auto-setup/<YYYYMMDDTHHMMSSZ>/
```

The snapshot preserves pre-refresh `.harness/loom/` and `.harness/cycle/` when present, plus deterministic `manifest.json` provenance. Read `references/snapshot-provenance.md` before changing snapshot id allocation, copied namespaces, manifest keys, active-cycle fields, or failure behavior.

Do not snapshot derived platform trees by default; they are deployment outputs and are refreshed only by explicit sync.

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

### 5. Mode split

`harness-auto-setup` has two execution modes:

- `--setup` — bootstrap a fresh target or intentionally improve an existing harness. This mode optimizes for "one run leaves a usable harness." It may author starter pairs/finalizer intent from repo signals, and it may rewrite pair/finalizer bodies on current templates when that improves harness usability.
- `--migration` — upgrade an existing harness with the smallest reasonable blast radius. This mode optimizes for contract refresh and customization preservation. It updates contract-owned surfaces and reports manual-review ambiguity instead of aggressively rewriting user-authored guidance.

Fresh targets may use only `--setup`. `--migration` requires existing `.harness/loom/` or `.harness/cycle/` state.

### 6. Existing target flow

When `.harness/loom/` exists, or `.harness/cycle/` exists without `.harness/loom/`:

1. Snapshot `.harness/loom/` when present and `.harness/cycle/` when present per the snapshot contract.
2. If the snapshot contains `loom/registry.md`, parse it for registered pair order, producer slug, reviewer slug(s), and skill slug.
3. Inspect pair agent/skill bodies when present and target repo evidence to infer current intent.
4. Inspect snapshot `harness-finalizer.md` when present and decide whether it is missing, default no-op, or customized.
5. Run `/harness-init` or its installer implementation to reseed the foundation.
6. In `--setup`, reconstruct each known pair against the current pair templates and authoring rubric, or author fresh starter pairs if no pair roster exists.
7. In `--migration`, preserve user-authored pair/finalizer bodies where possible while refreshing contract-owned surfaces such as runtime frontmatter, required `skills:`, and Output Format blocks.
8. Preserve topology and order from the old registry when valid.
9. Leave split/reorder decisions as recommendations unless the old registry already proves the intended topology.
10. End with the exact sync handoff command the user should run from the target root.

Old pair and finalizer files are evidence only. Do not blind-copy them over the refreshed foundation.

If `.harness/cycle/` existed without `.harness/loom/`, there is no pair/finalizer source to converge. Snapshot the cycle, reseed the foundation, then:

- in `--setup`, follow the fresh target repo-inspection rules
- in `--migration`, preserve the cycle snapshot as evidence and report that no live loom source was available for pair/finalizer migration

### 7. Fresh target flow

When both `.harness/loom/` and `.harness/cycle/` are absent:

1. Run `/harness-init` or its installer implementation to seed the foundation.
2. Inspect the target repo before proposing project-specific harness work.
3. In `--setup`, author an initial pair roster grounded in real repo surfaces when evidence exists; recommend only when the repo is effectively empty.
4. In `--setup`, author a concrete finalizer body when the repo exposes a clear cycle-end duty; otherwise keep the safe no-op.
5. `--migration` is invalid here because there is no existing harness state to preserve.
6. End with the exact sync handoff command the user should run from the target root.

Do not create evidence-free stock pairs just to fill the registry. If repo evidence is insufficient, emit recommended `/harness-pair-dev --add` commands and leave the roster empty.

### 8. Pair convergence rules

- Treat snapshot `registry.md` as a strong topology/order hint, not as immutable truth.
- Registered producer, reviewer, and skill slugs should be preserved when they remain coherent with the target repo and current namespace rules.
- Each pair must have at least one reviewer.
- Missing or unparsable pair files do not block the whole workflow when registry intent plus repo evidence is enough to reconstruct or migrate the pair; record the gap in `manifest.json` and the user summary.
- If a pair has clearly become two jobs, recommend a split instead of silently changing the roster.
- If a pair belongs in a different global roster position, recommend a reorder instead of silently moving it unless the user supplied an explicit roster instruction.
- In `--migration`, use `/harness-pair-dev --add ... --from snapshot:<ts>/<pair>` (or `archive:` when appropriate) as the source-resolution path for preserved pair intent. Do not pass arbitrary file paths through `--from`.
- In `--setup`, treat pair reconstruction as author-first: a usable draft should be written in one run unless repo grounding is genuinely absent.
- Re-registration must preserve duplicate-free `## Registered pairs` order and use the registry helper rather than hand-editing the section.

### 9. Finalizer convergence rules

- The finalizer is customized when its body declares concrete cycle-end duties beyond the default no-op summary, writes out-of-cycle artifacts, performs coverage/release/docs/audit work, or changes the default Task section materially.
- In `--setup`, a customized finalizer may be rewritten more aggressively onto the current skeleton when that yields a more usable starter harness.
- In `--migration`, preserve the customized finalizer's intro, principles, and task where possible while refreshing contract-owned surfaces such as required skills, Output Format, and Structural Issue block.
- A missing or no-op finalizer should trigger repo-grounded recommendations or authored cycle-end work according to mode.
- Do not turn finalizer work into a pair, and do not add a finalizer line to `## Registered pairs`.

### 10. Sync handoff

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

The script snapshots existing `.harness/loom/` / `.harness/cycle/`, classifies active-cycle risk, calls the `harness-init` installer for foundation refresh, then either authors/reconstructs usable setup-mode outputs or applies migration-mode protected overlay. `--provider` only shapes the printed sync handoff; it never runs sync.

## Evaluation Criteria

- Existing targets are snapshotted before any destructive refresh.
- Active or unparsable `.harness/cycle/` state is warned about and copied before discard/reseed.
- Snapshot data is machine provenance with deterministic path and manifest shape, not a human-authored setup SSOT.
- `/harness-init` remains foundation-only.
- Pair convergence distinguishes setup-mode author-first behavior from migration-mode minimal-delta overlay.
- `registry.md` remains the sole pair roster source of truth and contains only executable producer-reviewer pairs.
- Customized finalizer intent is preserved in the singleton finalizer body, not converted into a pair.
- Fresh `--setup` targets receive repo-grounded authored outputs when signals exist, and only fall back to recommendations when repo grounding is too thin.
- Derived platform trees are not modified; the result ends with an explicit `node .harness/loom/sync.ts --provider <list>` handoff.

## Taboos

- Create a persistent human-edited `setup.md` or equivalent setup SSOT.
- Restore stale pair or finalizer files by blind copy after foundation refresh.
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
- `../harness-init/references/runtime/registry.md` — target-side pair roster contract
- `../harness-init/references/runtime/harness-finalizer.template.md` — singleton finalizer skeleton and Output Format
