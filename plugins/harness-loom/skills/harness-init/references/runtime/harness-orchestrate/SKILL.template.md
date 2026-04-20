---
name: harness-orchestrate
description: "Use when `/harness-orchestrate <file.md>` is invoked, and invoke whenever the Hook re-enters the cycle. Owns `.harness/cycle/state.md` + `.harness/cycle/events.md`, dispatches exactly one producer per response (with 0, 1, or M reviewers in parallel), writes task/review files under `.harness/cycle/epics/`, pre-computes the next dispatch in the `state.md` `## Next` block, and yields with `loop: true`. Sole writer of `.harness/cycle/`."
user-invocable: true
---

# harness-orchestrate

## Design Thinking

Orchestration is **authority design plus judgment before execution**. This skill is the **canonical shared law (SSOT)** for the harness cycle rhythm, exclusive `.harness/cycle/` write authority, reviewed-work contract, phase advance, structural-issue handling, and the cycle-end doc-keeper dispatch, and it also carries orchestrator-only procedure: goal classification, `state.md`/`events.md` editing, one-producer-per-response dispatch, envelope assembly, **writing the next `## Next` block into state before yielding**, Hook re-entry, and retreat handling. Judgment about who runs next and what they should do happens **only at the end of the current turn**; the next turn executes the saved `Next` block exactly. The runtime workspace is split into **`.harness/loom/`** (canonical staging — skills, agents, `hook.sh`, `sync.ts`; seeded before the cycle and refreshed by `node .harness/loom/sync.ts`) and **`.harness/cycle/`** (runtime state — `state.md`, `events.md`, `epics/`; written exclusively by this orchestrator). Scheduling is built around a **project-global fixed roster order**: EPICs move through that shared stage sequence, may skip stages, and may block on upstream EPICs at the same stage gate. Subagents do not need the full law. They only need envelope-field reading and output shape, and that reduced background is injected through `harness-context`. Script/prompt boundary: setup, sync, and hook tooling are outside this skill and must not be re-explained here.

## Methodology

### 1. Semantic Contract

#### `state.md` / `events.md` shape

The canonical schema for both files is split into references. Before editing either file, the orchestrator cites those references to lock the shape for the current turn.

- `references/state-md-schema.md` — the three-line header (`Goal` / `Phase` / `loop`), the `## Next` block (`To` / `EPIC` / `Task path` / `Intent` / `Prior tasks` / `Prior reviews`), the `## EPIC summaries` structure (one `### EP-N--slug` heading plus `outcome` / `roster` / `current` / `note`), and the mutation rule (append-only, with terminal `current` states `done|superseded`)
- `references/events-md-format.md` — the one-line format `<ISO-ts> T<id> <role> <outcome> — <note>` plus append cadence and the invariant that only the orchestrator writes the log

The Semantic Contract, Turn Algorithm, Interfaces, and Exceptional Paths in this skill all assume those references as the canonical shape source.

#### Authority Rules

- Every file under `.harness/cycle/` is written **only by the orchestrator**. That includes `state.md`, `events.md`, task files, and review files. `.harness/loom/` is canonical staging seeded before the cycle; the orchestrator reads from it but does not write into it. `.harness/_archive/` is written only during a goal-different reset (§Goal entry step 3), when the orchestrator moves the current cycle there before reseeding; no other flow touches `_archive/`. **Project documentation** (target root `*.md`, `docs/`) is written exclusively by the cycle-end `harness-doc-keeper-producer` turn per `../harness-doc-keeper/SKILL.md`; orchestrator code does not touch it, and no producer other than doc-keeper is given that write scope in its envelope.
- Producers and reviewers return only their Output Format blocks. They never write control-plane state directly. `Suggested next-work`, `Advisory-next`, and `Escalation` are advisory inputs; the orchestrator synthesizes the real `Next` block from them.
- Subagents run with `fork_context=false`. Conversation transcript, tool trace, and producer inner reasoning are never passed to reviewers. Reviewers judge **only one task file recorded on disk**.
- The orchestrator assembles the envelope. Subagents do not read `state.md` and infer routing themselves; they trust only Goal, Focus EPIC, Task path, Scope, Current phase, and Prior tasks/reviews supplied in the envelope.
- The planner is a meta-role with no paired reviewer. It leaves no task/review files and returns state-ready EPIC summaries only. The actual `state.md` write is still append-only and still orchestrator-owned.
- For a **reviewer-less producer turn**, the producer's own `Status: PASS|FAIL` line plus its `Self-verification` evidence is the verdict source. A producer FAIL is treated exactly as a reviewer FAIL would be (Phase advance rule 1, Rework). A `## Structural Issue` block from the producer is the only retreat trigger (Phase advance rule 2). No reviewer is dispatched and no review file is written.

