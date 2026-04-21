---
name: harness-orchestrate
description: "Use when `/harness-orchestrate <file.md>` is invoked or when Hook re-enters the cycle. Owns `.harness/cycle/state.md` + `.harness/cycle/events.md`, executes exactly one runtime turn per response, persists pair/finalizer artifacts, synthesizes the next dispatch in `state.md` `## Next`, and yields with `loop: true` only when another turn exists. Sole writer of `.harness/cycle/`."
user-invocable: true
---

# harness-orchestrate

## Design Thinking

Every response executes exactly one of three runtime turn kinds:

- **Planner** — singleton control turn. Plans or replans EPICs. Leaves no task or review files.
- **Pair** — registry stage from `.harness/loom/registry.md`. Every registered pair runs under the same execution law: one producer plus one or more reviewers.
- **Finalizer** — singleton cycle-end turn. One agent, no reviewer, verdict from its own `Status` plus `Self-verification`.

The orchestrator does not do domain work itself. It reads the saved `Next`, dispatches exactly one turn, persists that turn's artifacts, computes the next `Next`, and yields. Hook is only the re-entry trigger. The orchestrator's job is to keep the cycle deterministic, auditable, and moving.

### Quick Map

Read the runtime in this order:

1. On direct `/harness-orchestrate <file.md>` entry, run Goal-anchored entry first; on Hook re-entry, resume from saved state.
2. Consume the saved `Next` and dispatch exactly one turn: Planner, Pair, or Finalizer.
3. Persist that turn's artifacts and verdict.
4. Synthesize the next `Next`, or halt with `loop: false`.

For a compact DFA diagram and transition table, see `references/state-machine.md`. For the exact dispatch-envelope payload, see `references/dispatch-envelope.md`.

## Methodology

### 1. Runtime contract

The workspace has two halves:

- `.harness/loom/` — harness definitions: skills, agents, `registry.md`, `hook.sh`, `sync.ts`
- `.harness/cycle/` — runtime state: `state.md`, `events.md`, `epics/`, and `finalizer/`

Read the canonical runtime references at the start of every turn before editing state:

- `references/state-md-schema.md` — header, `## Next`, and `## EPIC summaries`
- `references/events-md-format.md` — append-only events line format

#### Authority Rules

- Only the orchestrator writes under `.harness/cycle/`. `.harness/loom/` is read-only for the orchestrator. `.harness/_archive/` is touched only by goal reset under §Entry, reset, and halt paths.
- Out-of-cycle write scope (target root `*.md`, `docs/`, release artifacts, audit output, etc.) is reserved for the finalizer turn and declared in that agent's own `Scope`.
- Subagents may return supporting body or evidence before their concluding Output Format block. The orchestrator parses the turn result from that concluding block plus any top-level `## Structural Issue` block.
- `Suggested next-work`, `Advisory-next`, and `Escalation` are advisory only. The orchestrator synthesizes the real `Next`.
- Subagents run with `fork_context=false`. Reviewers judge the disk artifact plus concrete disk evidence; they never see producer transcript, tool trace, or another reviewer's verdict.

#### Pair turn contract

One Pair turn always follows the same artifact law, regardless of which registered pair slug is running.

- **Task** (exactly 1) — `.harness/cycle/epics/EP-N--{slug}/tasks/T{id}--{task-slug}.md`
- **Review** (1 or M files) — `.harness/cycle/epics/EP-N--{slug}/reviews/T{id}--{task-slug}--{reviewer-name}.md`

Producer artifacts may include domain body and evidence, but must end with the producer Output Format block. Reviewer artifacts may include supporting rationale, but must end with the reviewer Output Format block. A `## Structural Issue` block belongs in the review artifact when the reviewer judges the issue as structural.

Rework never overwrites the same task id. The orchestrator allocates a fresh `T<id>` so the previous task and reviews remain on disk. Structural retreat follows the same rule.

#### Finalizer turn contract

