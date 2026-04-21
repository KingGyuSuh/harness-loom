# events.md append format

`.harness/cycle/events.md` is an append-only event log. One event equals one line. The orchestrator appends planner results, pair results, finalizer results, and orchestrator notes here every turn. `harness-orchestrate/SKILL.md` cites this file as the canonical write format for `events.md`.

## Line format

```text
<ISO-timestamp> T<id> <role> <outcome> — <note>
```

- **timestamp** — ISO-8601 down to seconds
- **T<id>** — task id allocated by the orchestrator. Rework gets a fresh id; do not reuse ids.
- **role** — one of a pair producer slug, reviewer slug, `planner`, `harness-finalizer`, or `orchestrator`
- **outcome** — one word such as `PASS`, `FAIL`, `retreat`, `halt`, or `archive`
- **note** — concise human-readable summary. Include the artifact path when one exists; planner notes summarize emitted EPICs and `next-action` because planner turns have no task or review files.

## Examples

```text
2026-04-18T13:01:02 T001 planner PASS — appended EP-1--auth-flow, EP-2--audit-log; next-action done
2026-04-18T13:04:57 T002 backend-api-producer PASS — task .harness/cycle/epics/EP-1--auth-flow/tasks/T002--auth-api.md
2026-04-18T13:07:11 T002 backend-api-reviewer FAIL — review .harness/cycle/epics/EP-1--auth-flow/reviews/T002--auth-api--backend-api-reviewer.md
2026-04-18T13:22:44 T009 harness-finalizer PASS — task .harness/cycle/finalizer/tasks/T009--cycle-end.md
2026-04-18T13:22:45 T009 orchestrator retreat — harness-finalizer -> planner; cycle-end check failed against planned outcome
```

## Append cadence

- A **Planner turn** appends 1-2 lines: one planner result line plus an orchestrator note if needed.
- A **Pair turn** usually appends 2-(M+2) lines: one producer result line, M reviewer result lines, and an orchestrator note if needed.
- A **Finalizer turn** appends 1-2 lines: one finalizer result line plus an orchestrator note if needed.
- On retreat, write a dedicated orchestrator retreat line such as `<from> -> <to>; <reason>`.

## Invariants

- Append-only. Never modify or delete old lines.
- One event per line. Multiline events are forbidden.
- `events.md` is orchestrator-owned. Subagents do not write it directly.
