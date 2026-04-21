---
name: harness-planning
description: "Use when the planner subagent is dispatched or when its output is audited. Defines how to read the goal, decompose it into outcome EPICs, and emit each EPIC's stage flow as a subsequence of the project's fixed global roster."
user-invocable: false
---

# Harness Planning

One planner turn emits a small batch of EPICs together with the stage slice each EPIC uses. The project owns one **global roster order**, and each EPIC chooses a **subsequence** of that order rather than inventing a local workflow. The planner returns content in the shape that the orchestrator will fold into `state.md` `## EPIC summaries`, but it does not write task files or control-plane state itself.

## Design Thinking

The planner decides outcomes, not implementation trivia. Each EPIC should describe one meaningful result, then name the stages needed to reach it. The planner does not redesign the runtime on every turn: the runtime already has a fixed stage order, and the planner's job is simply to choose which stages each EPIC uses, which stages can be skipped, and which upstream EPICs must stay ahead at the same stage gate.

This means the planner is not selecting between arbitrary DAG nodes. It is mapping domain outcomes onto a fixed project pipeline.

A single outcome normally traverses **several** stages. If shipping one feature requires a schema change, an API, a UI, an end-to-end test, a doc, and a commit, that is **one EPIC with a six-stage roster**, not six EPICs each assigned to one producer. Slicing an outcome along producer-specialty lines turns the EPIC list into a team roster and hides the outcome behind the pipeline. The planner's instinct should be to **lengthen the roster within one EPIC before adding a new EPIC**.

A simple test for whether two items are one outcome or two: would a user say "ship it" after the first alone? If no, they belong to one outcome. Different **surfaces** of the same shipped feature — backend, frontend, doc, release — are not separate outcomes; different **shipped results** are.

## Methodology

### 1. Identify the planner turn

Before naming EPICs, classify the current planner turn from the envelope:

- **Initial plan** — first entry from a new or reset goal
- **Structural recall** — `Current phase` carries `(retreat reason: ...)`; inspect `Prior tasks` / `Prior reviews` to see what failed upstream
- **Defer-to-end continuation recall** — `Current phase` carries `(planner continuation: ...)`; inspect `Recent events` to see what the earlier batch actually produced

This distinction is load-bearing. Structural recall repairs the plan; continuation recall extends the plan from execution evidence.

### 2. Read only the evidence that changes the plan

Collect only the signals needed to name good EPICs:

- the `Goal` text from the envelope
- `Existing EPICs`, `Current phase`, `Prior tasks`, `Prior reviews`, and `Recent events` from the envelope when re-planning
- this project's README, root docs, and major directories

Treat the goal as plain markdown text. Do not depend on special headers such as `# Goal`. Prefer the orchestrator-supplied envelope over reading control-plane files directly.

### 3. Emit EPICs directly

On an initial plan, emit downstream EPICs immediately starting at `EP-1--{kebab-outcome}`. On a re-plan, keep the result append-only by appending replacement EPICs after the existing list instead of rewriting old ones in place.

Keep one turn focused. A planner turn should usually emit only a few EPICs. The `next-action` line tells the orchestrator whether another planning turn will be needed **after the current batch of EPICs finishes executing**:

- `next-action: done` — planning is complete for this cycle; once the emitted EPICs reach terminal, the orchestrator enters the cycle-end **Finalizer state** (dispatching the singleton `harness-finalizer` agent) and halts after it PASSes.
- `next-action: continue — <one-sentence reason>` — more EPICs will be needed; the orchestrator records `planner-continuation: pending` in `state.md` and **recalls the planner only after every currently-live EPIC reaches terminal**, not immediately. The point is to re-plan against actual execution evidence (events.md, completed task artifacts) rather than blind prediction.

The orchestrator matches the prefix `continue` as the continuation signal; `done` (or any non-`continue` value) clears the flag. This grammar is load-bearing — vague phrasing such as `next-action: maybe more later` degrades silently to `done` under the matcher. A **zero-emit safety** overrides persistent continuation: if a continuation-recalled planner turn emits zero new executable EPICs, the orchestrator forces `done` regardless of the `next-action` line so the cycle cannot stall at halt.

Treat `continue` as **learned replanning**, not split-the-batch convenience. Concrete signals that `continue` is the right call:

