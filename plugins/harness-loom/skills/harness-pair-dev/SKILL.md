---
name: harness-pair-dev
description: "Use when `/harness-pair-dev --add|--improve|--split <pair-slug>` is invoked to author or reshape a project-specific producer-reviewer pair inside a target harness. `--add <pair-slug> \"<purpose>\"` requires purpose as a positional argument and may repeat `--reviewer <slug>` for 1:M review. Every pair has at least one reviewer; reviewer-less cycle-end work belongs in a finalizer."
argument-hint: "--add <pair-slug> \"<purpose>\" [--reviewer <slug> ...] | --improve <pair-slug> [--hint \"<text>\"] | --split <pair-slug>"
user-invocable: true
---

# harness-pair-dev

## Design Thinking

`harness-pair-dev` is the target's pair-authoring layer. `harness-init` installs the shared runtime foundation; this skill adds the project-specific producer-reviewer pairs that the orchestrator can actually dispatch.

Write only in canonical staging under `<target>/.harness/loom/`. Pair files live under `.harness/loom/{agents,skills}/`. Pair order lives in `.harness/loom/registry.md` `## Registered pairs`, and `register-pair.ts` is the only writer for that section. Derived platform trees are refreshed later by the target-local `node .harness/loom/sync.ts --provider <list>` command.

## Methodology

### 1. Operating rules

- Target is always the current working directory.
- Read the target codebase before authoring. The pair must fit the real repo, not a stock template.
- Normalize generated slugs into the `harness-` namespace.
- Keep reviewer coverage explicit. Every pair is 1:1 or 1:M. Reviewer-less work belongs in a finalizer, not in `## Registered pairs`.
- Treat roster placement as execution order. Appending is correct only when the pair truly belongs at the end of the project-global workflow.
- After authoring or rewriting a pair, tell the user to run `node .harness/loom/sync.ts --provider <list>` from the target root.

### 2. `--add`

1. Parse args and stop immediately if `<purpose>` is missing or the target does not yet contain the installed runtime foundation.
2. Decide the reviewer shape:
   - no `--reviewer` flags -> default 1:1 pair
   - repeated `--reviewer <slug>` -> 1:M pair
3. Read the authoring references, current roster, and relevant target code before writing anything.
4. Author the producer, reviewer(s), and shared pair skill from templates. Identity, principles, methodology, evaluation criteria, and taboos should all point back to repo evidence.
5. Run `register-pair.ts` to update `## Registered pairs` in `.harness/loom/registry.md`. Pass `--before <slug>` or `--after <slug>` whenever the right workflow position is known; omit anchors only when a true append is intended.

### 3. `--improve`

1. Discover the existing pair from the target's registered-pairs section.
2. Re-read the current producer, reviewer(s), pair skill, and relevant target code.
3. If a hint exists, use it as the primary diagnosis axis. Otherwise focus on rubric hygiene and codebase drift.
4. Replace vague or stale guidance with repo-specific evidence first.
5. Keep names and slugs stable. Re-register only when reviewer shape or roster placement intentionally changes.
6. If the pair has clearly become two different jobs, stop and recommend `--split` rather than overfitting one more edit.

### 4. `--split`

1. Re-read the current pair, its roster position, and the relevant target code until the split boundary is clear.
2. Choose two narrower replacement slugs and reviewer shapes that divide the original job cleanly.
3. Author both replacement pairs before removing anything.
4. Preserve workflow order when re-registering:
   - insert the first replacement immediately before the old pair so it inherits that slot once the old line is removed
   - insert the second replacement adjacent to the first with `--before` or `--after`
5. Unregister the old pair only after both replacements exist, then delete the old producer, reviewer, and shared pair-skill files.
6. If the boundary is still ambiguous, stop and ask the user instead of guessing.

### 5. Registration contract

`register-pair.ts` updates `<target>/.harness/loom/registry.md` `## Registered pairs`. That section is the project's sole roster SSOT: the orchestrator reads it at dispatch time, and the planner receives it through the dispatch envelope.

Its placement semantics are load-bearing:

- append + existing pair -> replace in place and preserve the slot
- `--before` / `--after` + existing pair -> move the pair to the new anchor
- append + new pair -> add to the end
- `--before` / `--after` + new pair -> insert at the anchor

Treat that section as workflow order, not as a changelog.

## Evaluation Criteria

- `--add` receives a required positional `<purpose>` and uses it as the main axis for the pair.
- All authored files live under `.harness/loom/`.
- `--add`, `--improve`, and `--split` all start from actual codebase evidence.
- Every entry in `## Registered pairs` lists at least one reviewer slug (1:1 or 1:M).
- Registration lands in the intended roster position and remains duplicate-free.
- `--split` preserves the original workflow coverage with two narrower replacements, then removes the old pair.
- The user is told to run target-local sync after authoring.
- Final authored files contain no leftover template placeholders.

## Taboos

- Run `--add` before `harness-init`.
- Author a generic pair without reading the target codebase.
- Treat roster placement as append chronology instead of a workflow decision.
- Author a pair without at least one reviewer. Cycle-end reviewer-less work belongs inside the singleton `harness-finalizer` agent body, not in `## Registered pairs`.
- Rename slugs casually during `--improve`.
- Remove the old pair before the split replacements are ready.
- Split automatically without a clear boundary or user approval.
- Edit derived platform trees directly.
- Hand-edit registration sections instead of using `register-pair.ts`.

## References

- `scripts/register-pair.ts` — deterministic registration helper (writes `.harness/loom/registry.md`)
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md` — skeletons copied and filled in for each new pair
- `examples/agents/` — completed producer/reviewer exemplars to reference for tone and structure
- `references/authoring/agent-authoring.md` — agent frontmatter, five principles, Task shape, Output Format rubric
- `references/authoring/skill-authoring.md` — pair-skill body rules (section order, 200-line cap, description-as-trigger)
- `references/authoring/oversized-split.md` — when and how to split an oversized SKILL.md into `references/`