#### Reviewed-Work Contract

One pair turn leaves the following files on disk; the orchestrator provides the paths in the envelope:

- **Task** (exactly 1) — `.harness/cycle/epics/EP-N--{slug}/tasks/T{id}--{task-slug}.md`. This is the producer artifact. It carries the main body, evidence, self-verification, and suggested-next-work.
- **Review** (0, 1, or M files) — `.harness/cycle/epics/EP-N--{slug}/reviews/T{id}--{task-slug}--{reviewer-name}.md`. The `{reviewer-name}` suffix keeps 1:M reviews collision-free. Each review contains PASS/FAIL plus criteria-cited evidence limited to that reviewer's axis. Reviewer-less producer-only groups (registered as `(no reviewer)`; see Roster lookup below) leave **0 review files** for the turn.

Reviewer-less means **"not subject to review"**, not **"passed without review"**. Reserve it for deterministic / auxiliary work (sync, format, mirror) whose correctness is already pinned by the producer's own self-verification. Generative / judgmental / creative work must stay paired so the reviewed-work contract remains the default trust source.

Rework never overwrites the same task id. The orchestrator allocates a fresh `T<id>`, leaving the previous task and all related reviews intact. Structural retreat follows the same rule. The planner is the only exception: it leaves no task/review files, so its trail is the `events.md` entry plus the `state.md` EPIC summary diff.

#### Global roster lookup — stage order plus pair vs reviewer-less

This skill's own `## Registered pairs` section (see below) is an **ordered list**. Its line order is the project's global roster order. That order is curated at pair-authoring time: pair registration may insert a new line before or after an existing anchor instead of treating add chronology as meaningful. When `Next.To` resolves to a producer slug, the orchestrator finds the matching line in that section and treats that line number as the producer's global stage index. Three line shapes exist:

- 1:1 — `- <pair>: producer \`<p>\` ↔ reviewer \`<r>\`, skill \`<s>\``
- 1:M — `- <pair>: producer \`<p>\` ↔ reviewers [\`<r1>\`, \`<r2>\`], skill \`<s>\``
- 1:0 (reviewer-less) — `- <pair>: producer \`<p>\` (no reviewer), skill \`<s>\``

The **load-bearing tokens** are the `↔` arrow (present iff a reviewer roster exists) and the literal `(no reviewer)` marker (present iff reviewer-less). The orchestrator treats a roster line as reviewer-less when it lacks `↔` and contains the substring `(no reviewer)`; otherwise it dispatches the reviewer set parsed from the `↔ ...` segment. No other line shape is registered, so this two-token check is total. Because the list is ordered, the same lookup also answers "what global roster position is this producer?"

### 2. Turn Algorithm

#### Turn rhythm (one response = consume `Next`, produce the next `Next`)

The execution order of one orchestrator response is fixed:

1. Read `references/state-md-schema.md` and `references/events-md-format.md` first, so the read/write shape for this turn is locked.
2. At turn start, **always write `loop: false` into `state.md` first** to lock out re-entry. Codex/Gemini hooks may also fire on subagent completion, so this lock is the first write of every orchestrator turn whether or not `Next` exists.
3. Read `state.md` and inspect the `## Next` block. If it is empty or absent, branch to Cold start / Halt under Exceptional Paths.
4. Assemble the `Next` block into an envelope and dispatch `Next.To` with `fork_context=false`. Before envelope assembly, perform the Roster lookup (Section 1) on `Next.To` so the turn knows whether it is a paired producer, a reviewer-less producer, or the planner.
   - **4-a. Producer turn** — if `Next.To != planner`, write the returned artifact into `Next.Task path`.
   - **4-b. Planner turn** — if `Next.To == planner`, do not create task/review files. Append the planner's `EPICs (this turn)` block into `state.md` `## EPIC summaries`, and write one planner result line into `events.md`. If `Additional pairs required` is non-empty, append it as a separate orchestrator note in `events.md` so it can flow back into future planner recalls through `Recent events`.