- A later EPIC's `roster` or `upstream` cannot be decided without seeing which files or surfaces the first batch actually touched.
- The goal names a follow-up feature whose shape depends on an earlier feature's shipped behavior (e.g., "tune notifications once profile flow is proven").
- The goal is deliberately exploratory — scope of later batches is expected to emerge from execution.

Concrete signals that `done` is the right call even when more work exists:

- All EPICs are already decidable from the goal markdown — emit them all this turn.
- You want more thinking time, but no execution outcome would change later EPICs. That is padding, not learned replanning.

When recalled at defer-to-end (see §6), `Recent events` in the envelope is your evidence base — base the next batch of EPICs on what actually shipped, not on what you originally predicted.

### 4. Generate EPIC fields

Each EPIC has four planner-owned fields:

- `outcome` — one sentence describing what will be true when the EPIC is done
- `upstream` — EPIC slugs that must stay ahead of this EPIC at the same stage gate, or `none`
- `why` — the goal evidence that justified this EPIC. Prefer `goal.md:L12 "quoted phrase"` when line numbering is available; otherwise cite the quoted goal phrase directly.
- `roster` — the stage slice for this EPIC

`current` and `note` are runtime fields owned by the orchestrator. Do not emit them from the planner.

### 5. Use the fixed roster correctly

The project owns one **global roster order** supplied by the orchestrator in the dispatch envelope as `Registered roster`. Each EPIC's `roster` is a **subsequence** of that order:

```text
roster: <pair1-producer> → <pair3-producer> → <pair5-producer>
```

