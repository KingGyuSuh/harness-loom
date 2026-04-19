---
name: harness-init
description: "Use when `/harness-init [<target>] [--force]` is invoked to install the canonical `.claude/` harness foundation into a target project. Scaffolds `.harness/` runtime + `.claude/skills/{harness-orchestrate, harness-planning, harness-context}/` + `.claude/agents/harness-planner.md` + `.claude/settings.json` Stop hook."
argument-hint: "[target-path] [--force]"
user-invocable: true
---

# harness-init

## Design Thinking

`harness-init` is a **canonical-only foundation installer**. Shared artifacts (`harness-orchestrate`, `harness-planning`, `harness-context`, the `harness-planner` role, `.claude/` Stop hook wiring, and the `.harness/` scaffold) are defined entirely by **templates plus scripts**. After reading this skill, Claude makes a single Bash call to the install script and only interprets and reports the result. The shared law covering pair/cycle rhythm, authority, and the reviewed-work contract is injected into every subagent through the single `harness-context` skill so each dispatch can immediately understand its role and contract. **`install.ts` touches only `.claude/`**; `.codex/` and `.gemini/` are derived only when the user explicitly requests `/harness-sync`. Project-specific variation exists only at the **pair** layer, and `harness-pair-dev` owns that responsibility.

## Methodology

### 1. Arguments

`/harness-init [<target>] [--force]`

- `<target>` — target project root path. If omitted, the current working directory (`process.cwd()`) is the target. Relative and absolute paths are both allowed; the script normalizes to an absolute path.
- `--force` — proceed even if `.harness/` already exists. In that case the entire existing directory is deleted before reinitialization. There is no archive path here; `--force` means an explicit delete-and-reseed.

There is no `--provider` flag. Install creates only `.claude/`. Multi-platform users opt in later with `/harness-sync --provider codex,gemini`.

### 2. Execution

`$ARGUMENTS` is the full string passed after `/harness-init`. For example, if the user runs `/harness-init /tmp/target --force`, then `$ARGUMENTS` is `/tmp/target --force`. If omitted, it is an empty string and the install script uses the current working directory as the default target.

