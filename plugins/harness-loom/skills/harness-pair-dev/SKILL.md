---
name: harness-pair-dev
description: "Use when `/harness-pair-dev --add|--improve|--split <pair-slug>` is invoked to author, refine, or split a producer-reviewer pair for a target project's harness. `--add <pair-slug> \"<purpose>\"` takes purpose as a positional argument and may repeat `--reviewer <slug>` for 1:M reviewer pairs; pass `--reviewer none` to register a reviewer-less producer-only group for deterministic auxiliary work. `--improve` accepts `--hint \"<free-form>\"`; without a hint it applies rubric hygiene plus codebase-drift fixes."
argument-hint: "--add <pair-slug> \"<purpose>\" [--reviewer <slug>|none ...] | --improve <pair-slug> [--hint \"<text>\"] | --split <pair-slug>"
user-invocable: true
---

# harness-pair-dev

## Design Thinking

`harness-pair-dev` is the **project-specific pair-authoring layer** of the harness. `harness-init` seeds the shared runtime foundation; this skill is where the target starts to diverge by adding domain-specific producer-reviewer pairs.

All authoring happens under `<target>/.harness/loom/`. `register-pair.ts` owns pair registration, and `docs-sync.ts` owns the `## Harness Pairs` pointer sections. Platform trees are derived later by the target-local `node .harness/loom/sync.ts --provider <list>` command.

## Methodology

### 1. Modes

| Mode | Input | Output |
|------|-------|--------|
| `--add <pair-slug> "<purpose>" [--reviewer <slug>\|none ...]` | new pair slug + required purpose + optional reviewer slugs | authors one producer, zero or more reviewers, one shared pair skill under `.harness/loom/`, then registers the pair |
| `--improve <pair-slug> [--hint "<text>"]` | existing pair slug + optional hint | re-reads the current pair and codebase, then improves the pair in place |
| `--split <pair-slug>` | overloaded pair slug | replaces one broad pair with two narrower pairs |

Target is always the current working directory. Sync is explicit: after authoring, the user runs `node .harness/loom/sync.ts --provider <list>` to refresh derived platform trees.

### 2. `--add`

1. Parse args and stop immediately if `<purpose>` is missing or the target does not yet contain the installed runtime foundation.
2. Normalize all generated slugs into the `harness-` namespace.
3. Decide the reviewer shape:
   - no `--reviewer` flags -> default 1:1 pair
   - repeated `--reviewer <slug>` -> 1:M pair
   - `--reviewer none` -> reviewer-less producer-only group for deterministic auxiliary work
4. Read the authoring references and the target codebase before writing anything. The pair must anchor to the real repo, not to abstract boilerplate.
5. Author the producer, reviewer(s), and shared pair skill from templates, using repo-specific evidence in the identity, principles, methodology, evaluation criteria, and taboos.
6. Run `register-pair.ts` to update `## Registered pairs` in the orchestrator SKILL. Pass `--before <slug>` or `--after <slug>` when the new pair belongs at a specific point in the project-global roster order; omit them only when appending is genuinely the right workflow choice.
7. Run `docs-sync.ts` so pointer docs stay aligned.
8. Tell the user to run `node .harness/loom/sync.ts --provider <list>` from the target root.

### 3. `--improve`

1. Discover the existing pair from the target's registered-pairs section.
2. Re-read the current producer, reviewer(s), pair skill, and relevant target code.
3. If a hint exists, use it as the primary diagnosis axis. Otherwise focus on rubric hygiene and codebase drift.
4. Replace vague or stale guidance with repo-specific evidence first.
5. If the pair has clearly become two different jobs, stop and recommend `--split` rather than overfitting one more edit.
6. Keep names and slugs stable. Re-register only if the registration shape itself changed.
7. Tell the user to run `node .harness/loom/sync.ts --provider <list>` afterward.

### 4. `--split`

1. Confirm that the current pair naturally divides into two narrower concerns.
2. Choose two meaningful replacement slugs.
3. Author the two new pairs.
4. Remove the old registration and delete the old pair files.
5. Tell the user to run `node .harness/loom/sync.ts --provider <list>` once after the split.

### 5. References

- `references/example-agents/` — tone and structure references for authored pairs
- `references/example-skills/agent-authoring.md` — agent-body rules
- `references/example-skills/skill-authoring.md` — shared skill rules
- `references/example-skills/oversized-split.md` — guidance for when one pair should become two
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md` — writing templates

### 6. Reviewer-less guidance

`--reviewer none` is a narrow opt-in, not a default. Use it only when the work is genuinely deterministic and mechanically verifiable. Good fits are sync, format, mirror, or other auxiliary tasks whose output a reviewer would only rubber-stamp. Do not use it for code authoring, planning, docs, marketing, schema design, or any other judgment-heavy work.

The choice must stay explicit at every layer:

- the user types `none`
- the registration line carries `(no reviewer)` without `↔`
- the produced pair skill explains why this work is `not subject to review`

### 7. Registration contract

`register-pair.ts` updates `<target>/.harness/loom/skills/harness-orchestrate/SKILL.md` `## Registered pairs`. That section is the project's sole roster SSOT: the orchestrator reads it at dispatch time, and the planner receives it through the dispatch envelope. Placement matters. It is not just a changelog.

## Evaluation Criteria

- `--add` receives a required positional `<purpose>` and uses it as the main axis for the pair.
- All authored files live under `.harness/loom/`.
- Both `--add` and `--improve` start from actual codebase evidence.
- Reviewer-less is used only for deterministic auxiliary work and produces no reviewer agent file.
- The shared pair skill stays pair-first even when reviewer-less is chosen.
- Registration lands in the intended roster position and remains duplicate-free.
- The user is told to run target-local sync after authoring.
- Final authored files contain no leftover template placeholders.

## Taboos

- Run `--add` before `harness-init`.
- Author a generic pair without reading the target codebase.
- Treat roster placement as append chronology instead of a workflow decision.
- Use `--reviewer none` to skip review on judgment-heavy work.
- Rename slugs casually during `--improve`.
- Split automatically without user approval.
- Edit derived platform trees directly.
- Hand-edit registration sections instead of using `register-pair.ts`.

## References

- `scripts/register-pair.ts`, `scripts/docs-sync.ts` — deterministic authoring helpers
- `references/example-agents/`
- `references/example-skills/agent-authoring.md`
- `references/example-skills/skill-authoring.md`
- `references/example-skills/oversized-split.md`
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md`
