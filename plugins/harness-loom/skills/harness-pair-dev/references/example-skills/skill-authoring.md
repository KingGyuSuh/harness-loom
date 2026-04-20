---
name: skill-authoring
description: "Use when authoring or reviewing a `skills/{slug}/SKILL.md` file — the shared pair rubric. Invoke whenever a producer writes skill body/frontmatter or a reviewer grades skill shape, description-as-trigger, line budget, or reference splits."
user-invocable: false
---

# Skill Authoring

## Design Thinking

A skill is the methodology layer. It is the **single shared rubric for one producer-reviewer pair**: the producer uses the body to create work, and the reviewer uses the same body to decide PASS or FAIL. That means a skill needs four axes only: what good looks like (Design Thinking), how to apply it (Methodology), how to grade it (Evaluation Criteria), and what breaks it (Taboos). Procedure transcripts, platform hook wiring, and tool whitelists are runtime-control concerns and do not belong in the skill body.

The frontmatter `description` is not passive metadata; it is a **trigger that decides whether the platform auto-loads the skill**. It needs imperative language such as "Use when ..." or "Invoke whenever ..." plus specific trigger vocabulary. Passive descriptions such as "This skill helps with ..." tend to be skipped. Also, when the skill body grows too large both producer and reviewer lose the thread, so `SKILL.md` follows a **200-line cap** and overflow material moves into `references/{kebab-topic}.md`.

## Methodology

### 1. Canonical skill shape

```markdown
---
name: {skill-slug}
description: "Use when {trigger condition}. Invoke whenever {secondary trigger}."
user-invocable: false   # omit for slash/hook entrypoints (default true)
---

# {Skill Title}

## Design Thinking
{1 paragraph. Why this skill exists and what the producer/reviewer are trying to judge.}

## Methodology
{1..N subsections. Each explains when and how to judge.}

## Evaluation Criteria
- {checks the reviewer cites directly when grading}

## Taboos
- {things that must not happen, plus why}

## Examples (BAD / GOOD)   # optional — only for patterns that are hard to explain with prose
## References               # optional — pointers into references/{kebab-topic}.md
```

The section **order is fixed**. If Design Thinking does not come first, the reviewer loses the "why" immediately after the trigger fires.

### 2. Description-as-trigger

Because `description` is parsed by the platform as a trigger, follow these rules:

- **Imperative voice**: start with `Use when ...`, `Invoke whenever ...`, or `Trigger on ...`.
- **Specific trigger vocabulary**: include the real situations that should load the skill, such as slash commands (`/name`), user continuations (`continue`, `next`), hook re-entry, file types, or review targets.
- **Do not say who is allowed to load it**. Phrases such as `Loaded ONLY by X` or `never by workers` can make the platform drop the skill body because it decides the current turn does not qualify.
- Slash entrypoint skills use the default `user-invocable: true`. Internal methodology skills must set `user-invocable: false`.

### 3. Line budget and oversized split

The body **200-line cap** is the first control line. If the body exceeds that cap, or if any one of the three thresholds below is hit, split the skill.

- **>= 300 lines** — the canonical `SKILL.md` body exceeds 300 lines.
- **>= 3 authority-citation blocks** — the file contains three or more contract blocks that upstream docs cite by line range.
- **>= 2 example blocks** — the file contains at least two GOOD/BAD pairs, templates, or long sample blocks.

When splitting, use `oversized-split.md` sections 1-5 as the canonical rule for naming and preservation. Keep **Frontmatter, Design Thinking, Methodology skeleton, Evaluation Criteria, and Taboos** in the main body. Move full contract prose, long templates, and example collections into `references/`. Each reference file must also stay under 300 lines.

### 4. Coexistence with existing `references/`

Do not rename, rearrange, or absorb existing sibling reference files such as `references/some-topic.md`. New split work owns only net-new material. If an existing file already covers part of the topic, cite it with `references/{existing-topic}.md:{line-range}`. Do not create duplication across reference files in the same skill; duplication makes it ambiguous which file the reviewer should treat as the grading source.

### 5. Reviewer-less pair-skill posture

The default authoring path remains a paired producer-reviewer set, and the pair-skill body must keep that posture: Design Thinking still describes what producer **and reviewer** judge, Evaluation Criteria still reads as a reviewer-citable checklist, and reviewer axes (`[<reviewer-slug>] ...`) are still tagged in 1:M skills. The pair-skill body's center of gravity is reviewer-graded, even when other producers in the same project use the reviewer-less branch.

For the narrow reviewer-less branch (`--reviewer none` on `/harness-pair-dev --add`), the same body shape still applies, with these deltas:

