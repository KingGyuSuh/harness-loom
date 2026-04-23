---
name: harness-pair-dev
description: "Use when `/harness-pair-dev` is invoked to author, revise, position, or remove a target project's producer-reviewer pair in `.harness/loom/`."
argument-hint: "--add <pair-slug> \"<purpose>\" [--from <existing-pair-slug>] [--reviewer <slug> ...] [--before <pair-slug> | --after <pair-slug>] | --improve <pair-slug> \"<purpose>\" [--before <pair-slug> | --after <pair-slug>] | --remove <pair-slug>"
user-invocable: true
---

# harness-pair-dev

## Design Thinking

`harness-pair-dev` is the target's pair-authoring layer. `harness-init` installs the shared runtime foundation; this skill adds the project-specific producer-reviewer pairs that the orchestrator can actually dispatch.

Write only in canonical staging under `<target>/.harness/loom/`. Pair files live under `.harness/loom/{agents,skills}/`. Pair order lives in `.harness/loom/registry.md` `## Registered pairs`, and `register-pair.ts` is the only writer for that section. Derived platform trees are refreshed later by the target-local `node .harness/loom/sync.ts --provider <list>` command.

Cycle task and review history under `.harness/cycle/` is runtime evidence, not pair-authoring state. Pair authoring may inspect active-cycle references for safety, but it must not edit or delete cycle history.

Use `scripts/pair-dev.ts` for deterministic command validation, registered-pair source preparation, and guarded removal. The helper returns preparation JSON for `--add` and `--improve`; it does not claim to author pair bodies unless files are actually written.

## Methodology

### 1. Operating rules

- Target is always the current working directory.
- Read the target codebase before authoring. The pair must fit the real repo, not a stock template.
- Normalize user-facing bare names into canonical `harness-*` slugs before invoking `scripts/pair-dev.ts`; the helper accepts canonical slugs only.
- Keep reviewer coverage explicit. Every pair is 1:1 or 1:M. Reviewer-less work belongs in a finalizer, not in `## Registered pairs`.
- Treat roster placement as execution order. Appending is correct only when the pair truly belongs at the end of the project-global workflow.
- Treat legacy `--split` and `--hint` as unsupported v0.3.0 surface. Split is a manual sequence of `--add`, `--improve`, and `--remove`; intent is passed as positional `<purpose>`.
- After authoring, rewriting, or removing a pair, tell the user to run `node .harness/loom/sync.ts --provider <list>` from the target root.

### 2. Command surface

```text
/harness-pair-dev --add <pair-slug> "<purpose>" [--from <existing-pair-slug>] [--reviewer <slug> ...] [--before <pair-slug> | --after <pair-slug>]
/harness-pair-dev --improve <pair-slug> "<purpose>" [--before <pair-slug> | --after <pair-slug>]
/harness-pair-dev --remove <pair-slug>
```

All slug-bearing arguments must be canonical before the deterministic helper or registry/files are touched. If the user says `document`, use `harness-document` for the pair slug, `--from`, reviewer slugs, and placement anchors.

### 3. `--add`

1. Parse args and stop immediately if `<purpose>` is missing or the target does not yet contain the installed runtime foundation.
2. If `--from <existing-pair-slug>` is present, resolve it only from the target's current `.harness/loom/registry.md` `## Registered pairs`.
3. Reject `--from` values that are snapshot paths, agent paths, skill paths, derived platform paths, missing registry entries, planner/finalizer slugs, or foundation skill names.
4. When `--from` is present, follow `references/authoring/from-overlay.md`: start from current templates, enforce current runtime shape, then overlay compatible source-pair domain material.
5. Let `<purpose>` override the source pair's old intent whenever the two conflict. `<purpose>` remains required even with `--from`.
6. Decide the reviewer shape:
   - no `--reviewer` flags -> default 1:1 pair
   - repeated `--reviewer <slug>` -> 1:M pair
7. Read the authoring references, current roster, and relevant target code before writing anything.
8. Author the producer, reviewer(s), and shared pair skill from templates. Without `--from`, ground them directly in repo evidence; with `--from`, apply template-first overlay.
9. Run `register-pair.ts` to update `## Registered pairs` in `.harness/loom/registry.md`. Pass `--before <slug>` or `--after <slug>` whenever the right workflow position is known; omit anchors only when a true append is intended.

### 4. `--improve`

1. Parse args and stop immediately if `<purpose>` is missing.
2. Discover the existing pair from the target's registered-pairs section.
3. Re-read the current producer, reviewer(s), pair skill, authoring references, and relevant target code.
4. Use positional `<purpose>` as the primary improvement axis, then fold in rubric hygiene and codebase drift.
5. Replace vague or stale guidance with repo-specific evidence first.
6. Keep names and slugs stable. Re-register only when reviewer shape or roster placement intentionally changes.
7. If the pair has clearly become two different jobs, stop with a recommendation for an explicit `--add` + `--improve` + `--remove` sequence instead of automating a split.

