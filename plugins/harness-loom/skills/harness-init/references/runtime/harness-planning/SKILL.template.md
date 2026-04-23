---
name: harness-planning
description: "Use when the planner subagent is dispatched or when its output is audited. Defines how to read the goal, decompose it into producer-completable outcome EPICs, and emit each EPIC's stage flow as a subsequence of the project's fixed global roster."
user-invocable: false
---

# Harness Planning

One planner turn emits a small batch of EPICs together with the stage slice each EPIC uses. The project owns one **global roster order**, and each EPIC chooses a **subsequence** of that order rather than inventing a local workflow. The planner returns content in the shape that the orchestrator will fold into `state.md` `## EPIC summaries`, but it does not write task files or control-plane state itself.

## Design Thinking

The planner decides outcome slices, not implementation trivia. Each EPIC should describe one meaningful result that every producer in its roster can attempt to complete in a single Pair turn. If a planned EPIC predictably requires the same producer to leave in-scope acceptance, verification, or rendered evidence for a later turn, the EPIC is too large and must be split before dispatch.

This means the planner is not selecting between arbitrary DAG nodes. It is mapping domain outcomes onto a fixed project pipeline.

A good EPIC is neither a whole-surface bucket nor a tiny checklist item. "Build Home" is usually too broad; "rename one button" is too small. "Establish the Home layout foundation", "build the Home header/navigation on that foundation", and "add the Home discovery rails with empty/loading/error evidence" can be separate dependent EPICs because each leaves a reviewable product layer that downstream producers can inspect and extend.

Do not split along producer specialty. If one product slice requires an API contract, game UI, rendered evidence, docs, and release prep, that is one EPIC with a longer roster. Split only when the product result itself has dependency-bearing layers that are worth reviewing independently and can be carried forward through `upstream` evidence.

## Methodology

### 1. Identify the planner turn

Before naming EPICs, classify the current planner turn from the envelope:

- **Initial plan** — first entry from a new or reset goal
- **Structural recall** — `Turn intent` carries `(retreat reason: ...)`; inspect `Prior tasks` / `Prior reviews` to see what failed upstream
- **Defer-to-end continuation recall** — `Turn intent` carries `(planner continuation: ...)`; inspect `Recent events` to see what the earlier batch actually produced

This distinction is load-bearing. Structural recall repairs the plan; continuation recall extends the plan from execution evidence.

### 2. Read only the evidence that changes the plan

Collect only the signals needed to name good EPICs:

- the compact `Goal` summary from the envelope
- `User request snapshot` from the envelope; prefer the full snapshot for line-cited requirements and product-quality constraints
- `Existing EPICs`, `Turn intent`, `Prior tasks`, `Prior reviews`, and `Recent events` from the envelope when re-planning
- this project's README, root docs, and major directories

Treat the request snapshot as plain markdown text. Do not depend on special headers such as `# Goal`. Prefer `User request snapshot` over the short `Goal` summary when it exists, and prefer the orchestrator-supplied envelope over reading control-plane files directly.

### 3. Emit EPICs directly

On an initial plan, emit downstream EPICs immediately starting at `EP-1--{kebab-outcome}`. On a re-plan, keep the result append-only by appending replacement EPICs after the existing list instead of rewriting old ones in place.

Before emitting an EPIC, apply the producer-completion sizing test:

- Can the current producer stage complete the EPIC's acceptance, verification, and evidence obligations in one Pair turn without planned self-deferral?
- Is the result large enough to be reviewed as a product or contract layer, not just a microscopic edit?
- If a later EPIC depends on this one, will `Prior tasks` / `Prior reviews` give the downstream producer enough concrete evidence to continue without rediscovering the same files from scratch?

If the answer is no because the surface is too broad, split the surface into dependency-bearing EPICs and connect them with `upstream`. If the answer is no because the item is too small, fold it into the nearest meaningful EPIC.

Keep one turn focused. A planner turn should usually emit only a few EPICs. The `next-action` line tells the orchestrator whether another planning turn will be needed **after the current batch of EPICs finishes executing**:

