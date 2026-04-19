# state.md narrative schema

`.harness/state.md` is the readable summary that the orchestrator reads and writes every turn. Its structure is a three-line header plus a `## Next` block plus an enumerated `## EPIC summaries` list. `harness-orchestrate/SKILL.md` cites this file as the canonical schema when editing state, advancing phases, and deciding Cold start vs Halt.

## Canonical shape

```
# Runtime State

Goal (from <filename.md>): <one-paragraph trimmed body>
Phase: <producer slug echoed from Next.To>
loop: <true|false>

## Next
To: <producer-slug>
EPIC: <EP-N--slug>
Task path: .harness/epics/EP-N--slug/tasks/T<id>--<task-slug>.md
Intent: <one or two natural-language sentences; prepend "(retreat reason: ...)" on retreat>
Prior tasks:
  - <path>
Prior reviews:
  - <path>

## EPIC summaries

### EP-1--<slug>
outcome: <one-sentence completion condition>
roster: api-designer → skill-writer → test-writer
current: <producer-slug | done | superseded>
note: <progress state + evidence + goal.md:Lxx citation>

### EP-2--<slug>
outcome: ...
roster: ...
current: ...
note: ...
```

## Field semantics

- **Goal** header — one paragraph containing the trimmed goal markdown body loaded through `/harness-orchestrate <file.md>`. Do not require load-bearing headers such as `# Goal`.
- **Phase** header — an echo of `Next.To`, used only to make the current stage readable to humans. Numeric slugs are forbidden; `Phase: skill-writer` is correct.
- **loop** header — Hook re-entry switch. The orchestrator **writes `false` first at the start of every turn**, and raises it to `true` only at the end of a turn that has committed a valid next dispatch. Therefore it must always be `false` at the moment a subagent completes.
- **`## Next` block** — dispatch specification for the next turn. Even if it is empty or absent, the loop-lock rule is the same: the orchestrator is already in `loop: false` when it decides between cold start and halt.
  - `To` — the producer slug to dispatch next
  - `EPIC` — `EP-N--slug`, or `(none)` when dispatching planner
  - `Task path` — absolute contract shape `.harness/epics/EP-N--slug/tasks/T<id>--<task-slug>.md`
  - `Intent` — one or two natural-language sentences. On retreat, prefix with `(retreat reason: ...)`.
  - `Prior tasks` / `Prior reviews` — arrays of previous artifact paths that will be attached into the next envelope
- **`## EPIC summaries` block** — one EPIC = one `### EP-N--slug` heading plus four fields: `outcome`, `roster`, `current`, and `note`. Pipe tables and prose blobs are forbidden.
  - `current` is either a producer slug or a terminal state: `done` when the roster finishes, `superseded` when the planner replaces the EPIC and marks it retired.

## Mutation rules

- All writes are orchestrator-exclusive. Subagents do not write the `Next` block or the `current` field directly.
- The orchestrator writes `loop: false` first at turn start, and writes `loop: true` only at the end of a turn with a committed valid `Next`.
- EPIC mutation is **append-only**. Add new EPICs or mark old ones `superseded`, but never edit existing `outcome`, `roster`, or `upstream` fields in place.
- EPICs whose `current` is terminal (`done` or `superseded`) are excluded from dispatch.
- EPIC summaries are ordered by ascending EPIC number.