The finalizer is a singleton cycle-end turn, not a registered pair.

- **Task** (exactly 1) — `.harness/cycle/finalizer/tasks/T{id}--cycle-end.md`
- **Review** — none

The finalizer artifact may include supporting body and evidence, but must end with the finalizer's concluding producer-shaped block. Verdict source is the finalizer's own `Status: PASS|FAIL` line plus its `Self-verification` block; a top-level `## Structural Issue` block signals RETREAT. FAIL or RETREAT routes to planner recall, not in-place rework.

The finalizer is dispatched only when every live EPIC is terminal and `planner-continuation: none`.

#### Registry contract

`.harness/loom/registry.md` is the sole source of truth for the pair roster. It contains only Pair stages, never the planner or finalizer. Two line shapes exist:

- 1:1 — `` - <pair>: producer `<p>` ↔ reviewer `<r>`, skill `<s>` ``
- 1:M — `` - <pair>: producer `<p>` ↔ reviewers [`<r1>`, `<r2>`], skill `<s>` ``

The `↔` arrow is load-bearing. When `Next.To` resolves to a pair producer slug, the orchestrator finds the matching registry line and uses that line's position as the producer's global stage index.

The planner and finalizer are singleton turns:

- `Next.To = planner` dispatches `.harness/loom/agents/harness-planner.md`
- `Next.To = harness-finalizer` dispatches `.harness/loom/agents/harness-finalizer.md`

### 2. One-turn algorithm

On direct `/harness-orchestrate <file.md>` invocation, apply §Goal-anchored entry before consuming `Next`. On Hook re-entry, skip that gate and continue from the saved control plane.

#### Turn rhythm (one response = consume `Next`, produce the next `Next`)

1. Read `references/state-md-schema.md` and `references/events-md-format.md` first so the read/write shape is locked.
2. Write `loop: false` into `state.md` first to lock out re-entry. Codex and Gemini hooks may fire on subagent completion, so this lock is the first write of every turn whether or not `Next` exists.
3. Read `state.md` and inspect `## Next`. If empty or absent, branch to Cold start / Halt under §Entry, reset, and halt paths.
4. Classify `Next.To`:
   - `planner` → Planner turn
   - `harness-finalizer` → Finalizer turn
   - anything else → Pair turn via registry lookup in `## Registered pairs` (missing slug is an error)
5. Assemble the dispatch envelope and run the turn with `fork_context=false`.
6. Persist artifacts by turn kind:
   - **Planner** — no task/review files. Absorb the planner output into `## EPIC summaries` and append one planner result line into `events.md`. If `Additional pairs required` is non-empty, append a separate orchestrator note so the request survives into future planner recalls through `Recent events`.
   - **Pair** — write the producer artifact into `Next.Task path`, then dispatch the paired reviewer(s) in parallel within the same response. Write each reviewer artifact into its review path.
   - **Finalizer** — write the finalizer artifact into `Next.Task path`. No reviewer dispatch, no review file.
7. Extract the verdict:
   - **Planner** — no aggregation; the only control input is `next-action`
   - **Pair** — `all PASS -> PASS`, `any FAIL -> FAIL`, `any Structural Issue -> RETREAT` (most-upstream issue wins; ties break by first-received)
   - **Finalizer** — `Status: PASS -> PASS`, `Status: FAIL -> FAIL`, `## Structural Issue -> RETREAT`
8. Synthesize the next `## Next` block using the branch rules below.
9. Update `state.md` and append `events.md` lines. Raise `loop: true` only if a valid next dispatch exists. Otherwise clear `Next`, keep `loop: false`, and stop.

#### Planner branch

After a planner turn:

1. Absorb each emitted EPIC into `## EPIC summaries` with five stored fields: `outcome`, `upstream`, `roster`, `current`, and `note`.
2. Initialize `current` for each newly appended EPIC to the first producer in its `roster`.
3. Fold `why` into `note` together with any progress or blocker summary the orchestrator needs to preserve for humans.
4. Read `next-action` into `planner-continuation`:
   - prefix `continue` -> `pending`
   - `done` or any non-`continue` value -> `none`
