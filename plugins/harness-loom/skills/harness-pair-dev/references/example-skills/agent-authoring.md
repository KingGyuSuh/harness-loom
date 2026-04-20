---
name: agent-authoring
description: "Use when authoring or reviewing an `agents/*.md` role definition for any target project. Defines the canonical frontmatter, identity paragraph, five Why-first Principles, numbered Task, and fenced Output Format that a producer-reviewer pair shares."
user-invocable: false
---

# Agent Authoring

This is the single shared rubric for a producer-reviewer pair. If an agent body mixes in too much "how", the producer and reviewer drift apart in how they judge the work. Methodology stays in the pair skill; the agent carries only role, principles, Task, and output shape.

## Design Thinking

Agent = role identity. Procedure (`how`) belongs to the pair skill. If that separation breaks, the producer starts teaching one method while the reviewer grades another, and the verdict becomes unstable.

The frontmatter `description` is not documentation; it is a **trigger mechanism**. Runtime routing reads that sentence to decide whether to invoke the role. That means it must be explicit and specific, using active trigger language such as "Use when ..." or "Invoke whenever ...".

## Canonical Agent Shape

Follow this template in order. The section order is load-bearing and must not be rearranged.

```
---
name: <kebab-slug matching filename>
description: "<one line with trigger keywords: Use when X / Invoke whenever Y>"
skills:
  - <pair-slug>            # required — shared pair rubric
  - harness-context        # required — shared law (envelope reading, output shape, boundaries)
  # Optional below — extra domain skills needed only by this agent
  # - data-schema
  # - sql-conventions
model: <opus | inherit>    # optional
---

# <Role Display Name>

<2-4 line identity paragraph: describe only what this role is. Do not include how.>

## Principles

1. <One-sentence principle>. <One-sentence reason.>
2. ...
(exactly 5. Why-first, positive form.)

## Task

1. <active step, <=25 words, exactly one concrete artifact or decision>
2. ...
(5-10 numbered items.)

## Output Format

End your response with this structured block:

```
<fenced block; role-type-specific shape is defined below in §Output Format Rules>
```
```

## Frontmatter Rules

- `name` must match the filename kebab-slug exactly.
- `description` must be a single line and include active trigger keywords such as "Use when ...", "Invoke whenever ...", or "Use this agent to ...". Multi-paragraph text, trivia, or passive descriptive prose is forbidden. A description without a trigger makes the role unroutable.
- `skills` must include the **two required entries** (the pair-specific `<pair-slug>` plus shared `harness-context`). After those, append zero or more extra domain skills if needed, such as `data-schema` for a producer or `sql-conventions` for `sql-reviewer`. Every slug must resolve to a real on-disk `skills/{slug}/SKILL.md`. Keep the required order: pair skill first, `harness-context` second.
- `model` is optional. Runtime or sync layers may inject provider-specific values, so the agent body should not care about platform branching.
- Forbidden fields: `path`, `effort`, `allow-tools`, `allowed-tools`, `tools`. Platform dispatch knobs do not belong in the agent contract.

## Identity Paragraph Rules

- 2-4 lines. Describe only **what the role is**. No procedure, grading rubric, or template prose.
- Use direct English prose. The heading should use a Title Case display name, not the kebab slug.
- Do not restate reviewer criteria here.

## Principle Rules

- Exactly **5 items**. Three is too shallow; six or more usually becomes repetition and scroll fatigue.
- Shape: "Do X. Reason: Y." Each bullet must contain one positive-form principle plus one short reason sentence.
- Negative-only bullets that stop at "do not ..." are forbidden. Anti-pattern ownership belongs elsewhere.
- Do not restate reviewer criteria or Task steps. Principles express identity and stance only.
- No procedural drift. If a sentence starts turning into "first read X, then ...", it belongs in Task or a linked skill instead.

## Task Rules

- Numbered, active voice, <=25 words per step. Total of 5-10 steps.
- Each step must specify **exactly one concrete artifact or decision**. "Consider X" is too observational; "Produce X", "Decide Y", or "Write Z" is correct.
- Step order should follow real dependency. If two actions can happen in parallel, keep them separate and just number them.
- The Task section may cite the pair skill, but must not duplicate it. "`Follow the Output Format Rules in <skill-slug>`" is the correct citation style.

## Output Format Rules

Use one fenced block. Producer and Reviewer have different shapes.

**Producer variant** — include these fields in this order:

```
Status: PASS / FAIL
Summary: {what was produced in one line}
Files created: [{file path}]
Files modified: [{file path}]
Diff summary: {sections changed vs baseline, or "N/A"}
Self-verification: {issues found and resolved during this cycle}
Suggested next-work: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
Remaining items: [{items not yet done}]
Escalation: {none | structural-retreat-to-<stage>, reason}
```

**Reviewer variant** — include these fields in this order:

```
Verdict: PASS / FAIL
Criteria: [{criterion, result, evidence-citation (file:line)}]
FAIL items: [{item, level (technical/creative/structural), reason}]
Regression gate: {clean / regression / N/A, details}
Feedback: {short free-form rationale}
Advisory-next: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
```

- Verdict must be the exact string `PASS` or `FAIL`. No emojis, emoticons, or neutral categories such as `PARTIAL`.
- Evidence must cite disk paths plus line ranges. "I feel" or "looks good" is not evidence.
- Producers must not emit reviewer verdict fields, and reviewers must not emit producer diff fields. That is role leakage.

