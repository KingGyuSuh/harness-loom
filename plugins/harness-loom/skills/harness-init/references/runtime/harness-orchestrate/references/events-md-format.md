# events.md append format

`.harness/cycle/events.md` is an append-only event log. One event equals one line. The orchestrator appends producer/reviewer results and retreat reasons here every turn. `harness-orchestrate/SKILL.md` cites this file as the canonical write format for `events.md`.

## Line format

```
<ISO-timestamp> T<id> <role> <outcome> — <note with task path>
```

- **timestamp** — ISO-8601 such as `2026-04-18T13:02:11`, down to seconds
- **T<id>** — task id. Do not reuse the same `T<id>` and erase rework history; the orchestrator allocates new ids.
- **role** — one of a producer slug, reviewer slug, `orchestrator`, or `planner`
- **outcome** — one word such as `PASS`, `FAIL`, `retreat`, `install`, or `archive`
- **note** — includes the task or review file path; for retreat use `<from> → <to>; <reason>`

## Examples

```
2026-04-18T13:02:11 T003 skill-writer PASS — draft of skills/auth/SKILL.md; task epics/EP-1/tasks/T003--auth-skill.md
2026-04-18T13:04:57 T004 skill-reviewer FAIL — missing description-as-trigger; review epics/EP-1/reviews/T003--auth-skill--skill-reviewer.md
2026-04-18T13:08:02 T005 orchestrator retreat — skill-writer → api-designer; OAuth refresh contract undefined
```

## Append cadence

- One orchestrator response usually appends 2-3 lines: producer result, reviewer result, and an orchestrator note if needed.
- Planner turns append 1-2 lines because there is no reviewer: planner result plus an orchestrator note if needed.
- On retreat, write a dedicated retreat line such as `orchestrator retreat — <from> → <to>; <reason>`.

## Invariants

- append-only. Never modify or delete old lines; that breaks the audit path.
- one event per line. Multiline events are forbidden.
- orchestrator-exclusive write. Subagents do not touch `events.md`.
