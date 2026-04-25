---
name: harness-goal-interview
description: "Produces the goal markdown that `/harness-orchestrate` consumes as the original user request. Use when `/harness-goal-interview` is invoked, when the user wants to start a harness cycle on a new feature or initiative, when they ask to 'write down what we're trying to do' before running the harness, when they need to articulate requirements precisely, or when an earlier `/harness-orchestrate` invocation failed because the goal file was vague or plan-shaped. Runs a full user interview focused on requirements precision and user-side technical decisions — implementation detail is the planner's and producer pairs' job, not the goal file's — then writes the five canonical sections (Why / Goal / Constraints / Out of scope / Completion criteria) to the target project root. Use this skill whenever the user is about to hand a goal file to `/harness-orchestrate`, even if they don't explicitly ask for a 'goal interview'; a ten-minute structured elicitation up front pays back across every EPIC, task, and review the cycle produces."
argument-hint: "[--out <path>]"
user-invocable: true
---

# harness-goal-interview

## Design Thinking

`/harness-orchestrate <file.md>` treats the trimmed body of its argument file as the original user request and anchors every downstream dispatch envelope to it (see `harness-orchestrate` `§Request-anchored entry`). The quality of that file sets the ceiling for every EPIC, task, and review the harness produces.

This skill exists because users tend to either under-specify goals ("fix the auth stuff") or over-specify them into plans ("add `refreshToken()` to `AuthService` in `src/auth/service.ts`"). Both cripple the planner:

- **Under-specified** — the planner fabricates motivation and scope, and the resulting cycle reflects the planner's guesses more than the user's intent.
- **Over-specified** — the file crowds out *why* and *what* with premature *how*, so EPICs become transcriptions of pre-decided implementation steps instead of outcome decompositions.

The interview elicits exactly the two things the planner cannot supply on its own:

1. **Requirements precision** — who this is for, what behavior or outcome is expected, what success looks like, what is intentionally excluded.
2. **User-side technical decisions** — choices the planner must not make unilaterally: scope boundaries, axis trade-offs, acceptance signals, release gating.

Everything else — file layout, function names, library picks that follow from repo evidence, task ordering, EPIC shape, review axes — belongs to planner and producer turns. Leaving those decisions to the harness is a feature of the design, not a gap in the goal file.

Files always land at the **target project root** so the user can run `/harness-orchestrate ./<file>.md` directly. The skill does not touch `.harness/loom/` or `.harness/cycle/`; those are orchestrator territory.

## Methodology

### 1. Arguments

`/harness-goal-interview [--out <path>]`

No positional topic. The interview's first move elicits the topic — forcing the user to name something upfront often gets a generic label ("improve notifications") when the real trigger is specific ("last week's customer complaints about missed order confirmations"). Let the conversation surface the concrete thing.

`--out` is optional. Choose the filename during the interview once the goal's shape is clear when it is omitted. Resolve `--out` relative to the current working directory (target project root) and refuse paths under `.harness/`, `.claude/`, `.codex/`, `.gemini/`, or outside the project root.

### 2. Read before asking

Before the first question, skim enough repo context that the interview does not ask what the repo already answers:

- `README.md`, `AGENTS.md` / `CLAUDE.md`, top-level pointer docs
- `.harness/loom/registry.md` and `.harness/loom/agents/harness-finalizer.md` when present (pair roster + cycle-end duty)
- the last few commits, active branches, `.harness/cycle/state.md` when present (what the harness is currently chewing on)

This is not a codebase audit. The aim is to avoid duplicate or contradictory goals and to ground follow-ups — not to write the goal file for the user.

### 3. Interview axes

Drive the interview along these axes, roughly in this order. Stop an axis the moment the user's answer is citable; polishing past "clear enough" burns trust for no quality gain.

Full prompts and push-back patterns per axis live in `references/interview-axes.md`. The axes:

1. **Topic and motivation** — what the user wants, and *why now*. Push past generic ambition ("improve X") to the concrete trigger (the complaint, the incident, the deadline).
2. **Users / consumers** — who benefits and what their current friction is. Skip when the answer is trivially "the developer".
3. **Expected behavior or outcome** — the externally visible change, stated in user-observable verbs ("user can...", "job emits...", "build rejects...").
4. **Boundaries** — hard constraints and explicit non-goals. Probe non-goals at least twice; they are chronically under-supplied and they shape the cycle as strongly as the positive goals do.
5. **User-side technical decisions** — choices the planner cannot resolve from repo evidence. Frame each as named options with one-line trade-offs. Skip this axis entirely when no genuine surface exists; invented decisions erode user trust faster than missed ones.
6. **Completion signals** — observable signals for "done". Strip process signals like "PR merged" or "tests pass"; the harness running to terminal state implies those, and listing them crowds out the signals that actually discriminate success from failure.

Ask one axis per turn unless several are tightly coupled. Summarize captured answers back to the user before axes 5 and 6 so early misunderstandings are cheap to correct.

### 4. What belongs here vs. what belongs to the harness

The judgment line between "goal material" and "planner material" is the most important call this skill makes. These questions do **not** belong in the interview:

- file paths, module layout, class names, refactor strategy
- specific library picks that follow from existing repo conventions
- task ordering, EPIC shape, reviewer axis design
- test file locations, CI wiring details

They are off-limits not because they're unimportant but because the planner and producer pairs make *better* decisions about them with the repo open in front of them. Premature commitment in the goal file becomes a constraint the planner has to work around instead of an outcome it can freely decompose.