5. Handle the reviewer branch.
   - **5-a. Planner turn** — skip reviewer dispatch and jump to step 8. The planner has no reviewer.
   - **5-b. Paired producer turn (1:1 or 1:M)** — dispatch the paired reviewer(s) **in parallel within the same response**. For 1:M, send all M reviewer calls together. They are independent and receive no producer transcript, so parallelism is safe.
   - **5-c. Reviewer-less producer turn (1:0)** — skip reviewer dispatch entirely. The producer's own `Status: PASS|FAIL` plus `Self-verification` evidence and any `## Structural Issue` block stand in for the reviewer envelope. Do **not** synthesize a placeholder reviewer call.
6. On paired producer turns, write each reviewer return into `.harness/cycle/epics/EP-N--{slug}/reviews/T<id>--<task-slug>--<reviewer-name>.md`. On reviewer-less producer turns, write **no review file**; the producer task file is the only artifact for the turn.
7. Aggregate the verdicts.
   - **7-a. Paired (1:1 / 1:M)** — `all PASS -> PASS`, `any FAIL -> FAIL` with merged rework reasons, and `any structural -> Retreat` with the most-upstream structural report winning. Ties break by first-received.
   - **7-b. Reviewer-less (1:0)** — read the producer's own Output Format. `Status: PASS` -> PASS; `Status: FAIL` -> FAIL with the producer's stated reasons as rework reasons; a `## Structural Issue` block -> Retreat. The reviewed-work contract is preserved because reviewer-less is "not subject to review" (see Reviewed-Work Contract), not "passed without review".
8. **Synthesize the next `Next` block**.
   - **8-a. Planner turn** — new EPICs start with the first producer in their roster slice as `current`. Then compute the **ready set**: live EPICs whose current producer is runnable because every upstream EPIC has already advanced beyond that same global roster position (or is terminal). Seed the next dispatch from the ready EPIC with the smallest global roster position; ties break by smaller EPIC number. If all EPICs are terminal, branch to halt. If the planner emitted **no executable EPICs** and only `Additional pairs required`, also halt: clear `Next`, keep `loop: false`, and tell the user to extend the harness with the required producers (paired or reviewer-less) and re-run `/harness-orchestrate <goal.md>`. If live EPICs exist but the ready set is empty, synthesize a planner recall instead of dispatching a blocked stage: `Next.To = planner`, `Next.EPIC = (none)`, `Next.Intent = (retreat reason: no ready EPIC at the current dependency gates). Repair the upstream graph or roster slices so at least one live EPIC becomes ready.`, `Next.Prior tasks = []`, and `Next.Prior reviews = []`.
   - **8-b. Producer turn (paired or reviewer-less)** — apply the Phase advance rules below using the aggregated verdict from step 7-a / 7-b.
9. Update the `Next` block, the `Phase` header, and the current EPIC `current` field in `state.md`, then append this turn's events to `events.md`. Paired turn: one producer entry plus M reviewer entries plus any orchestrator note. Reviewer-less turn: one producer entry (carrying the producer's own PASS/FAIL) plus any orchestrator note; no reviewer line is appended.
10. **Halt prep — cycle-end doc-keeper dispatch**. If every EPIC is terminal (`done` / `superseded`) and the just-finished turn was not the doc-keeper, do **not** halt yet. Synthesize a reviewer-less `Next` targeting the `harness-doc-keeper-producer` under a synthetic `_doc-keep` EPIC slot (follow the normal `.harness/cycle/epics/<EP>/tasks/T<id>--<slug>.md` path shape), yield, and let Hook re-entry run it as a standard reviewer-less producer turn (steps 5-c, 7-b). Cap doc-keeper rework at one attempt so documentation drift never blocks cycle halt; after PASS, or after the cap is reached, halt for real. A structural-issue block from the doc-keeper triggers retreat per Phase advance rule 2.
11. Only if a valid next dispatch exists (including the doc-keeper slot from step 10), raise `loop: true` and yield. Otherwise clear `Next`, keep `loop: false`, and stop.

One response dispatches exactly one producer (its reviewer set may be 0, 1, or M in parallel). Planner exceptions exist only in steps 4-b, 5-a, and 8-a. Reviewer-less exceptions exist only in steps 5-c, 6, 7-b, and 9. `loop` always goes false at turn start and only goes true again at turn end after a valid new `Next` has been committed.

#### Phase advance — synthesizing the next `Next`

This section applies only to **producer turns** (paired 1:1, paired 1:M, and reviewer-less 1:0). Planner turns are handled by Turn Algorithm step 8-a. The verdict source is the reviewer set for paired turns and the producer's own `Status` for reviewer-less turns (see Turn Algorithm step 7). All judgment happens **once at the end of the current turn**, and the result is written into `state.md` `## Next`.