Claude must run **exactly one Bash call** immediately after reading this skill. The skill directory must be referenced through `${CLAUDE_SKILL_DIR}` so the path remains stable no matter where the plugin is installed:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/install.ts $ARGUMENTS
```

The script prints a JSON summary to stdout: `{target, harnessDir, stateMd, eventsMd, hook, claudeSettings, scaffolded, verification, nextStep}`. Claude parses that JSON, reports it to the user in one readable paragraph, and includes the `nextStep` message that points to `/harness-sync` and `/harness-pair-dev --add`.

The scope of this skill stops at the **invocation contract**. The file-copy routines inside `install.ts`, the hook JSON merge algorithm, and template placeholder replacement logic are canonical in the script source.

### 3. Post-install verification (automatic, script-owned)

Verification is performed by `install.ts` as **deterministic script logic**. Claude does not improvise with human-style `ls` reasoning. The script's `verification` block contains:

- `ok: true|false` — whether every check passed.
- `checks: { "<label>": boolean, ... }` — per-check results. Checks cover `.harness/{state.md, events.md, hook.sh, epics/}`, `hook.sh executable`, canonical `.claude/{skills/harness-orchestrate, skills/harness-planning, skills/harness-context, agents/harness-planner.md, settings.json}`, and `no placeholder residue` (zero remaining `{{FOO}}`). `.codex/` and `.gemini/` are outside the scope of install and are not verified here.
- `failures: string[]` — summarized failed checks.
- `placeholderResidue: string[]` — files where template replacement did not finish.

If `verification.ok === false`, the script exits with a non-zero code. Claude parses the JSON, reports the failing items to the user, and stops. Do not re-check with `ls`; the script result is the only source of truth. On success, return one summary paragraph plus the installed path list.

### 4. Re-run semantics

- **Default** — if `<target>/.harness/` already exists, exit non-destructively and print a conflict message to stderr. Include guidance that asks whether the user wants `--force`.
- **`--force`** — delete the existing `<target>/.harness/` **entirely** and scaffold it again. All nested artifacts such as `state.md`, `events.md`, `epics/`, and `_archive/` are lost. `--force` explicitly means "discard the current cycle and restart from scratch". If the user wants to keep the existing cycle and replace only the goal, use `init.ts --goal-source <markdown>` instead; that performs an in-place reset and moves only state/events/epics into the archive path.
- Template-based files (`harness-orchestrate/SKILL.md`, `harness-planning/SKILL.md`, `harness-planner.md`) are overwritten idempotently. If the user edited those files manually, `--force` provides no recovery path, so the edited version must be preserved in git or another backup.

### 5. Sync relationship

`harness-init` installs **only the canonical tree**. Deriving other platforms belongs to `/harness-sync`:

```
/harness-sync --provider codex,gemini   # first multi-platform opt-in
/harness-sync                            # later: auto-derive only platforms already on disk
```

`harness-pair-dev` owns pair authoring, registration, and provider sync, but its automatic sync follows detection results only. If the user has never added codex/gemini, pair-dev edits only the canonical tree and stops there. The `harness-orchestrate` and `harness-planning` skill bodies created by `harness-init` contain empty seed sections for "Registered pairs" and "Available departments", and `harness-pair-dev --add` appends into those sections through `register-pair.ts`.

### 6. Init vs sync boundary

- `harness-init` is **one-time setup, Claude-only**. Run it once per target, and rerun only with `--force`.
- `/harness-sync` is **ongoing platform derivation**. It transforms canonical `.claude/` into `.codex/` / `.gemini/`. `harness-pair-dev` internally calls the same `sync.ts`.
- `/harness-init` must never call `sync.ts`. Multi-platform support is explicit user opt-in.

## Evaluation Criteria

- After execution, all four paths under `<target>/.harness/{state.md, events.md, hook.sh, epics/}` exist.
- The three canonical skills `<target>/.claude/skills/harness-orchestrate/SKILL.md`, `<target>/.claude/skills/harness-planning/SKILL.md`, and `<target>/.claude/skills/harness-context/SKILL.md` are written from fully replaced templates with no remaining `{{...}}`.
- `<target>/.claude/agents/harness-planner.md` is installed and its frontmatter `skills` declares both `harness-planning` and `harness-context`.
- `<target>/.claude/settings.json` wires `hooks.Stop` to `bash .harness/hook.sh claude`, and existing settings entries are merged and preserved.
- `<target>/.codex/` and `<target>/.gemini/` do **not** exist immediately after install; those directories are created only by explicit `/harness-sync`.
- On rerun, no `--force` means non-destructive exit, and `--force` means full `.harness/` deletion followed by deterministic reseed. Two consecutive `--force` runs produce the same result.
- The `state.md` seed follows the new schema: three header lines (Goal / Phase / loop), a `## Next` block (To / EPIC / Task path / Intent / Prior tasks / Prior reviews), and a headed `## EPIC summaries` list rather than a pipe table. Each EPIC is a `### EP-N--slug` heading with four fields: outcome, roster, current, note.
- The `events.md` seed is exactly one line: `<ISO-ts> T0 orchestrator install — harness seeded` (no absolute path; avoids leaking the developer's machine layout).
- The bodies of `harness-orchestrate`, `harness-planning`, `harness-context`, and `harness-planner` are visibly derived from the `references/runtime/` templates on disk rather than improvised in the model.
- The output JSON `nextStep` field points to both `/harness-sync` and `/harness-pair-dev --add`.

## Taboos

- Force installation into a target that already has `.harness/` without `--force`; the user could lose work.
- Let install create `.codex/` or `.gemini/`; multi-platform support belongs to explicit `/harness-sync --provider ...`.
- Modify anything outside the target's `.harness/` and `.claude/`; `harness-init` is scoped only to the canonical foundation.
- Have the model author `harness-orchestrate`, `harness-planning`, `harness-context`, or `harness-planner` bodies from scratch; that breaks the shared-template rule.
- Leave placeholders such as `{{PAIR_SLUG}}` in installed outputs; that means template replacement failed.
- Mix `harness-pair-dev` add/improve/split logic or `harness-sync` derivation into a `/harness-init` call; that violates scope and responsibility boundaries.
- Re-explain the internal logic of `install.ts`, `init.ts`, or `hook.sh` in this SKILL.md; that crosses the script/prompt boundary.

## References

- `skills/harness-pair-dev/SKILL.md` — pair add/improve/split entry point for project-specific pair development after installation.
- `skills/harness-sync/SKILL.md` — canonical `.claude/` -> `.codex/` / `.gemini/` derive entry point for explicit multi-platform opt-in.
- `${CLAUDE_SKILL_DIR}/scripts/install.ts` — canonical invocation target.
- `skills/harness-init/references/runtime/` — canonical deployment templates for orchestrate/planning/context/planner/state/events (`*.template.md`).