**Meta-role exception** — a meta-role that does not leave task/review files, such as `harness-planner`, may replace the Producer shape's `Files created / Files modified / Diff summary` fields with role-specific return fields such as `EPICs / Remaining / Next-action / Additional pairs required`. Any agent that uses this exception must say that it is a meta-role without task/review files in either the identity paragraph or the first principle so reviewers do not grade it with the standard Producer shape.

## Reviewer-less Producer Authoring (Opt-in Branch)

The default authoring path remains a **paired** producer-reviewer set: one `<pair-slug>-producer.md` and at least one `<reviewer-slug>.md`. The reviewer-less branch is a narrow opt-in selected by `--reviewer none` on `/harness-pair-dev --add` and is reserved for deterministic / auxiliary work that is genuinely "not subject to review" — sync, format, mirror, mechanical translation. Use it only when a paired reviewer would have nothing to grade beyond "did the script run". When in doubt, default to a paired reviewer; the cost of one extra agent file is far smaller than the cost of a hollow rubber-stamp pair.

When this branch fires, the agent-authoring rules above still apply to the producer file with these deltas:

- **No reviewer agent file is written.** Do not author a `<pair-slug>-reviewer.md` placeholder, an empty stub, or a "trivially passes" reviewer. The absence of the file is the on-disk signal.
- **The producer's frontmatter `description` should not promise a paired reviewer.** Write it in the form `Use when the target's /harness-orchestrate dispatches the <pair-slug> producer phase. Produces the task specified in the pair's shared skill rubric. Returns Producer-shape Output Format; this producer has no paired reviewer because the work is not subject to review (see <pair-slug>/SKILL.md Design Thinking).` The trigger keyword stays imperative; the closing clause names the reviewer-less posture so the description does not mislead.
- **The producer's `skills:` list still carries the two required entries** — the pair-specific `<pair-slug>` first, `harness-context` second — even with no paired reviewer. The shared law (envelope reading, output shape, structural-issue report shape) is identical for paired and reviewer-less producers.
- **The Producer Output Format shape is unchanged.** The producer still emits `Status: PASS / FAIL` plus `Self-verification`. For a reviewer-less turn the orchestrator reads that `Status` line and the `Self-verification` evidence as the verdict source (sibling skill `harness-orchestrate` Authority Rules), so a vague self-verification block is a hard fail; the producer must cite script exit code, byte-equivalence diff, lint output, or equivalent mechanical evidence.
- **Registration shape signals reviewer-less.** `register-pair.ts` emits `- <pair>: producer \`<p>\` (no reviewer), skill \`<s>\`` for this branch — the missing `↔` arrow plus the literal `(no reviewer)` substring are the two load-bearing tokens. Do not hand-author this line; let the script emit it.

## Anti-patterns

- Emojis. They add noise to trigger heuristics.
- Procedural drift. How-to prose belongs in the linked pair skill, not inside the agent.
- Embedding reviewer criteria inside a producer agent. Evaluation belongs to the paired reviewer body plus the shared skill.
- Re-explaining a skill body. Point to the skill through the `skills:` list instead of duplicating its content inside the agent.
- Multi-paragraph descriptions or descriptions without trigger verbs. Single-line + active-trigger is mandatory.
- Platform dispatch knobs such as `path`, `effort`, `allow-tools`, `allowed-tools`, or `tools`. Those invade another layer's responsibility.
- Principle count other than five. That causes repetition and grading drift.
- Re-stating orchestrator routing or state-write procedures in the agent body. Routing/state are orchestrator-owned.

## Evaluation Criteria

When a pair reviewer grades an agent with this rubric, it checks:

- Required frontmatter fields (`name`, `description`, `skills`) are all present and correctly shaped.
- `name` matches the filename kebab-slug.
- `description` is single-line and contains active trigger keywords.
- The `skills` list includes the required pair skill plus `harness-context` in that order, and every extra skill resolves to `skills/{slug}/SKILL.md` on disk.
- Forbidden fields (`path`, `effort`, `allow-tools`, `allowed-tools`, `tools`) are absent from both frontmatter and body.
- `## Principles` has exactly five items and follows Why-first positive form.
- `## Task` has 5-10 numbered steps, each <=25 words, in active voice, each describing one concrete artifact or decision.
- `## Output Format` exposes the correct fenced block for the role type (Producer or Reviewer).
- There is no procedural drift, skill-body duplication, or embedded pair-reviewer criteria.
- No emojis are present.
- For a reviewer-less producer (chosen via `--reviewer none`): no paired `<pair-slug>-reviewer.md` was authored; the producer's `description` does not promise a paired reviewer and instead names the "not subject to review" posture; the registration line emitted by `register-pair.ts` carries `(no reviewer)` without the `↔` token.

## Taboos

- Put `path`, `effort`, `allow-tools`, `allowed-tools`, or `tools` in agent frontmatter; those are platform concerns, not artifact-contract concerns.
- Keep any number of principles other than five; that breaks rubric convergence.
- Write `description` as multiline prose or as passive text without trigger keywords; that disables the trigger mechanism.
- Describe orchestrator routing or state-writing procedures in the agent body; routing and state belong only to the orchestrator.
- Duplicate the pair skill body inside the agent; that creates two sources of truth and guarantees drift.
- Use emojis as decoration.
- Treat `Suggested next-work` or `Advisory-next` as routing authority; the orchestrator synthesizes the real next step.
