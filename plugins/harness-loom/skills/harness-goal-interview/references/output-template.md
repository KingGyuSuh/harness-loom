# Goal file output template

Canonical shape for the file produced by `/harness-goal-interview`. The file is consumed by `/harness-orchestrate <file.md>` as the original user request (see `harness-orchestrate` `§Request-anchored entry`).

## Skeleton

```markdown
# <one-line goal title>

## Why

<2–5 sentences: triggering event or pain, who is affected, why now. Concrete enough that a stranger can tell why the cycle exists, without reading the codebase.>

## Goal

<2–6 sentences or a short bulleted list: the externally visible change this cycle delivers. Use user-observable verbs ("user can...", "job emits...", "build rejects..."). Describe the outcome, not the implementation route.>

## Constraints

- <hard requirement, compatibility rule, performance/latency/cost budget, deadline, compliance rule, platform or dependency that must be honored>
- <one item per line; the section stays even when empty — record `- none surfaced during the interview` rather than dropping the heading, since the contract requires all five sections in canonical order>

## Out of scope

- <explicit non-goal the cycle must not drift into>
- <deliberate deferral to a later cycle>
- <adjacent work the user considered and chose not to include>

## Completion criteria

- <observable signal #1: a behavior you can verify, an artifact that must exist, a metric threshold, a before/after demonstration>
- <observable signal #2>
- <include a user-side technical decision here only if it is itself a completion gate; otherwise keep decisions inside Constraints or Goal>
```

## Per-section guidance

### Title

One line. Prefer a noun phrase naming the outcome (`notification center for internal tools`) over a verb phrase naming the work (`add notifications`). Avoid version numbers, branch names, or ticket ids.

### Why

Answers "why is this cycle happening *now*?" Cite the triggering event or pain: a user complaint, a recurring operational cost, a compliance deadline, a blocked downstream team. Avoid vague motivations like "improve quality"; push back during the interview until a concrete trigger surfaces.

### Goal

Answers "what will be externally different when the cycle ends?" Describe the outcome in terms a non-implementer can verify. Do not name files, functions, directories, or specific libraries. "User can export filtered logs as CSV from the dashboard" is a goal. "Add `exportLogsCSV()` to `DashboardService`" is a plan.

### Constraints

Hard rules the cycle must honor. These often come from outside engineering: compliance, SLAs, existing integrations, business commitments. Record performance or cost ceilings with numbers when the user supplies them. Leave out soft preferences; those belong in the interview notes, not the goal file.

### Out of scope

The most under-specified section in practice. Probe actively during the interview: "what are we explicitly *not* doing?" Record deferred work, adjacent features the user considered, and areas the planner might otherwise wander into. If the user genuinely declines to name non-goals, say so in one line rather than leaving the section empty.

### Completion criteria

Observable signals only. Prefer:

- user-visible behavior the user or a reviewer can exercise
- artifacts that must exist (a dashboard panel, an exported file, a deployed endpoint)
- metric thresholds with numbers
- before/after comparisons the user can perform

Avoid process-based signals such as "PR merged", "all tests green", or "finalizer passes"; those are implied by the harness running to terminal state and do not help the planner shape EPICs.

## Decision-surface convention

User-side technical decisions belong inline in the section they shape, not in a separate "Decisions" section:

- a resolved build-vs-integrate choice → a sentence in **Goal** or a line in **Constraints**
- a deliberate deferral of a feature axis → a bullet in **Out of scope**
- an acceptance signal tied to a user decision → a bullet in **Completion criteria**

If a decision is genuinely undecided and must be resolved before the cycle can proceed, surface it in the interview and resolve it before writing the file. The goal file is not a decision log.

## Length

Aim for 30–80 lines total. Shorter files usually mean the interview stopped too early; longer files usually mean implementation detail leaked in. Neither rule is hard — trust substance over word count.
