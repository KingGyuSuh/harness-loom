# Runtime State

Goal (from {{GOAL_SOURCE}}): {{GOAL_BODY}}
Phase: planner
loop: false

## Next
To: planner
EPIC: (none)
Task path: (assigned on first planner dispatch)
Intent: goal.md 전체를 읽고 EPIC 목록 (최대 4개) 과 각 EPIC 의 roster 를 산출.
Prior tasks:
Prior reviews:

## EPIC summaries

아직 EPIC 이 없다. 첫 planner 턴이 EPIC 목록을 산출하면 orchestrator 가 이 블록을 아래처럼 **한 EPIC = 한 헤딩 + 4 필드** 형태로 누적한다. 표나 행 단위 테이블은 쓰지 않는다.

예시:

### EP-1--<kebab-outcome>
outcome: <한 문장 완료 조건>.
roster: <producer1> → <producer2> → <producer3>.
current: <producer-slug | done | superseded>.
note: <upstream·blocker·진행 상태 간단 요약; goal.md:Lxx 등 근거>.
