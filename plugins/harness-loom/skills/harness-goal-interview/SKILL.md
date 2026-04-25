---
name: harness-goal-interview
description: "Use when `/harness-goal-interview` is invoked to produce a harness-ready goal markdown file at the target project root. Runs a full user interview focused on requirements precision and user-side technical decisions, then writes the five canonical sections (Why / Goal / Constraints / Out of scope / Completion criteria) that `/harness-orchestrate <file.md>` will consume as the original user request."
argument-hint: "[--out <path>]"
user-invocable: true
---

# harness-goal-interview

## Design Thinking

`harness-goal-interview` is the front door for a harness cycle. `/harness-orchestrate <file.md>` treats the trimmed body of that file as the original user request and anchors every downstream dispatch envelope to it (see `harness-orchestrate` `§Request-anchored entry`). The quality of that file sets the ceiling for every EPIC, task, and review that follows.

The goal file is a **goal**, not a plan. Planner and producer-reviewer pairs own file paths, implementation strategy, and test shape. This skill's output must not leak that territory. Instead, it elicits two things only the user can supply:

1. **Requirements precision** — who this is for, what behavior or outcome is expected, what success looks like, what is intentionally excluded.
2. **User-side technical decisions** — choices the planner must not make unilaterally: scope boundaries, axis trade-offs (e.g., build vs. integrate, sync vs. async, strict vs. permissive), acceptance signals, release gating.

Everything else (file layout, function names, library picks that follow from repo evidence) belongs in planner and producer turns, not in the goal file.

The skill always writes to the **target project root** so the user can invoke `/harness-orchestrate ./<file>.md` directly. It does not touch `.harness/loom/` or `.harness/cycle/`; those are orchestrator territory.

## Methodology

### 1. Arguments

`/harness-goal-interview [--out <path>]`

No positional topic. The interview itself elicits the topic as its first move. `--out` is optional; when omitted, pick the filename during the interview once the goal's shape is clear. Resolve `--out` relative to the current working directory (target project root) and reject anything under `.harness/`, `.claude/`, `.codex/`, `.gemini/`, or outside the project root.

### 2. Read before asking

Before the first question, read available repo signals so the interview does not ask what the repo already answers:

- `README.md`, `AGENTS.md` / `CLAUDE.md`, top-level pointer docs
- `.harness/loom/registry.md` and `.harness/loom/agents/harness-finalizer.md` when present (pair roster + cycle-end duty)
- last few commits, active branches, `.harness/cycle/state.md` when present (what the harness is currently chewing on)

The goal interview is not a codebase audit. Skim only enough to avoid duplicate or contradictory goals and to ground follow-ups in real context.

### 3. Interview axes

Drive the interview along these axes, in roughly this order. Stop an axis the moment you have a citable answer; do not pad with filler.

1. **Topic and motivation** — what the user wants to accomplish, and *why now*. Reject vague topics ("improve the app") by pushing on the triggering event or pain.
2. **Users / consumers** — who benefits, and what their current friction or expectation is. Skip if the answer is trivially "the developer".
3. **Expected behavior or outcome** — the externally visible change. Prefer user-observable verbs ("user can...", "job emits...", "build rejects...") over implementation verbs.
4. **Boundaries** — hard constraints (compatibility, performance, budgets, deadlines, compliance) and explicit non-goals. Probe for non-goals actively; users tend to under-specify them.
5. **User-side technical decisions** — only surface axes the planner cannot resolve from repo evidence. Frame each as a choice with named options and brief trade-offs. Skip this section entirely when no such axis exists; do not invent decisions to look thorough.
6. **Completion signals** — how the user will recognize "done". Prefer observable signals (artifact present, behavior verifiable, metric threshold) over process signals ("PR merged").

Ask one axis per turn unless several are tightly coupled. When an answer is sufficient, move on; do not re-ask for polish.

### 4. What not to ask

- File paths, class names, module layout, refactor strategy.
- Specific library picks that follow from existing repo conventions.
- Task ordering, EPIC shape, review checklist design.
- Test file locations, CI wiring details.

These belong to planner and producer-reviewer turns. If the user volunteers such detail, capture it as a constraint only if it is load-bearing; otherwise note it aside and do not write it into the goal file.

### 5. Assemble and confirm

Once the axes above are covered, draft the goal file using `references/output-template.md`. The five sections are mandatory in this order: `## Why`, `## Goal`, `## Constraints`, `## Out of scope`, `## Completion criteria`. The top-level `# <title>` summarizes the goal in one line.

Show the draft inline, then ask the user for a final confirmation or edits before writing. Resolve the filename at this point:

- if `--out` was supplied, use it verbatim
- otherwise propose `goal-<slug>.md` at the project root where `<slug>` is a short kebab-case derivation of the goal title; confirm with the user before writing

If a file already exists at the target path, show a diff-style summary and require explicit user confirmation to overwrite.

### 6. Write and hand off

Write the final body to the chosen path and stop. Do not invoke `/harness-orchestrate` automatically. End the turn with the exact next command the user should run from the target root, e.g.:

```bash
/harness-orchestrate ./goal-notification-center.md
```

### 7. Re-run and revision

Re-invoking the skill with the same `--out` path is a revision request: read the existing file, incorporate the user's new input as amendments, and ask before overwriting. Never silently mutate a previously authored goal file.

## Evaluation Criteria

- Output file contains exactly the five sections in canonical order under a concise title; no planner/producer-level detail leaks into any section.
- Every section is grounded in user answers or cited repo evidence; no filler such as "TBD" or "to be decided during implementation".
- `## Out of scope` is explicit, not absent; at least one non-goal is present unless the user explicitly declined.
- `## Completion criteria` is observable (user-visible behavior, artifact presence, metric threshold), not process-based.
- User-side technical decisions are recorded as resolved choices with a brief rationale when they came up; unresolved axes are named as explicit decisions deferred to the user, not silently dropped.
- File is written to the target project root (or an `--out` path inside the project root) with a user-confirmed filename; overwrite of an existing file required explicit confirmation.
- The skill stops after writing and prints the exact `/harness-orchestrate` invocation for the new file.

## Taboos

- Name files, functions, modules, or tests in the goal body. That is planner/producer territory.
- Prescribe task ordering, EPIC structure, review axes, or CI steps.
- Ask the user implementation-level questions such as "which directory should this live in?" or "should we use library X or Y?" when the answer follows from repo conventions.
- Fabricate constraints or completion criteria when the user did not supply them; prefer asking or leaving the section thin but honest.
- Write the file under `.harness/loom/`, `.harness/cycle/`, `.claude/`, `.codex/`, `.gemini/`, or outside the target project root.
- Invoke `/harness-orchestrate`, `node .harness/loom/sync.ts`, or edit the pair registry as part of this skill.
- Silently overwrite an existing goal file.
- Pack multiple unrelated goals into a single file. One request-anchor file per cycle.

## References

- `references/output-template.md` — canonical five-section skeleton and per-section guidance
- `references/interview-axes.md` — prompts and probes per axis, and what to push back on
- `../harness-init/references/runtime/harness-orchestrate/SKILL.template.md` — `§Request-anchored entry`, the contract this skill's output must satisfy
- `../harness-init/references/runtime/harness-planning/SKILL.template.md` — planner's EPIC decomposition rubric (consumer of this output)