### 5. `--remove`

1. Discover the existing pair from `.harness/loom/registry.md` and resolve its producer, reviewer slug(s), and skill slug from that registry line.
2. Reject removal of the planner, finalizer, foundation runtime skills, `registry.md`, missing pairs, and anything outside `.harness/loom/agents/` or `.harness/loom/skills/`.
3. Inspect `.harness/cycle/state.md` when it exists. If `## Next` references the pair, or if any non-terminal EPIC roster/current field references the pair, abort before mutating files.
4. Treat unparsable active-cycle state as unsafe and abort. The default contract has no force flag.
5. Run `register-pair.ts --unregister --target <target> --pair <pair-slug>` to remove only the roster entry from `## Registered pairs`.
6. Delete the pair-owned producer agent, reviewer agent(s), and pair skill directory from `.harness/loom/` after unregistering.
7. Do not delete an agent or skill path that is still referenced by another remaining registry entry; abort or preserve it with an explicit warning rather than breaking another pair.
8. Never delete or rewrite `.harness/cycle/`, `.harness/cycle/epics/`, task files, review files, or `events.md`. Historical task/review evidence stays intact after pair removal.
9. Tell the user to run `node .harness/loom/sync.ts --provider <list>` after removal so derived platform trees drop stale pair files.

### 6. Registration contract

`register-pair.ts` updates `<target>/.harness/loom/registry.md` `## Registered pairs`. That section is the project's sole roster SSOT: the orchestrator reads it at dispatch time, and the planner receives it through the dispatch envelope.

Its placement semantics are load-bearing:

- append + existing pair -> replace in place and preserve the slot
- `--before` / `--after` + existing pair -> move the pair to the new anchor
- append + new pair -> add to the end
- `--before` / `--after` + new pair -> insert at the anchor

For removal, `register-pair.ts --unregister` deletes only the matching roster line. File deletion and active-cycle safety checks belong to `/harness-pair-dev --remove`, not to the registry helper.

Treat that section as workflow order, not as a changelog.

## Evaluation Criteria

- `--add` receives a required positional `<purpose>` and uses it as the main axis for the pair.
- `--add --from` accepts only a currently registered pair slug and applies template-first overlay, never snapshot/path/provider import or blind copy.
- `--improve` receives a required positional `<purpose>` and uses it as the main axis for revision.
- All authored files live under `.harness/loom/`.
- `--add` and `--improve` start from actual codebase evidence.
- `--remove` refuses planner/finalizer/foundation targets and active-cycle references before mutating `.harness/loom/`.
- `--remove` preserves `.harness/cycle/` task and review history.
- Every entry in `## Registered pairs` lists at least one reviewer slug (1:1 or 1:M).
- Registration lands in the intended roster position and remains duplicate-free.
- The user is told to run target-local sync after authoring, improving, or removal.
- Final authored files contain no leftover template placeholders.

## Taboos

- Run `--add` before `harness-init`.
- Author a generic pair without reading the target codebase.
- Treat roster placement as append chronology instead of a workflow decision.
- Author a pair without at least one reviewer. Cycle-end reviewer-less work belongs inside the singleton `harness-finalizer` agent body, not in `## Registered pairs`.
- Rename slugs casually during `--improve`.
- Accept `--hint`; intent belongs in positional `<purpose>`.
- Accept `--split`; split is a user-directed multi-command sequence, not a single pair-dev command.
- Accept `--from` as a snapshot path, file path, derived platform path, or blind-copy import.
- Preserve source `skills:` wholesale during `--from`; the new pair skill plus `harness-context` are mandatory template authority, while extra domain skills are preservation candidates.
- Remove a pair referenced by the active cycle's `Next` or live EPIC roster.
- Delete `.harness/cycle/` history during pair removal.
- Edit derived platform trees directly.
- Hand-edit registration sections instead of using `register-pair.ts`.

## References

- `scripts/pair-dev.ts` — deterministic command helper for validation, `--from` source preparation, and guarded `--remove`
- `scripts/register-pair.ts` — deterministic registration helper (writes `.harness/loom/registry.md`)
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md` — skeletons copied and filled in for each new pair
- `examples/agents/` — completed producer/reviewer exemplars to reference for tone and structure
- `references/authoring/agent-authoring.md` — agent frontmatter, five principles, Task shape, Output Format rubric
- `references/authoring/skill-authoring.md` — pair-skill body rules (section order, 200-line cap, description-as-trigger)
- `references/authoring/from-overlay.md` — `--add --from` template-first overlay rules and source preservation boundaries
- `references/authoring/oversized-split.md` — when and how to split an oversized SKILL.md body into `references/`; this is not the removed pair-level `--split` command