5. Compute the ready set. A live EPIC is ready at stage `S` only when every EPIC named in its `upstream` field has already advanced beyond that same global roster position, or is terminal. Choose the ready EPIC with the smallest global roster position; ties break by smaller EPIC number.
6. Zero-emit handling comes before any new dispatch:
   - only `Additional pairs required` and no executable EPICs -> halt directly: clear `Next`, keep `loop: false`, clear any pending continuation flag, and tell the user to extend the harness and re-run. This blocked halt does not run the finalizer.
   - finalizer FAIL/RETREAT recall with zero executable EPICs -> halt directly: clear `Next`, keep `loop: false`, and tell the user to fix the finalizer body or the plan. This cuts any infinite Finalizer -> Planner -> Finalizer loop the planner cannot repair.
   - defer-to-end continuation recall with zero new executable EPICs -> force `planner-continuation: none`, append one orchestrator note to `events.md`, and continue with terminal handling below.
7. If live EPICs remain and the ready set is non-empty, synthesize the next Pair dispatch from the selected EPIC.
8. If live EPICs remain and the ready set is empty, recall the planner instead of dispatching a blocked stage:
   - `Next.To = planner`
   - `Next.EPIC = (none)`
   - `Next.Task path = (none)`
   - `Next.Intent = (gate condition: ready set empty; repair upstream or roster slices against current state)`
9. If every live EPIC is terminal, apply Terminal resolution below.

#### Phase advance — Pair rules

The verdict source is the aggregated reviewer set.

1. **Rework (FAIL)** — keep the same EPIC and producer. Carry merged FAIL reasons as `Intent`, attach the just-written task file plus any failing reviews as `Prior`, and allocate a fresh pair task path in the same EPIC task directory.
2. **Retreat (structural)** — read `Suspected upstream stage`:
   - if it resolves to `planner`, synthesize a planner recall with `Task path: (none)` and attach the relevant task/review artifacts as `Prior`
   - otherwise rewind the EPIC's `current` to that producer, carry the structural reason as `Intent`, attach the retreat-target artifacts as `Prior`, and allocate a fresh pair task path for the rewound producer
3. **Forward advance (PASS)** — move the current EPIC to the next producer in its roster slice, or `done` if the slice is exhausted. Recompute the ready set across every live EPIC. If the ready set is non-empty, dispatch the ready EPIC with the smallest global roster position. If live EPICs remain but the ready set is empty, recall the planner with `Task path: (none)` and an `Intent` that names the gate condition. If no live EPICs remain, apply Terminal resolution below.

`Phase` always echoes `Next.To`. Global stage comparison always resolves against the ordered registry, never against a per-EPIC local slot number.

#### Terminal resolution

Apply this rule whenever a Planner or Pair turn leaves every live EPIC terminal (`done` or `superseded`):

- `planner-continuation: pending` — planner continuation recall: `Next.To = planner`, `Next.EPIC = (none)`, `Next.Task path = (none)`, `Next.Intent = (planner continuation: planning deferred until all live EPICs reached terminal — re-plan against execution evidence in events.md)`
- `planner-continuation: none` or absent — finalizer entry: `Next.To = harness-finalizer`, `Next.EPIC = (none)`, `Next.Task path = .harness/cycle/finalizer/tasks/T{id}--cycle-end.md`, `Next.Intent = (cycle-end finalizer)`

#### Phase advance — Finalizer rules

1. **PASS** — cycle complete. Clear `Next`, keep `loop: false`, stop. Hook does not re-enter.
2. **FAIL or RETREAT** — planner recall:
   - `Next.To = planner`
   - `Next.EPIC = (none)`
   - `Next.Task path = (none)`
   - `Next.Intent = (retreat reason: finalizer reported <FAIL summary or Structural Issue>)`
   - `Prior tasks = [<latest finalizer task path>]`
   - `Prior reviews = []`

