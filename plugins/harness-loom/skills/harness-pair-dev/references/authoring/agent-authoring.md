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
- `skills` content depends on the role:
  - **Pair roles** (producer, reviewer): **two required entries** — the pair-specific `<pair-slug>` first, then `harness-context`. After those, append zero or more extra domain skills if needed, such as `data-schema` for a producer or `sql-conventions` for `sql-reviewer`.
  - **Meta-roles** (planner): `<pair-slug>` (the meta-role's own methodology skill, e.g. `harness-planning`) first, then `harness-context`.
  - **Finalizer**: **one required entry** — `harness-context` only. A finalizer has no pair skill; its rubric lives inside its own agent body.
  Every non-finalizer slug must resolve to a real on-disk `<skills-root>/{slug}/SKILL.md` in the target's canonical staging tree.
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
Suggested next-work: "<optional forward hint for the next stage, or 'none'>"
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
Advisory-next: "<optional forward hint for the next stage, or 'none'>"
```

- Verdict must be the exact string `PASS` or `FAIL`. No emojis, emoticons, or neutral categories such as `PARTIAL`.
- Evidence must cite disk paths plus line ranges. "I feel" or "looks good" is not evidence.
- Producers must not emit reviewer verdict fields, and reviewers must not emit producer diff fields. That is role leakage.
- `Suggested next-work` (producer) and `Advisory-next` (reviewer) are **optional forward hints** for the next stage — emit them only when you have something non-obvious to pass forward; otherwise the value is `none`. The orchestrator does not consume these fields to decide `Next.To`; that is determined by Phase advance rules from the verdict. Do not try to steer self-recall or rework from these fields — that is a role leak into the meta-role (`harness-planner`) that alone owns its `next-action` continuation signal.

**Meta-role exception** — a meta-role that does not leave task/review files, such as `harness-planner`, may replace the Producer shape's `Files created / Files modified / Diff summary` fields with role-specific return fields such as `EPICs / Remaining / next-action / Additional pairs required`. The `next-action` field on a meta-role is load-bearing (defer-to-end continuation grammar `continue|done`, defined in its pair skill), not the same field as the executor-side optional advisory. Any agent that uses this exception must say that it is a meta-role without task/review files in either the identity paragraph or the first principle so reviewers do not grade it with the standard Producer shape.

**Finalizer exception** — the singleton cycle-end finalizer (`harness-finalizer`) uses the Producer shape but has no paired reviewer and no pair skill. Its own `Status: PASS | FAIL` plus `Self-verification` block is the verdict the orchestrator reads. The finalizer signals RETREAT by emitting a `## Structural Issue` block **outside** the Producer fenced block (same shape as in the orchestrator and `harness-context` skills, with `Suspected upstream stage: planner`); absent that block, `Status` alone decides PASS vs FAIL. Finalizer FAIL routes to planner recall rather than in-place rework. The finalizer must not emit Reviewer-shape fields (`Verdict`, `Criteria`, `FAIL items`, `Regression gate`), and the identity paragraph must name the role as the cycle-end finalizer without a paired reviewer so reviewers grade by these Finalizer rules instead of the standard paired Producer shape.

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
- The `skills` list matches the role: pair roles and meta-roles carry `<pair-slug>` first + `harness-context` second; finalizers carry `harness-context` only. Every non-finalizer pair/meta slug resolves to a real `<skills-root>/{slug}/SKILL.md` in the target's canonical staging tree.
- Forbidden fields (`path`, `effort`, `allow-tools`, `allowed-tools`, `tools`) are absent from both frontmatter and body.
- `## Principles` has exactly five items and follows Why-first positive form.
- `## Task` has 5-10 numbered steps, each <=25 words, in active voice, each describing one concrete artifact or decision.
- `## Output Format` exposes the correct fenced block for the role type: Producer shape for pair producers and finalizers, Reviewer shape for pair reviewers, and the Meta-role exception fields for the planner.
- Finalizer agents include a `## Structural Issue` block (same shape as in `harness-context` §7) outside the Producer fenced block to signal RETREAT, with `Suspected upstream stage: planner`. They emit no Reviewer-shape fields.
- There is no procedural drift, skill-body duplication, or embedded pair-reviewer criteria.
- No emojis are present.

## Taboos

- Put `path`, `effort`, `allow-tools`, `allowed-tools`, or `tools` in agent frontmatter; those are platform concerns, not artifact-contract concerns.
- Keep any number of principles other than five; that breaks rubric convergence.
- Write `description` as multiline prose or as passive text without trigger keywords; that disables the trigger mechanism.
- Describe orchestrator routing or state-writing procedures in the agent body; routing and state belong only to the orchestrator.
- Duplicate the pair skill body inside the agent; that creates two sources of truth and guarantees drift.
- Use emojis as decoration.
- Treat `Suggested next-work` or `Advisory-next` as routing authority; the orchestrator synthesizes the real next step.
