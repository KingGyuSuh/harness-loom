# events.md append format

`.harness/events.md` 는 append-only 이벤트 로그다. 한 이벤트 = 한 줄. orchestrator 가 매 턴 producer/reviewer 결과와 retreat 사유를 여기에 append 한다. 본 파일은 `harness-orchestrate/SKILL.md` 가 events.md write 시 인용하는 포맷 정본이다.

## Line format

```
<ISO-timestamp> T<id> <role> <outcome> — <note with task path>
```

- **timestamp** — ISO-8601 (`2026-04-18T13:02:11`). 초 단위까지.
- **T<id>** — task id. 같은 `T<id>` 를 재사용해 rework 흔적을 덮지 않는다. orchestrator 가 새 id 를 발급.
- **role** — producer slug / reviewer slug / `orchestrator` / `planner` 중 하나.
- **outcome** — `PASS` / `FAIL` / `retreat` / `install` / `archive` 등 단어 한 개.
- **note** — 산출 task 또는 review 파일 경로 포함. retreat 이면 `<from> → <to>; <reason>` 형태.

## Examples

```
2026-04-18T13:02:11 T003 skill-writer PASS — skills/auth/SKILL.md 초안; task epics/EP-01/tasks/T003--auth-skill.md
2026-04-18T13:04:57 T004 skill-reviewer FAIL — description-as-trigger 누락; review epics/EP-01/reviews/T003--auth-skill--skill-reviewer.md
2026-04-18T13:08:02 T005 orchestrator retreat — skill-writer → api-designer; OAuth refresh 계약 미정의
```

## Append cadence

- 한 orchestrator 응답당 보통 2~3줄 append: producer 결과 + reviewer 결과 + (필요 시) orchestrator note.
- planner 턴은 reviewer 가 없으므로 1~2줄 (planner 결과 + orchestrator note).
- retreat 발생 시 retreat 근거를 별도 한 줄로 명시 (`orchestrator retreat — <from> → <to>; <reason>`).

## Invariants

- append-only. 과거 라인 수정·삭제 금지 — 감사 경로를 깬다.
- one-event-per-line. 멀티라인 이벤트 금지.
- orchestrator 독점 write. subagent 는 events.md 를 건드리지 않는다.