Do not touch `planner-continuation` in this branch. The recovery loop is bounded by the Finalizer-retreat blocked halt in the Planner branch above.

### 3. Dispatch interfaces

#### Dispatch envelope

Subagents run with `fork_context=false`, so the envelope is the only runtime payload they should trust for this turn.

Every envelope includes `Goal`, `Focus EPIC`, `Task path`, `Scope`, `Current phase`, `Prior tasks`, and `Prior reviews`. Reviewers may also receive `Axis`. Pair turns include the rubric path. Planner turns add `Existing EPICs`, `Recent events`, and `Registered roster`. Finalizer turns omit reviewer-only and pair-only fields.

The exact block descriptions and per-turn envelope shape live in `references/dispatch-envelope.md`.

#### Context propagation

- Pair agents list the pair skill plus `harness-context`
- The planner lists `harness-planning` plus `harness-context`
- The finalizer lists `harness-context` only

No branch should rely on hidden side references or unstated runtime context.

#### Structural Issue handling

When a Pair reviewer or the Finalizer detects an upstream contract failure that cannot be resolved inside the current turn, the artifact reports it in this shape:

```markdown
## Structural Issue

- Suspected upstream stage: {producer name | planner}
- Blocked contract: {what cannot be satisfied}
- Why this role cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream stage should revisit}
```

Use when: (a) an upstream artifact is invalid, (b) the pair contract itself is wrong, (c) an agent-skill mismatch makes downstream work impossible, or (d) a finalizer's cycle-end check fails against the planned outcome. `Suspected upstream stage: planner` is correct when the fault is in the plan.

Do **not** use when ordinary same-role rework is enough.

### 4. Entry, reset, and halt paths

#### Cold start / Halt

- **Cold start** — `state.md` has no `Next` block and no EPIC summaries. `loop: false` is already written. Synthesize the initial planner dispatch with `To: planner`, `EPIC: (none)`, `Task path: (none)`, `Intent: read the full goal and decompose it into EPICs`, then execute it in the same response.
- **Manual / terminal halt** — if the user manually clears `Next`, halt immediately. Automatic halt follows Terminal resolution and Finalizer rule 1. All halt paths keep `loop: false`.

#### Goal-anchored entry

When `/harness-orchestrate <filename.md>` is invoked:

1. Read `<filename.md>` and treat the entire trimmed body as the Goal. Do not require load-bearing headers such as `# Goal`.
2. Compare it to the existing `Goal (from X):` in `state.md` and choose the lightest honest action:
   - matching or empty -> no-op, continue from current `Next`
   - clearly different intent or domain -> reset
   - same intent with expanded scope or new detail -> planner recall
3. **Reset procedure — all in the current response**:
   - create `.harness/_archive/<ISO-timestamp>/` (append `--<kebab-slug>` only if two resets collide within the same second)
   - move `.harness/cycle/state.md`, `.harness/cycle/events.md`, `.harness/cycle/epics/`, and `.harness/cycle/finalizer/` into that archive
   - leave `.harness/loom/` untouched; finalizer out-of-cycle output at the target root is not part of the cycle trace and must not be archived
   - write a fresh `.harness/cycle/state.md` per `references/state-md-schema.md` with the new goal body, `Phase: planner`, `loop: false`, `planner-continuation: none`, and a Cold-start `## Next` block whose `Task path` is `(none)`
   - write a fresh `.harness/cycle/events.md` whose first line is `<ISO-timestamp> T0 orchestrator archive — reset to new goal (from <filename.md>)`
   - re-enter Cold start in the same response: dispatch the planner, synthesize the follow-up `Next`, and raise `loop: true` at turn end
4. This classification is the orchestrator's semantic judgment. The Hook re-entry environment has no interactive channel, so do not ask the user for confirmation.

#### Hook re-entry