- Every slug must be a registered pair producer for this cycle (a slug from `.harness/loom/registry.md` `## Registered pairs`). The singleton `harness-finalizer` never appears in an EPIC roster — it runs automatically at cycle end.
- Stages may be skipped, but their relative order never changes.
- Reviewers do not appear separately in the roster. One producer name stands for the whole registered pair (the reviewer set is resolved from the pair's `↔ ...` segment at dispatch).
- `upstream` is a same-stage gate. It does not mean "wait until the whole upstream EPIC is done."

If an EPIC cannot be expressed with currently registered pairs, do not emit it as executable work. Put the needed `slug + purpose` under `Additional pairs required` and summarize the blocked outcome under `Remaining`.

### 6. Re-plan append-only (structural recall and defer-to-end continuation)

The planner is recalled in two distinct modes — read the envelope signals to tell which mode you are in, then follow the mode-specific expectations:

- **Structural-issue recall.** Triggered when a Pair reviewer or a Finalizer raised a `## Structural Issue` block whose `Suspected upstream stage` resolved to `planner`. The envelope's `Current phase` will carry `(retreat reason: ...)`. Treat the cited upstream contract as the thing to fix — append replacement EPICs that address the reported gap instead of rewriting prior EPICs in place. A **Finalizer-retreat recall** (Intent prefix `(retreat reason: finalizer <slug> ...)`) means the just-finished cycle failed its cycle-end check against the plan; expect to revise the roster or EPIC coverage before Finalizer re-enters. If you cannot find a fix, emit **zero EPICs with `next-action: done`** — the orchestrator's Finalizer-retreat blocked-halt rule will halt the cycle and ask the user to intervene, which is preferable to padding with placeholder EPICs.
- **Defer-to-end continuation recall.** Triggered when every currently-live EPIC reached terminal while `planner-continuation: pending` was on state. The envelope's `Current phase` will carry `(planner continuation: ...)`. Treat `Recent events` as your evidence base: the five most recent events.md lines summarize what the last batch actually produced. Plan the next batch against that evidence, not against a pre-cycle prediction.

Either mode is **append-only**: continue numbering after the last existing EPIC, never mutate existing `outcome`, `roster`, or `upstream` fields in place. If a recalled turn has nothing new to plan (goal is now fully covered, or the structural gap is already repaired by prior EPICs), emit zero EPICs with `next-action: done`. On defer-to-end continuation recall the zero-emit safety will force `done` anyway; on Finalizer-retreat recall the orchestrator will blocked-halt; on pair-driven structural recall the orchestrator simply resumes the rewound stage. None of these paths require placeholder EPICs.

## EPIC summary shape

The orchestrator absorbs planner output into `state.md` `## EPIC summaries` as one heading plus five stored fields per EPIC.

Example:

```text
### EP-2--auth-skill-authoring
outcome: Author the skill set for the OAuth login flow.
upstream: EP-1--domain-agent-design
roster: skill-dev-producer → test-writer-producer
current: skill-dev-producer
note: upstream EP-1--domain-agent-design must stay ahead at the same stage gates. Derived from goal.md:L18 "Login must use a third-party OAuth2 flow."
```

`current` and `note` are shown here only to illustrate how the orchestrator stores the summary. The planner itself emits `outcome / upstream / why / roster`.

## Evaluation Criteria

- Each EPIC describes one objective outcome rather than a task checklist.
- `why` points to a concrete goal line when available, or to a quoted goal phrase when line numbering is unavailable.
- `roster` uses only registered producers.
- Every EPIC `roster` is a subsequence of the project's fixed global roster.
- `upstream` is treated as a same-stage gate.
- Blocked work goes to `Additional pairs required` instead of being emitted as fake executable EPICs.
- Re-planning is append-only.
- `next-action: continue` is used only for learned replanning (later EPIC shape truly depends on earlier execution); padding-style continuation is treated as a grading failure.
- On a defer-to-end continuation recall, `Recent events` from the envelope is cited as evidence for at least one newly emitted EPIC (or the turn cleanly resolves with zero new EPICs and `next-action: done`).
- Planner output contains no task file paths and no control-plane fields.

## Taboos

- Invent a local roster order for one EPIC.
- Put reviewers directly into `roster`.
- Treat `upstream` as a whole-EPIC completion dependency.
- Emit blocked work as if the missing pair already exists.
- Mutate an existing EPIC in place instead of appending a replacement.
- Overfill one planning turn with a rushed batch of EPICs instead of leaving continuation work for later.
- Include task file paths or `current` in planner output.
- Slice one outcome into several EPICs along producer-specialty lines (one EPIC per surface or team). The same outcome traversing multiple stages is one EPIC with a longer roster.
- Emit `next-action: continue` as padding ("I might need more later, not sure yet", "want more thinking time"). Continuation is for cases where execution evidence changes the later plan — not for reserving uncertainty. A pattern of continue turns that emit zero new EPICs trips the zero-emit safety and is a grading failure.
- Ignore `Recent events` on a defer-to-end recall. The whole point of defer-to-end is that events.md now carries evidence the initial turn could not see.

## Examples (BAD / GOOD)

Assume a web fullstack project whose registered roster is:

```text
db-migration-producer → backend-api-producer → frontend-ui-producer → e2e-test-producer → doc-producer → git-producer
```

The goal asks for a user profile page.

### BAD — outcome sliced along producer-specialty lines

```text
EP-1--profile-schema
- roster: db-migration-producer

EP-2--profile-api
- roster: backend-api-producer

EP-3--profile-ui
- roster: frontend-ui-producer

EP-4--profile-tests
- roster: e2e-test-producer

EP-5--profile-docs
- roster: doc-producer

EP-6--profile-commit
- roster: git-producer
```

All six EPICs serve the single outcome "user can view and edit their profile." The EPIC list has become a team roster — no single EPIC names a shippable result, and the planner has quietly redesigned the runtime's fixed stage order into per-EPIC micro-flows. Fold into one EPIC with a long roster.

### GOOD — one EPIC per outcome, long roster inside

```text
EPICs (this turn):

EP-1--user-profile-page
- outcome: Ship the `/profile` page so a logged-in user can view and edit their display name, handle, and bio end-to-end.
- upstream: none
- why: goal.md:L12 "Users need a profile page to manage personal info."
- roster: db-migration-producer → backend-api-producer → frontend-ui-producer → e2e-test-producer → doc-producer → git-producer

EP-2--profile-avatar-upload
- outcome: Let users upload an avatar image and render it on the profile page, using the S3 direct-upload pattern.
- upstream: EP-1--user-profile-page
- why: goal.md:L18 "Avatar upload must use S3 direct-upload."
- roster: backend-api-producer → frontend-ui-producer → e2e-test-producer → doc-producer → git-producer

Remaining: none
next-action: done
Additional pairs required: none
Escalation: none
```

Each EPIC is **one shippable outcome traversing many stages**. EP-2 skips `db-migration-producer` (no schema change) — stages may be skipped, their relative order never changes. `upstream: EP-1--user-profile-page` is a **same-stage gate**: EP-2's `backend-api-producer` turn waits for EP-1's `backend-api-producer` turn, not for all of EP-1 to finish. EP-1 and EP-2 are two EPICs because they pass the "ship it alone?" test independently — the profile page is useful without avatar upload.