- **Design Thinking carries a one-sentence justification** of why the work is "not subject to review", anchored to a deterministic axis: sync ("the producer just rewrites canonical artifacts into a derived tree; the only meaningful check is byte equivalence, which the producer self-verifies"), format ("the producer runs a formatter; correctness is what the formatter declares"), mirror ("the producer copies one source-of-truth file into a sibling and asserts hash match"). Without that sentence, the body cannot be graded for the reviewer-less posture and the producer turn would silently degrade into "passed without review" — the framing `harness-pair-dev/SKILL.md` §7 forbids.
- **Evaluation Criteria still lists reviewer-citable checks**, but the consumer is now the orchestrator's verdict-source rule (it reads the producer's `Status` line plus `Self-verification` block). Phrase each criterion so the producer can self-cite it from script output, exit code, diff, or lint result — vague criteria that only a human reviewer could grade are a hard fail in the reviewer-less branch.
- **Examples (BAD / GOOD) blocks**, if used, should contrast a deterministic-axis Design Thinking sentence (GOOD) against a hand-wave like "this work is small so review is optional" (BAD). The latter re-creates the rubber-stamp pair the branch exists to retire.

### 6. Non-goals

This rubric does **not** define:

- **Platform sync contracts** — platform directory deployment, model pins, and hook wiring belong to the runtime-control layer.
- **Agent shape** — frontmatter plus `# Role`, `## Principles`, `## Task`, and `## Output Format` are owned by `agent-authoring.md`.
- **Pointer-doc maintenance** — `CLAUDE.md`, `AGENTS.md`, and `README.md` are a separate concern.

## Evaluation Criteria

When reviewing a skill artifact, cite failures directly against these items:

1. **Frontmatter correctness** — `name` matches the skill directory slug, `description` exists, and internal skills set `user-invocable: false`.
2. **Description-as-trigger pattern** — imperative form plus specific trigger vocabulary. No passive descriptions such as "This skill helps with ..." and no authority phrases such as "Loaded ONLY by X".
3. **Section-order compliance** — Design Thinking -> Methodology -> Evaluation Criteria -> Taboos. Optional blocks come after that.
4. **Design Thinking density** — at least one paragraph explains why the skill exists and what the producer/reviewer are judging.
5. **Line budget (<= 200 lines)** — if it goes past 200, a split is required.
6. **Reference split applied** — if any threshold from §3 is met and no split exists, fail it.
7. **Reference naming convention** — only `references/{kebab-topic}.md` is allowed. Generic names such as `notes.md`, `details.md`, `misc.md`, or version suffixes such as `v2.md` are forbidden.
8. **Reference readability floor** — no reference file exceeds 300 lines.
9. **Producer-reviewer shareability** — can the same skill body serve simultaneously as a producer creation guide and a reviewer grading guide?
10. **Taboo presence** — at least four concrete taboos exist.
11. **English prose, English identifiers** — body prose is English, identifiers and frontmatter keys are English, and there are no emojis.
12. **Non-goal clarity** — neighboring concerns such as sync, agent shape, or pointer docs are clearly delegated elsewhere.
13. **Reviewer-less posture (when applicable)** — for a pair authored with `--reviewer none`, Design Thinking carries a one-sentence "not subject to review" justification anchored to a deterministic axis (sync, format, mirror, mechanical translation), and every Evaluation Criteria item can be cited by the producer from script output, exit code, diff, or lint result; vague criteria that only a human reviewer could grade fail this check (`harness-pair-dev/SKILL.md` §7).

## Taboos

- Use emojis such as checkmarks or arrow glyphs.
- Write passive descriptions such as "This skill helps with ..." or "Covers X topic". Platforms may not recognize them as triggers.
- Write access-scoped descriptions such as "Loaded ONLY by ..." or "never by workers". Platforms may drop the skill body.
- Re-state procedures owned by sibling rubrics, such as the exact five-bullet rule from `agent-authoring.md`. That invades a non-goal boundary.
- Use generic reference filenames such as `notes.md`, `details.md`, `misc.md`, or `v2.md`. Reviewers lose clean line-range anchors and duplication leaks across file boundaries.
- Allow any reference file to exceed 300 lines. That violates the split trigger recursively.
- Omit Design Thinking. Without it, the trigger fires but the reader loses the rationale.
- Freeze a step transcript into the body with thirty lines of "step 1, step 2, step 3". Methodology is a judgment framework, not a script.

## Examples (BAD / GOOD)

Use this one `description` example as a fixed contrast. The hypothetical skill is `api-design`.

```yaml
# BAD — passive description, no trigger, access-scoped
description: "This skill describes REST API design conventions. Loaded ONLY by api-designer; never by workers."
```

```yaml
# GOOD — imperative + specific trigger + no authority phrase
description: "Use when drafting or reviewing a REST endpoint spec in this project. Invoke whenever a producer writes an endpoint description or a reviewer grades path/method/response conventions."
```

## References

- `oversized-split.md` — the three split thresholds, naming convention, cross-file citation shape, what stays in SKILL.md, and quality-preservation invariants. §3 of this skill cites it as canonical.
