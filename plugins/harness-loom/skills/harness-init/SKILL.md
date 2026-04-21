---
name: harness-init
description: "Use when `/harness-init [<target>] [--force]` is invoked to install the target-side runtime foundation. Scaffolds `.harness/loom/` canonical staging plus `.harness/cycle/` runtime state, copies target-local `hook.sh` and `sync.ts`, and stops there. Platform trees are derived later by `node .harness/loom/sync.ts --provider <list>`."
argument-hint: "[target-path] [--force]"
user-invocable: true
---

# harness-init

## Design Thinking

`harness-init` is the **factory-side installer** for the target runtime. Its job is to seed the target project's `.harness/` tree in the correct shape and then stop. After install, the target project's LLM should read only target-local artifacts under `.harness/loom/`, `.harness/cycle/`, and later derived platform trees.

That boundary is strict:

- install seeds the runtime foundation
- `/harness-pair-dev` authors project-specific pairs later
- `node .harness/loom/sync.ts --provider <list>` derives platform trees later

## Methodology

### 1. Arguments

`/harness-init [<target>] [--force]`

- `<target>` — target project root path. If omitted, `process.cwd()` is the target.
- `--force` — replace both `.harness/loom/` and `.harness/cycle/`.

Without `--force`, install refreshes `.harness/loom/` and preserves an existing `.harness/cycle/` audit trail.

### 2. Execution

Run the installer script once:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/install.ts $ARGUMENTS
```

Then summarize the script result for the user. Trust the script's own output rather than improvising extra shell inspection.

### 3. What install guarantees

Install seeds two namespaces:

- `.harness/loom/` — canonical staging for target-side skills, agents, `hook.sh`, and `sync.ts`
- `.harness/cycle/` — runtime state for `state.md`, `events.md`, and `epics/`

On a fresh install, the target receives at least:

- `.harness/loom/skills/{harness-orchestrate,harness-planning,harness-context}/`
- `.harness/loom/agents/{harness-planner,harness-finalizer}.md` — `harness-finalizer.md` is a generic skeleton; the project fills in the concrete cycle-end work (documentation refresh, goal-coverage inspection, release prep, etc.) before running the first real cycle
- `.harness/loom/{hook.sh,sync.ts}`
- `.harness/cycle/{state.md,events.md,epics/}`

Install does **not** create `.claude/`, `.codex/`, or `.gemini/`. Those are derived later from `.harness/loom/`.

### 4. Re-run behavior

- Default rerun: refresh `.harness/loom/`, preserve `.harness/cycle/`
- `--force`: refresh both `.harness/loom/` and `.harness/cycle/`

If the script reports that pair-authored content inside `.harness/loom/` was removed during a default refresh, surface that clearly to the user so they can re-author those pairs afterward.

### 5. Verification

Verification is script-owned. Read the install summary and report:

- whether install succeeded
- whether any placeholder residue or path failures remain
- whether pair-authored loom content was wiped during refresh
- what the next step should be

If verification fails, report the failure and stop.

### 6. Post-install boundary

After install, the next actions are:

1. Derive one or more platform trees from the target-local runtime:

```bash
node .harness/loom/sync.ts --provider claude
node .harness/loom/sync.ts --provider claude,codex,gemini
```

2. Author project-specific pairs with `/harness-pair-dev --add ...`

`harness-init` itself should not run sync, author pairs, or mutate derived platform trees.

## Evaluation Criteria

- Install writes `.harness/loom/` and `.harness/cycle/` in the target project.
- Install copies target-local `hook.sh` and `sync.ts` into `.harness/loom/`.
- Install does not create `.claude/`, `.codex/`, or `.gemini/`.
- Default rerun preserves `.harness/cycle/` and refreshes `.harness/loom/`.
- `--force` refreshes both `.harness/loom/` and `.harness/cycle/`.
- Verification is described in terms of the install summary, not ad hoc shell inspection.
- The post-install workflow points to target-local `node .harness/loom/sync.ts --provider <list>`.
- The skill consistently treats `.template.md` outputs as target-side runtime artifacts, not as factory-side working files.

## Taboos

- Describe install as making `.claude/` the source-of-truth runtime. Canonical runtime staging is `.harness/loom/`.
- Tell the target runtime to read factory paths such as `plugins/harness-loom/...`.
- Have install create or modify `.claude/`, `.codex/`, or `.gemini/`.
- Mix pair authoring or platform derivation into `/harness-init`.
- Turn this skill into a line-by-line duplicate of `install.ts`.

## References

- `${CLAUDE_SKILL_DIR}/scripts/install.ts` — canonical installer implementation
- `references/runtime/` — target runtime templates seeded into `.harness/loom/`
- `../harness-pair-dev/SKILL.md` — pair authoring after install