- `next-action: done` — planning is complete for this cycle; once the emitted EPICs reach terminal, the orchestrator enters the cycle-end **Finalizer state** (dispatching the singleton `harness-finalizer` agent) and halts after it PASSes.
- `next-action: continue — <one-sentence reason>` — more EPICs will be needed; the orchestrator records `planner-continuation: pending` in `state.md` and **recalls the planner only after every currently-live EPIC reaches terminal**, not immediately. The point is to re-plan against actual execution evidence (events.md, completed task artifacts) rather than blind prediction.

The orchestrator matches the prefix `continue` as the continuation signal; `done` (or any non-`continue` value) clears the flag. This grammar is load-bearing — vague phrasing such as `next-action: maybe more later` degrades silently to `done` under the matcher. A **zero-emit safety** overrides persistent continuation: if a continuation-recalled planner turn emits zero new executable EPICs, the orchestrator forces `done` regardless of the `next-action` line so the cycle cannot stall at halt.

Treat `continue` as **learned replanning**, not split-the-batch convenience. Concrete signals that `continue` is the right call:

- A later EPIC's `roster` or `upstream` cannot be decided without seeing which files or surfaces the first batch actually touched.
- The goal names a follow-up feature whose shape depends on an earlier feature's shipped behavior (e.g., "tune notifications once profile flow is proven").
- The goal is deliberately exploratory — scope of later batches is expected to emerge from execution.

Concrete signals that `done` is the right call even when more work exists:

- All EPICs are already decidable from the request snapshot — emit them all this turn.
- You want more thinking time, but no execution outcome would change later EPICs. That is padding, not learned replanning.

When recalled at defer-to-end (see §6), `Recent events` in the envelope is your evidence base — base the next batch of EPICs on what actually shipped, not on what you originally predicted.

### 4. Generate EPIC fields

Each EPIC has four planner-owned fields:

- `outcome` — one sentence describing what will be true when the EPIC is done
- `upstream` — EPIC slugs that must stay ahead of this EPIC at the same stage gate, or `none`
- `why` — the request evidence that justified this EPIC. Prefer `.harness/cycle/user-request-snapshot.md:L12 "quoted phrase"` when line numbering is available; otherwise cite the quoted goal phrase directly.
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

