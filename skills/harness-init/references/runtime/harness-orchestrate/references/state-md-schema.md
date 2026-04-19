# state.md narrative schema

`.harness/state.md` 는 orchestrator 가 매 턴 읽고 쓰는 readable summary 다. 헤더 3줄 + `## Next` 블록 + `## EPIC summaries` 열거 구조. 본 파일은 `harness-orchestrate/SKILL.md` 가 state 편집·phase advance·Cold start/Halt 판단 시 인용하는 스키마 정본이다.

## Canonical shape

```
# Runtime State

Goal (from <filename.md>): <one-paragraph trimmed body>
Phase: <Next.To 의 producer slug — display>
loop: <true|false>

## Next
To: <producer-slug>
EPIC: <EP-N--slug>
Task path: .harness/epics/EP-N--slug/tasks/T<id>--<task-slug>.md
Intent: <자연어 한두 문장. retreat 이면 "(retreat 사유: ...)" 추가>
Prior tasks:
  - <경로>
Prior reviews:
  - <경로>

## EPIC summaries

### EP-1--<slug>
outcome: <한 문장 완료 조건>
roster: api-designer → skill-writer → test-writer
current: <producer-slug | done | superseded>
note: <진행 상태 · 근거 · goal.md:Lxx 인용>

### EP-2--<slug>
outcome: ...
roster: ...
current: ...
note: ...
```

## Field semantics

- **Goal** 헤더 — `/harness-orchestrate <file.md>` 호출 시 읽은 goal markdown 의 trimmed body 한 문단. load-bearing header (`# Goal` 등) 를 요구하지 않는다.
- **Phase** 헤더 — `Next.To` 의 에코. 사람 눈에 현재 단계가 보이게 하는 diagnostic 목적. 숫자 슬러그 금지 (`Phase: skill-writer` 가 정답).
- **loop** 헤더 — Hook 재진입 스위치. orchestrator 는 **매 턴 시작 시 먼저 `false` 로 내리고**, 유효한 다음 dispatch 를 state 에 확정한 턴 끝에서만 `true` 로 올린다. 따라서 subagent completion 시점에는 항상 `false` 여야 한다.
- **`## Next` 블록** — 다음 턴 dispatch 명세. 비어 있거나 부재해도 loop lock 규칙은 동일하다: orchestrator 는 이미 `loop: false` 상태에서 cold start 또는 halt 를 판정한다.
  - `To` — 다음에 디스패치할 producer slug.
  - `EPIC` — `EP-N--slug` 또는 planner 대상이면 `(none)`.
  - `Task path` — `.harness/epics/EP-N--slug/tasks/T<id>--<task-slug>.md` 절대 규약.
  - `Intent` — 자연어 한두 문장. retreat 이면 `(retreat 사유: ...)` 를 앞에 붙인다.
  - `Prior tasks` / `Prior reviews` — envelope 에 첨부될 이전 산출 경로 배열.
- **`## EPIC summaries` 블록** — 한 EPIC = 한 `### EP-N--slug` 헤딩 + 4 필드(`outcome`, `roster`, `current`, `note`). 파이프 테이블 금지, prose 덩어리 금지.
  - `current` 값은 producer slug 이거나 종결 상태 `done` (roster 완주) 또는 `superseded` (planner 가 새 EPIC 으로 대체 + 파기 마킹).

## Mutation rules

- 모든 write 는 orchestrator 독점. subagent 는 `Next` 블록이나 `current` 필드를 직접 쓰지 않는다.
- orchestrator 는 턴 시작 시 `loop: false` 를 먼저 기록하고, 유효한 `Next` 를 확정한 턴 끝에서만 `loop: true` 를 기록한다.
- EPIC mutation 은 **append-only**. 신규 EPIC 추가 또는 기존 EPIC `superseded` 마킹만 허용. 기존 EPIC 의 `outcome`/`roster`/`upstream` 필드 in-place 수정 금지.
- `current` 가 종결 상태(`done` 또는 `superseded`)인 EPIC 은 dispatch 대상에서 제외.
- EPIC 요약 순서는 EP 번호 오름차순.
