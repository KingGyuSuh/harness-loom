# state.md narrative schema

`.harness/cycle/state.md` is the readable runtime summary that the orchestrator reads and writes every turn. Its structure is a four-line header plus a `## Next` block plus an ordered `## EPIC summaries` list. `harness-orchestrate/SKILL.md` cites this file as the canonical schema when editing state, advancing phases, and deciding Cold start vs Halt.

## Canonical shape

```text
# Runtime State

Goal (from <filename.md>): <one-paragraph trimmed body>
Phase: <planner | pair-producer-slug | harness-finalizer>
loop: <true|false>
planner-continuation: <pending|none>

## Next
To: <planner | pair-producer-slug | harness-finalizer>
EPIC: <EP-N--slug | (none)>
Task path: <.harness/cycle/epics/... | .harness/cycle/finalizer/tasks/T<id>--cycle-end.md | (none)>
Intent: <one or two natural-language sentences; prepend "(retreat reason: ...)" on retreat, or "(planner continuation: ...)" on defer-to-end planner recall>
Prior tasks:
  - <path>
Prior reviews:
  - <path>

## EPIC summaries

### EP-1--<slug>
outcome: <one-sentence completion condition>
upstream: <EP-M--slug, ...> | none
roster: <producer1> → <producer3> → <producer5>
current: <producer-slug | done | superseded>
note: <progress state + evidence + goal.md:Lxx citation>

### EP-2--<slug>
outcome: ...
upstream: ...
roster: ...
current: ...
note: ...
```

## Field semantics

- **Goal** header — one paragraph containing the trimmed goal markdown body loaded through `/harness-orchestrate <file.md>`. Do not require load-bearing headers such as `# Goal`.
- **Phase** header — an echo of `Next.To`, used only to keep the current turn readable to humans. Numeric slugs are forbidden.
- **loop** header — Hook re-entry switch. The orchestrator writes `false` first at the start of every turn, and raises it to `true` only at the end of a turn that has committed a valid next dispatch.
- **planner-continuation** header — planner-owned defer-to-end flag. Written only from planner `next-action` (`continue` -> `pending`, `done` or absent -> `none`). Consumed when every live EPIC reaches terminal: `pending` recalls the planner, `none` enters the finalizer turn.
- **`## Next` block** — dispatch specification for the next turn. Even if it is empty or absent, the loop-lock rule is unchanged: the orchestrator is already in `loop: false` when it decides between Cold start and Halt.
  - `To` — the next runtime turn target
  - `EPIC` — `EP-N--slug`, or `(none)` for planner and finalizer turns
  - `Task path` — `(none)` for planner turns; canonical pair task path for Pair turns; canonical finalizer task path for Finalizer turns
  - `Intent` — one or two natural-language sentences. On retreat, prefix with `(retreat reason: ...)`. On a defer-to-end planner recall, prefix with `(planner continuation: ...)`.
  - `Prior tasks` / `Prior reviews` — arrays of previous artifact paths that will be attached into the next envelope
- **`## EPIC summaries` block** — one EPIC = one `### EP-N--slug` heading plus five fields: `outcome`, `upstream`, `roster`, `current`, and `note`. Pipe tables and prose blobs are forbidden.
  - `outcome` — one-sentence completion condition
  - `upstream` — same-stage gate set for ready-set computation, or `none`
  - `roster` — EPIC-specific subsequence of the project's global roster
  - `current` — current producer slug, or terminal state `done` / `superseded`
  - `note` — human-readable progress summary, blocker, or preserved evidence citation. Do not hide machine-critical `upstream` data here.

## Mutation rules

- All writes are orchestrator-exclusive. Subagents do not write the `Next` block or EPIC summary fields directly.
- The orchestrator writes `loop: false` first at turn start, and writes `loop: true` only at the end of a turn with a committed valid `Next`.
- EPIC mutation is append-only. Add new EPICs or mark old ones `superseded`, but never edit existing `outcome`, `upstream`, or `roster` fields in place.
- EPICs whose `current` is terminal (`done` or `superseded`) are excluded from dispatch.
- Ready-set computation reads `upstream` plus the global roster order: a live EPIC may run only when every `upstream` EPIC has already advanced beyond that same global roster position, or is terminal.
- EPIC summaries are ordered by ascending EPIC number.