- **Structural-issue recall.** Triggered when a Pair reviewer or a Finalizer raised a `## Structural Issue` block whose `Suspected upstream stage` resolved to `planner`. The envelope's `Turn intent` will carry `(retreat reason: ...)`. Treat the cited upstream contract as the thing to fix — append replacement EPICs that address the reported gap instead of rewriting prior EPICs in place. A **Finalizer-retreat recall** (`Turn intent` prefix `(retreat reason: finalizer <slug> ...)`) means the just-finished cycle failed its cycle-end check against the plan; expect to revise the roster or EPIC coverage before Finalizer re-enters. If you cannot find a fix, emit **zero EPICs with `next-action: done`** — the orchestrator's Finalizer-retreat blocked-halt rule will halt the cycle and ask the user to intervene, which is preferable to padding with placeholder EPICs.
- **Defer-to-end continuation recall.** Triggered when every currently-live EPIC reached terminal while `planner-continuation: pending` was on state. The envelope's `Turn intent` will carry `(planner continuation: ...)`. Treat `Recent events` as your evidence base: the five most recent events.md lines summarize what the last batch actually produced. Plan the next batch against that evidence, not against a pre-cycle prediction.

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
note: upstream EP-1--domain-agent-design must stay ahead at the same stage gates. Derived from .harness/cycle/user-request-snapshot.md:L18 "Login must use a third-party OAuth2 flow."
```

`current` and `note` are shown here only to illustrate how the orchestrator stores the summary. The planner itself emits `outcome / upstream / why / roster`.

## Evaluation Criteria

- Each EPIC describes one objective outcome rather than a task checklist.
- `why` points to a concrete goal line when available, or to a quoted goal phrase when line numbering is unavailable.
- `roster` uses only registered producers.
- Every EPIC `roster` is a subsequence of the project's fixed global roster.
- `upstream` is treated as a same-stage gate.
- Each EPIC is producer-completable: it should not require planned self-deferral by the same producer to finish in-scope acceptance, verification, or evidence.
- Large surfaces are split into dependency-bearing product layers, and downstream EPICs can consume upstream artifacts through `Prior tasks` / `Prior reviews`.
- Blocked work goes to `Additional pairs required` instead of being emitted as fake executable EPICs.
- Re-planning is append-only.
- `next-action: continue` is used only for learned replanning (later EPIC shape truly depends on earlier execution); padding-style continuation is treated as a grading failure.
- On a defer-to-end continuation recall, `Recent events` from the envelope is cited as evidence for at least one newly emitted EPIC (or the turn cleanly resolves with zero new EPICs and `next-action: done`).
- On initial planning or same-intent expansion, emitted `why` lines cite `User request snapshot` line numbers when available, or quote the short `Goal` only when no full snapshot is supplied.
- Planner output contains no task file paths, no `Status`, no `Escalation`, and no control-plane fields other than the load-bearing `next-action`.

## Taboos

- Invent a local roster order for one EPIC.
- Put reviewers directly into `roster`.
- Treat `upstream` as a whole-EPIC completion dependency.
- Emit blocked work as if the missing pair already exists.
- Mutate an existing EPIC in place instead of appending a replacement.
- Overfill one planning turn with a rushed batch of EPICs instead of leaving continuation work for later.
- Include task file paths or `current` in planner output.
- Emit a whole-surface bucket such as "Build Home" when the producer would predictably need to checkpoint partial work for a later turn.
- Slice one product layer into several EPICs along producer-specialty lines (one EPIC per API/UI/test/doc team). The same outcome slice traversing multiple stages is one EPIC with a longer roster.
- Emit `next-action: continue` as padding ("I might need more later, not sure yet", "want more thinking time"). Continuation is for cases where execution evidence changes the later plan — not for reserving uncertainty. A pattern of continue turns that emit zero new EPICs trips the zero-emit safety and is a grading failure.
- Ignore `Recent events` on a defer-to-end recall. The whole point of defer-to-end is that events.md now carries evidence the initial turn could not see.

## Examples (BAD / GOOD)
Assume a visual-novel player project whose registered roster is:

```text
api-producer → game-producer → verification-producer → doc-producer
```

The goal asks for a production-grade Home route.

### BAD — whole-surface bucket that invites producer self-deferral

```text
EP-1--home-route
- outcome: Rebuild Home layout, header, discovery rails, account entry points, motion, all states, rendered evidence, and docs.
- upstream: none
- roster: api-producer → game-producer → verification-producer → doc-producer
```

The outcome is meaningful but too broad for one `game-producer` turn. It predicts a partial implementation followed by "finish evidence/tests next time", which wastes tokens because the next producer has to rediscover the same Home files.

### GOOD — dependent producer-completable outcome slices

```text
EPICs (this turn):

EP-1--home-layout-foundation
- outcome: Establish the Home route's responsive layout foundation, shared surface rhythm, and baseline loading/empty/error containers with rendered smoke evidence.
- upstream: none
- why: .harness/cycle/user-request-snapshot.md:L12 "Home should feel production-grade."
- roster: game-producer → verification-producer

EP-2--home-header-navigation
- outcome: Build the Home header, search/account affordances, and navigation handoff on top of the established Home layout foundation.
- upstream: EP-1--home-layout-foundation
- why: .harness/cycle/user-request-snapshot.md:L15 "Navigation hierarchy should be clear."
- roster: game-producer → verification-producer

Remaining: none
next-action: done
Additional pairs required: none
```

Each EPIC is a producer-completable product layer, not a phase label. `upstream` ensures downstream producers receive prior task/review artifacts as evidence, so the header work can reuse the layout decisions instead of re-reading the whole route from scratch.