`.harness/loom/hook.sh` checks whether `state.md` has `loop: true` and, if so, emits the platform-appropriate orchestrator invocation (`/harness-orchestrate` or `$harness-orchestrate`) for the next turn. Hook is a re-entry mechanism, not a cadence driver. Every response ends with `state.md` write-back and then yield.

## Evaluation Criteria

- Description surfaces both `/harness-orchestrate <file.md>` and Hook re-entry trigger vocabulary in active form.
- The body clearly separates the three runtime turn kinds: singleton Planner, registry Pair, singleton Finalizer.
- `references/state-md-schema.md` and `references/events-md-format.md` remain the canonical storage specs instead of being duplicated inline.
- `upstream` is preserved as an explicit stored EPIC field and is used in ready-set computation.
- `Task path` rules are explicit for all three turn kinds: planner `(none)`, pair canonical pair task path, finalizer canonical finalizer task path.
- Pair and finalizer artifact contracts explicitly allow supporting body plus a concluding parseable block.
- The Phase advance rules fill the `Next` block (`To / EPIC / Task path / Intent / Prior tasks / Prior reviews`) deterministically for every outcome.
- Finalizer entry (`all live EPICs terminal + planner-continuation: none`) and FAIL/RETREAT recovery back to planner are both explicit.
- Cold start, goal-entry branches, and Hook re-entry are easy to find under Entry, reset, and halt paths.

## Taboos

- Put pipe tables or row-oriented formatting into `state.md`.
- Collapse `## EPIC summaries` into one prose blob that hides per-EPIC identity.
- Use numeric phase slugs. `Phase: planner` or `Phase: skill-writer` is correct; `Phase: 1` is wrong.
- Dispatch more than one runtime turn in a single response.
- Let a subagent write the `Next` block directly.
- Leave `Next` empty or ambiguous when a deterministic next dispatch exists.
- Reuse a `T<id>` and erase the trace of rework.
- Re-explain setup, sync, or Hook implementation internals inside this skill body.
- Ask the user for confirmation while classifying a goal change, or require marker headers in the goal markdown.
- Record planner output as task files.
- Mutate an existing EPIC's `outcome`, `upstream`, or `roster` in place. Mark it `superseded` and append a new EPIC.
- Compare EPIC progress by local roster slot number instead of project-global roster order.
- Treat `upstream` as a whole-EPIC completion gate instead of a same-stage gate.
- Move directly gradeable contract blocks (`Authority Rules`, Pair turn contract, Finalizer turn contract, Phase advance, Structural Issue handling) out into references and leave only citations.
- Copy phase advance, state schema, or Hook re-entry law into the subagent-facing `harness-context`.
- Synthesize a reviewer dispatch for a finalizer turn, or write a zero-byte review file to preserve symmetry.
- Skip dispatching the finalizer when every live EPIC is terminal and `planner-continuation: none`.
- Rework a finalizer in place on FAIL. FAIL and RETREAT always route to planner recall.
- Write into `.harness/loom/` from the orchestrator.
- Embed the pair roster inside this SKILL body. It lives in `.harness/loom/registry.md`.
- Turn the finalizer into a list of agents. Multi-step cycle-end work belongs inside the finalizer body as sequential Task steps.

## References

- `references/state-md-schema.md` — canonical fields for the state header, `Next` block, and EPIC summaries
- `references/events-md-format.md` — canonical one-line events format and invariants
- `references/state-machine.md` — quick DFA diagram and transition table for scan-first reading
- `references/dispatch-envelope.md` — exact envelope payload by turn kind
- `../harness-planning/SKILL.md` — planner rubric for EPIC decomposition and roster writing
- `../harness-context/SKILL.md` — reduced subagent-facing context skill for envelope reading, output shape, and taboos
- `.harness/loom/registry.md` — sole source of truth for the pair roster
- `.harness/loom/agents/harness-finalizer.md` — cycle-end finalizer agent
- `.harness/loom/hook.sh` — yield re-entry mechanism