`Next` fields (`To / EPIC / Task path / Intent / Prior tasks / Prior reviews`) follow the schema in `references/state-md-schema.md`. The four outcomes are:

1. **Rework** — verdict is FAIL: keep the same producer and EPIC; carry the FAIL reasons as `Intent` (for 1:M merge reviewer reasons with axis tags; for reviewer-less use the producer's own `Status` reasons); attach the just-written task file plus any failing reviews as `Prior` context so the rework turn has its full baseline.
2. **Retreat (structural)** — a `## Structural Issue` block was raised (by a reviewer on paired turns, or inside the producer artifact on reviewer-less turns): set `To` to the most-upstream `Suspected upstream stage` (use `planner` when the issue spans EPIC scope), rewind the EPIC's `current` to that stage, carry the issue reason as `Intent`, and attach the latest artifact from the retreat target as `Prior` context.
3. **Forward advance (PASS)** — move the just-passed EPIC's `current` to the next producer in its roster slice (or `done` if the slice is exhausted). Then compute the **ready set** across live EPICs: a live EPIC is ready only when every upstream EPIC has already advanced beyond the candidate's current global roster position, or is terminal. Select the ready EPIC whose `current` sits at the smallest global roster position; ties break by smaller EPIC number. If live EPICs remain but the ready set is empty, recall the planner instead of dispatching a blocked stage — the planner's envelope should state the gate condition so it can repair upstream graph or roster slices.
4. **Halt (all terminated)** — every EPIC's `current` is `done` or `superseded`. Before clearing `Next`, run Turn Algorithm step 10 (cycle-end doc-keeper dispatch) if it has not yet fired; halt is allowed only after that turn completes (PASS, rework cap reached, or structural retreat resolved).

The `Phase` header is always an echo of `Next.To`. Rework keeps the same producer. Retreat rewinds `current` upstream. Forward advance moves `current` to the next producer in the EPIC's roster slice or to `done`. Global stage comparison always resolves against the ordered `## Registered pairs` list rather than against one EPIC's local slice length.

### 3. Interfaces

#### Dispatch envelope

Producers and reviewers run with `fork_context=false`, so they do not inherit transcript context. The orchestrator must carry global context into the prompt through the envelope.

Shared blocks:

- **Goal** — the `Goal (from X):` paragraph copied from `state.md`
- **Focus EPIC** — the `Next.EPIC` slug plus that EPIC's one-line `outcome`, or `(none)` / existing EPIC list for planner turns
- **Pair skill** — already injected through `skills:` frontmatter, but still named in one line as `rubric: skills/<slug>/SKILL.md`
- **Task path** — copied from `Next.Task path`
- **Scope** — one sentence defining allowed file/path surfaces for this turn, synthesized from the pair skill's scope
- **Current phase** — copied from `Next.Intent`; this is the field that tells the subagent what to do now
- **Axis (reviewer only)** — in a 1:M pair, each reviewer envelope names the grading axis owned by that reviewer. In 1:1 it may be omitted or set to `Axis: (entire pair)`. Reviewer-less producer turns omit the reviewer envelope entirely (no reviewer is dispatched), so `Axis` does not apply.

Variable blocks:

- **Prior tasks** — array copied from `Next.Prior tasks`
- **Prior reviews** — array copied from `Next.Prior reviews`

Planner-only additions:

- **Existing EPICs** — the full `## EPIC summaries` block from `state.md`
- **Recent events** — the last five lines of `events.md`
- **Registered roster** — the full `## Registered pairs` block from this SKILL, copied verbatim so the planner can author EPIC roster slices without reading any other SKILL file

Subagents trust only the envelope. They do not read `state.md` and infer routing. Reviewers judge only one task file plus the pair skill; they do not inspect producer transcript or tool trace.

#### Context propagation

Each pair agent frontmatter `skills:` declares the shared pair skill plus `harness-context`, so both are auto-injected at dispatch. The envelope carries only what those skills do not cover: Goal, Focus EPIC, Task path, Scope, Current phase, and Prior artifacts. The full shared law and routing rules in this skill are not injected into subagents because those are not subagent concerns.

#### Structural Issue handling

When a producer or reviewer detects an upstream contract failure that **cannot be solved inside the current pair**, the review file must report it in the shape below. The same shape is repeated in `harness-context`.

```markdown
## Structural Issue

- Suspected upstream stage: {producer name}
- Blocked contract: {what cannot be satisfied}
- Why this pair cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream producer should revisit}
```

Use this when: (a) the current artifact depends on an upstream artifact that is invalid, (b) the pair contract itself is wrong, or (c) an agent-skill mismatch makes downstream work impossible.
Do not use this when: ordinary reviewer FAIL feedback can still be resolved by re-dispatching the same producer.

### 4. Exceptional Paths

#### Cold start / Halt

- **Cold start** — if `state.md` has no `Next` block and no EPIC summaries yet, treat the turn as a cold start. `loop: false` has already been written at the top of the turn. As the first action, synthesize the initial `Next`: `To: planner`, `EPIC: (none)`, `Intent: read the full goal.md and decompose it into EPICs`, then execute it in the same turn. Only raise `loop: true` at the end if a valid next dispatch exists.
- **Manual halt / terminal halt** — if the user manually clears the `Next` block, halt immediately. Automatic halt follows Phase advance rule 4. Both keep `loop: false` and the Hook does not re-enter.

#### Goal-anchored entry

When `/harness-orchestrate <filename.md>` is invoked:

1. Read `<filename.md>` and treat the **entire trimmed body** as the Goal string. Do not require load-bearing headers such as `# Goal` or `## Constraints`.
2. Compare it semantically to the existing `Goal (from X):` in `state.md` and pick the lightest action that keeps the cycle honest: a matching (or empty) prior goal means no-op — continue from the current `Next`; a clearly different intent or domain means **reset** (see step 3); anything in between (scope expanded, detail added, but same intent) means planner recall — replace `Next` with a planner dispatch and let the planner append new EPICs or supersede old ones without mutating existing EPIC fields.
3. **Reset procedure — performed directly by the orchestrator, all in the current response**:
   a. Create `.harness/_archive/<ISO-timestamp>/` (timestamp down to seconds; append `--<kebab-slug>` only if two resets collide within the same second).
   b. Move `.harness/cycle/state.md`, `.harness/cycle/events.md`, and `.harness/cycle/epics/` into that archive directory. `.harness/loom/` stays untouched; project documentation (target root `*.md`, `docs/`) is not part of the cycle trace and must not be archived.
   c. Write a fresh `.harness/cycle/state.md` per `references/state-md-schema.md` with: the new goal body quoted verbatim under `Goal (from <filename.md>)`, `Phase: planner`, `loop: false`, and a Cold-start `## Next` block (`To: planner`, `EPIC: (none)`, `Task path: (assigned on first planner dispatch)`, `Intent: read the full goal and decompose it into EPICs`, empty `Prior tasks` / `Prior reviews`). Leave `## EPIC summaries` empty.
   d. Write a fresh `.harness/cycle/events.md` whose first line is `<ISO-timestamp> T0 orchestrator archive — reset to new goal (from <filename.md>)`.
   e. Re-enter §Cold start **in the same response**: dispatch the planner, synthesize the follow-up `Next`, and raise `loop: true` at turn end. Do not stop the response at step 3-d — the fresh `loop: false` on disk is the turn-start lock, not a halt signal, and ending here would leave the new goal stalled until a manual re-invocation.
4. This classification is the orchestrator's semantic judgment. The Hook re-entry environment has no interactive channel, so do not ask the user for confirmation.

#### Hook re-entry

Hook (`.harness/loom/hook.sh`) checks whether `.harness/cycle/state.md` has `loop: true` and, if so, re-invokes `/harness-orchestrate`. The slash command is hard-coded at install time and is not read from `state.md`. The Hook is a re-entry mechanism, not a cadence driver. Every response ends with `state.md` write-back, especially the next `Next` block, and then yield.

## Evaluation Criteria

- The description includes both `/harness-orchestrate <file.md>` and Hook re-entry trigger vocabulary in active form.
- The body assumes the shapes from `references/state-md-schema.md` and `references/events-md-format.md` without duplicating those schemas inline.
- The Phase advance rules fill the `Next` block field set (`To` / `EPIC` / `Task path` / `Intent` / `Prior tasks` / `Prior reviews`) deterministically.
- The three guarantees one-pair-per-response, Phase advance synthesized **once at end of turn**, and next turn executes `Next` **as written** read as one connected flow inside the Turn Algorithm.
- The ready-set rule is explicit: upstream EPICs gate the same global roster position before a downstream EPIC may run that stage.
- The global-roster selection rule is explicit: smallest global roster position first among ready EPICs, then smallest EPIC number.
- Exceptional Paths make Cold start, Hook re-entry, and the three goal-entry branches (no-op / refine / reset) easy to find.
- Script/prompt boundary is preserved: setup/sync/hook implementation details are not duplicated here.
- `Authority Rules`, `Reviewed-Work Contract`, and `Structural Issue handling` stay in this body so reviewers can grade them without outside citations.
- Planner meta-role exceptions, no-task-file output, and append-only EPIC mutation are all explicitly stated.
- Reviewer-less producer-only roster lookup, the `(no reviewer)` / missing-`↔` token rule, the 0-review-files outcome, and the producer-`Status`-as-verdict path (Turn Algorithm 5-c, 6, 7-b) are all stated in the body and gradeable without outside citations.
- Cycle-end doc-keeper dispatch is part of the Turn Algorithm (step 10, before Phase advance rule 4 fires), not optional planner work — the `harness-doc-keeper-producer` must run before halt as long as it has not yet completed for this terminal state.
- Context propagation states that subagents get `harness-context` rather than the full orchestrator law.
- Workspace split is explicit: `.harness/loom/` is canonical staging seeded before the cycle and refreshed by `node .harness/loom/sync.ts`, and `.harness/cycle/` is runtime state written exclusively by this orchestrator.

## Taboos

- Put pipe tables or cell-oriented formatting into `state.md`. The correct shape is header + `Next` block + headed EPIC list.
- Collapse all EPIC summaries into one prose blob that hides per-EPIC identity.
- Use numeric phase slugs. `Phase: skill-writer` is correct; `Phase: 1` is wrong.
- Dispatch more than one producer in a single response.
- Let a subagent write the `Next` block directly.
- Defer routing judgment to a later turn and leave `Next` empty or ambiguous this turn.
- Reuse a `T<id>` and erase the trace of rework.
- Re-explain setup/sync/hook tool internals inside this skill body.
- Ask the user for confirmation while classifying a goal change, or require marker headers in the goal markdown.
- Record planner output as task files. Planner updates only `state.md` `## EPIC summaries`.
- Mutate an existing EPIC's `outcome`, `roster`, or `upstream` in place. Mark it `superseded` and append a new EPIC instead.
- Compare EPIC progress by "local roster slot number" and ignore the project-global roster order.
- Treat `upstream` as a whole-EPIC completion gate instead of a same-stage global-roster gate.
- Move directly gradeable contract blocks such as `Authority Rules`, `Reviewed-Work Contract`, `Phase advance`, or `Structural Issue handling` out into references, leaving only a citation. Those must remain in the body for isolated grading.
- Copy phase advance, state schema, or Hook re-entry law into the subagent-facing `harness-context`. That is orchestrator-only noise.
- Synthesize a placeholder reviewer dispatch for a reviewer-less producer-only roster line, or write a zero-byte review file to "preserve symmetry". Reviewer-less means **0 review files for the turn**; the producer's own `Status` is the verdict.
- Treat reviewer-less as "passed without review". It is "not subject to review" — reserved for deterministic / auxiliary work; generative / judgmental work must stay paired.
- Skip the cycle-end doc-keeper step at halt. That step is what keeps project documentation (target root `*.md`, `docs/`) in sync with the cycle's activity; bypassing it lets terminal cycles drift away from the state the next cycle's planner will read.
- Write into `.harness/loom/` from the orchestrator. Loom is canonical staging seeded before the cycle; the orchestrator only writes under `.harness/cycle/`.

## Registered pairs

This section is the authoritative roster the orchestrator reads at dispatch time (see Roster lookup, Section 1). Registration tooling inserts, repositions, and removes lines here idempotently. The single pre-seeded entry below is part of the runtime seed so the cycle-end doc-keeper dispatch (Turn Algorithm step 10) has a roster line to look up on the very first cycle.

- harness-doc-keeper: producer `harness-doc-keeper-producer` (no reviewer), skill `harness-doc-keeper`

## References

- `references/state-md-schema.md` — canonical fields for the state header, `Next` block, and EPIC summaries
- `references/events-md-format.md` — canonical one-line events format and invariants
- `../harness-planning/SKILL.md` — planner rubric for EPIC decomposition and roster writing
- `../harness-context/SKILL.md` — reduced subagent-facing context skill for envelope reading, output shape, and taboos
- `../harness-doc-keeper/SKILL.md` — reviewer-less rubric for the cycle-end doc-keeper dispatch (Turn Algorithm step 10)
- `.harness/loom/hook.sh` — yield re-entry mechanism