When the user volunteers such detail, capture it as a constraint only when it is genuinely load-bearing (e.g., "must keep the existing `/v1/` endpoints working"). Otherwise acknowledge it in conversation and do not write it into the goal file.

### 5. Assemble and confirm

Once the axes are covered, draft the goal file in this exact section order:

```markdown
# <one-line outcome-noun title>

## Why
<2–5 sentences: trigger, who is affected, why now>

## Goal
<externally visible outcome, in user-observable verbs>

## Constraints
- <hard requirement, budget, deadline, compliance rule>

## Out of scope
- <explicit non-goal or deferral>

## Completion criteria
- <observable signal: behavior, artifact, metric>
```

Per-section guidance and a longer skeleton are in `references/output-template.md`. Show the draft inline, then ask the user for a final confirmation or edits before writing anything to disk.

Resolve the filename at confirmation time:

- when `--out` was supplied, use it verbatim
- otherwise propose `goal-<slug>.md` at the project root where `<slug>` is a short kebab-case derivation of the title, and confirm with the user before writing

When a file already exists at the target path, show a diff-style summary and require explicit user confirmation before overwriting.

### 6. Write and hand off

Write the final body to the chosen path and stop. End the turn with the exact next command the user should run, substituting the path you actually wrote:

```bash
/harness-orchestrate ./<the-file-you-just-wrote>.md
```

For example, after writing `./goal-notification-center.md`, the line reads `/harness-orchestrate ./goal-notification-center.md`. Do not echo that example filename when the file you wrote was named something else.

Do not invoke `/harness-orchestrate` automatically. The harness cycle is a separate decision point — the user may want to review the file, `git add` it, or have a teammate look at it first.

### 7. Re-run and revision

Re-invoking the skill with the same `--out` path is a revision request, not a clean write: read the existing file, incorporate the user's new input as amendments, and ask before overwriting. Silent mutation of a previously authored goal file destroys evidence the user may rely on.

## Example extraction

A short trace, to calibrate voice and depth:

> **User:** "I want to run the harness on the new notification thing."
>
> **Skill:** "What happened recently that made that feel worth doing now?"
>
> **User:** "Ops team got three tickets last week about missed order confirmations. The emails went out, but the in-app banner didn't."
>
> **Skill:** "So the missed surface is the in-app banner specifically — email is fine. Who's affected?"
>
> **User:** "End customers on the order detail page. They refresh and see no banner, so they think the order didn't go through and contact support."

From which the skill extracts:

```markdown
## Why
Customers who place orders and then refresh the order detail page currently see no in-app confirmation banner, leading them to contact support believing the order failed. Three such tickets arrived in the last week.

## Goal
After placing an order, a customer visiting the order detail page sees an in-app confirmation banner that survives page refresh until the order transitions to its next state.
```

No file paths, no library picks, no React/backend choice spelled out — the planner decides that. The goal file records what success looks like and why it matters.

## Evaluation Criteria

- The file contains exactly the five sections in canonical order under a concise outcome-noun title.
- Every section is grounded in user answers or cited repo evidence; no filler like "TBD" or "to be decided during implementation".
- `## Out of scope` is explicit, not absent; at least one non-goal is present unless the user explicitly declined and that refusal is recorded.
- `## Completion criteria` is observable (behavior, artifact, metric), not process-based.
- No planner/producer-level detail — file paths, function names, library picks that follow from repo evidence — appears anywhere.
- The file is written inside the target project root at a filename the user confirmed; overwrite of an existing file required explicit confirmation.
- The skill stops after writing and prints the exact `/harness-orchestrate` invocation for the new file.

## Taboos

- **Naming files, functions, modules, or tests in the goal body.** Premature commitment here becomes a constraint the planner has to work around instead of an outcome it can freely decompose.
- **Prescribing task ordering, EPIC structure, review axes, or CI steps.** These are the planner's and producers' jobs; a goal file that dictates them defeats the harness's reason to exist.
- **Asking implementation-level questions** like "which directory should this live in?" or "library X or Y?" when the answer follows from repo conventions. These waste user attention on choices the harness can make better.
- **Fabricating constraints or completion criteria** when the user did not supply them. Thin but honest beats padded and invented; the planner will flag real gaps.
- **Writing the file under `.harness/loom/`, `.harness/cycle/`, `.claude/`, `.codex/`, `.gemini/`, or outside the target project root.** Those trees belong to the orchestrator or provider derivation, not to request-anchor authoring.
- **Invoking `/harness-orchestrate`, `node .harness/loom/sync.ts`, or editing the pair registry.** The handoff is the user's move.
- **Silently overwriting an existing goal file.** A revision is a conversation, not a file operation.
- **Packing multiple unrelated goals into a single file.** The orchestrator anchors one cycle to one request; mixing goals pollutes EPIC decomposition downstream.

## References

- `references/output-template.md` — canonical five-section skeleton with per-section guidance
- `references/interview-axes.md` — prompts, probes, and push-back patterns per axis; anti-patterns for what not to ask
- `../harness-init/references/runtime/harness-orchestrate/SKILL.template.md` — `§Request-anchored entry`, the contract this skill's output must satisfy
- `../harness-init/references/runtime/harness-planning/SKILL.template.md` — planner's EPIC decomposition rubric (primary consumer of this file)
