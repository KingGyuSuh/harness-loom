---
name: harness-orchestrate
description: "Use when `/harness-orchestrate <file.md>` is invoked, and invoke whenever the Hook re-enters the cycle. Owns `.harness/state.md` + `.harness/events.md`, dispatches exactly one producer+reviewer pair per response, writes task/review files under `.harness/epics/`, pre-computes the next dispatch in `state.md`의 `## Next` block, and yields with `loop: true`. Sole writer of `.harness/`."
user-invocable: true
---

# harness-orchestrate

## Design Thinking

오케스트레이션은 **권한 설계 + 판단 시점 이전**이다. 본 skill 이 하네스 공용 법(pair/cycle rhythm, `.harness/` write 독점, reviewed-work contract, phase advance, structural-issue 처리)의 **정본(SSOT)** 이며 orchestrator 전용 절차까지 담는다 — goal 분류, state.md/events.md 편집, 한 응답당 한 pair 디스패치, envelope 조립, **현재 턴 말미에 다음 Next 블록을 state 에 박기**, Hook 재진입, retreat 처리. 판단(누가 다음, 무엇을 시킬지) 은 항상 **이번 턴 말미에만** 일어나고, 다음 턴은 state 의 `Next` 를 그대로 실행한다. subagent 는 이 법을 알 필요가 없다 — envelope 필드 해석과 자기 출력 shape 만 알면 되고, 그 배경은 `harness-context` skill 에 축소판으로 주입된다. script/prompt 경계: init·sync·hook 은 번들 스크립트의 책임이며 본문에서 내부 구현을 재서술하지 않는다.

## Methodology

### 1. Semantic Contract

#### state.md / events.md shape

두 파일의 스키마 정본은 references 로 분리한다. orchestrator 는 매 턴 두 파일을 열어 편집하기 전에 해당 references 를 인용해 shape 을 확인한다.

- `references/state-md-schema.md` — 헤더 3줄(Goal/Phase/loop) + `## Next` 블록(To/EPIC/Task path/Intent/Prior tasks/Prior reviews) + `## EPIC summaries`(`### EP-N--slug` 헤딩 + outcome/roster/current/note 4 필드) 구조와 mutation rule(append-only, `current` 종결 상태 `done|superseded`).
- `references/events-md-format.md` — `<ISO-ts> T<id> <role> <outcome> — <note>` 한 줄 포맷과 append cadence, orchestrator 독점 write invariant.

본 skill 본문의 Semantic Contract · Turn Algorithm · Interfaces · Exceptional Paths 는 위 두 references 를 shape 정본으로 전제한다.

#### Authority Rules

- `.harness/` 하위 모든 파일은 **오직 orchestrator** 가 쓴다. state.md, events.md, task 파일, review 파일 모두 포함.
- producer·reviewer 는 자기 Output Format 블록만 반환한다. `Next` 블록이나 `current` 필드 등 control-plane 상태를 직접 쓰지 않는다. `Suggested next-work`, `Advisory-next`, `Escalation` 은 **권고** 이며 orchestrator 가 합성해 실제 `Next` 를 만든다.
- subagent 는 `fork_context=false` 로 실행된다. 대화 전사·tool trace·producer 내부 추론은 reviewer 에게 전달되지 않는다. reviewer 는 **disk 에 기록된 task 파일 하나만** 근거로 판정한다.
- envelope 는 orchestrator 가 조립한다. subagent 는 스스로 state.md 를 읽어 라우팅을 추리하지 않는다 — orchestrator 가 준 Goal · Focus EPIC · Task path · Scope · Current phase · Prior tasks/reviews 만 신뢰한다.
- planner 는 reviewer 없는 meta-role 이다. task/review 파일을 남기지 않고 state.md 의 EPIC summaries 블록을 반환한다. 실제 state.md 기록은 orchestrator 가 append-only 로 수행한다.

#### Reviewed-Work Contract

한 pair 턴은 다음 파일을 남긴다 (경로는 orchestrator 가 envelope 로 알려준다):

- **Task** (정확히 1 개) — `.harness/epics/EP-N--{slug}/tasks/T{id}--{task-slug}.md`. producer 의 산출. 본문 · 증거 · self-verification · suggested-next-work 를 담는다.
- **Review** (reviewer 수만큼, 1 또는 M 개) — `.harness/epics/EP-N--{slug}/reviews/T{id}--{task-slug}--{reviewer-name}.md`. 파일명의 `{reviewer-name}` 덕분에 M 개가 충돌 없이 공존. 각 review 는 해당 reviewer 의 axis 에 한정된 PASS/FAIL + criteria 인용 증거를 담는다.

재작업(rework) 은 같은 task-id 를 덮어쓰지 않는다. orchestrator 가 새 `T<id>` 를 발급하고 이전 task + M 개 review 는 그대로 보존된다. structural retreat 도 동일하다 — 기존 task/review 파일을 건드리지 않고 새 `T<id>` 를 발급한다. planner 는 예외로 task/review 파일을 남기지 않으며, planner 이력은 events.md 한 줄 + state.md 의 EPIC summaries 변경(git diff) 이 대신한다.

### 2. Turn Algorithm

#### Pair rhythm (한 응답 = Next 소비 + 다음 Next 생산)

한 orchestrator 응답의 실행 순서는 고정이다:

1. `references/state-md-schema.md` 와 `references/events-md-format.md` 를 먼저 확인해 이번 턴의 read/write shape 을 고정한다.
2. 턴이 시작되면 **항상 먼저 `loop: false` 를 state.md 에 써서 재진입을 잠근다**. Codex/Gemini 쪽 hook 은 subagent completion 에도 걸릴 수 있으므로, 이 lock 은 `Next` 유무와 무관하게 매 orchestrator 턴의 첫 write 다.
3. state.md 를 읽고 `## Next` 블록을 확인한다. 비어 있거나 부재하면 아래 Exceptional Paths 의 Cold start / Halt 규칙으로 분기한다.
4. Next 블록을 envelope 로 조립해 `Next.To` producer 를 `fork_context=false` 로 디스패치한다.
   - **4-a. Pair producer turn** — `Next.To != planner` 이면 반환된 산출을 `Next.Task path` 의 task 파일로 기록한다.
   - **4-b. Planner turn** — `Next.To == planner` 이면 task/review 파일을 만들지 않는다. planner 반환의 `EPICs (this turn)` 블록을 append-only 로 state.md 의 `## EPIC summaries` 에 반영하고, planner 결과를 events.md 에 한 줄로 남긴다. 반환에 `Additional pairs required` 가 non-empty 면 그 목록을 events.md 에 별도 orchestrator note 로 append 한다 (`<ts> T<id> orchestrator note — Additional pairs required: <slug>: <purpose>; ...`). 이 note 가 planner 재호출 시 envelope 의 `Recent events` 로 자연 재주입되어, 사용자가 pair 를 추가한 뒤에도 어떤 outcome 이 보류됐었는지 복원할 수 있게 한다.
5. reviewer 분기를 처리한다.
   - **5-a. Planner turn** — reviewer dispatch 를 건너뛰고 step 8 로 간다. planner 는 reviewer 없는 meta-role 이다.
   - **5-b. Pair producer turn** — 같은 응답에서 **paired reviewer(들) 을 병렬 디스패치**한다. pair 에 reviewer 가 M 명(1:M) 이면 M 개 subagent 호출을 한 메시지에 모아 보낸다 — reviewer 는 서로 독립이고 producer 전사를 공유받지 않으므로 병렬이 안전하다.
6. pair producer turn 이었다면 reviewer 반환물을 각각 `.harness/epics/EP-N--{slug}/reviews/T<id>--<task-slug>--<reviewer-name>.md` 에 기록한다.
7. pair producer turn 이었다면 **Verdict 집계**를 수행한다. 1:M 의 경우 `all-PASS → PASS`, `any-FAIL → FAIL(각 FAIL 사유를 합쳐 rework)`, `any-structural → Retreat(가장 상류 upstream stage 를 가리키는 보고 우선; 동률이면 먼저 도착한 보고)` 로 aggregate 한다.
8. **다음 Next** 를 합성한다.
   - **8-a. Planner turn** — 방금 반영한 EPIC summaries 에서 첫 live EPIC 을 seed 해 다음 dispatch 를 만든다. 신규 EPIC 은 첫 roster producer 를 `current` 로 잡고, 모든 EPIC 이 종결 상태면 halt 로 간다. planner 가 **실행 가능한 EPIC 을 하나도 emit 하지 않았고** `Additional pairs required` 만 반환한 경우도 halt 분기로 간다 — `Next` 블록을 비우고 `loop: false` 를 유지한 채 사용자에게 "`/harness-pair-dev --add <slug> --purpose ...` 로 요청된 pair 를 추가한 뒤 `/harness-orchestrate <goal.md>` 를 재호출하라" 는 메시지를 띄운다 (4-b 에서 append 된 events note 가 재개 시 planner envelope 의 `Recent events` 로 흘러 들어간다).
   - **8-b. Pair producer turn** — 집계된 verdict + EPIC 전반 진행도 + structural issue 여부를 보고 아래 Phase advance 규칙을 적용한다.
9. state.md 의 `Next` 블록·`Phase` 필드·해당 EPIC `current` 를 갱신하고, events.md 에 이 턴 이벤트(producer 1 + reviewer M + 필요 시 orchestrator note)를 append 한다.
10. 유효한 다음 dispatch 가 있으면 **그때만** `loop: true` 로 올려 yield 한다. 모든 EPIC 의 `current` 가 종결 상태(`done` 또는 `superseded`)이거나 halt 분기면 `Next` 블록을 비우고 `loop: false` 를 유지한 채 종료한다.

한 응답에 복수 pair 를 섞지 않는다 (pair 하나 = producer 1 + reviewers M). planner 예외는 step 4-b / 5-a / 8-a 에서만 다루고, 그 외 절차는 일반 pair turn 기준으로 읽는다. `loop` 는 턴 시작 시 항상 false 로 내려가고, orchestrator 가 유효한 다음 `Next` 를 확정한 뒤에만 턴 끝에서 true 로 올라간다.

#### Phase advance — 다음 Next 합성

이 섹션은 **pair producer turn** 의 verdict 기반 합성 규칙이다. planner turn 은 위 Turn Algorithm 의 step 8-a 로 처리되고, 아래 네 가지 기준은 reviewer verdict 가 존재하는 경우에만 적용된다. 모든 판단은 **현재 턴 말미에 한 번**만 수행되며, 결과가 state.md `## Next` 블록에 박힌다.

1. **Rework** — 집계된 verdict 가 FAIL (1:M 에서는 any-FAIL):
   - `Next.To` = 같은 producer
   - `Next.EPIC` = 같은 EPIC
   - `Next.Intent` = "재작업(reviewer FAIL): <FAIL 사유 요약 — 1:M 이면 reviewer 별 FAIL 사유를 축 태그와 함께 합친다>"
   - `Next.Prior tasks` = [방금 낸 task 파일]
   - `Next.Prior reviews` = [FAIL 을 낸 모든 review 파일] (PASS reviewer 의 review 도 함께 묶어 이미 통과한 축을 깨지 않게 한다)
2. **Retreat (structural)** — producer 또는 reviewer 가 structural issue 보고:
   - `Next.To` = 가장 상류를 가리키는 보고의 `Suspected upstream stage` (여러 건이면 upstream 이 가장 깊은 쪽 우선; 최악 `planner`)
   - `Next.EPIC` = 같은 EPIC (retreat-to-planner 면 기존 EPIC 목록 전체가 planner envelope 에 들어감)
   - `Next.Intent` = "(retreat 사유: <이유>). <upstream 에서 재설계할 내용>"
   - `Next.Prior tasks` = [retreat 대상 phase 의 직전 task]
   - `Next.Prior reviews` = [structural issue 보고 review]
   - 해당 EPIC 의 `current` 를 retreat target producer 로 되돌린다.
3. **정방향 advance (PASS)** — reviewer PASS 로 진행:
   - 먼저 **방금 PASS 한 EPIC 의 `current` 를 roster 다음 slug 로 이동**한다 (roster 끝이면 `done`).
   - **모든 EPIC 을 훑어** `current` 가 종결 상태(`done` 또는 `superseded`)가 아닌 EPIC 들 중 `current` 의 roster position 이 **가장 앞인** EPIC 을 선택한다. tie-break 는 EPIC 번호가 작은 쪽이다.
   - 선택된 EPIC 이 존재하면 `Next.To`, `Next.EPIC`, `Next.Intent`, `Next.Prior tasks`, `Next.Prior reviews` 를 그 EPIC 의 현재 단계 기준으로 채운다.
4. **Halt (all terminated)** — 모든 EPIC 의 `current` 가 종결 상태(`done` 또는 `superseded`)이면 `Next` 블록을 비우고 `loop: false` 로 설정한다.

`Phase` 헤더 필드는 `Next.To` 의 에코다. rework 는 같은 producer 를 유지하고, retreat 는 `current` 를 upstream 으로 되돌리며, forward advance 는 `current` 를 다음 roster slug 또는 `done` 으로 이동시킨다.

### 3. Interfaces

#### Dispatch envelope

producer/reviewer 는 `fork_context=false` 로 실행되어 대화 전사를 상속받지 않는다. orchestrator 가 envelope 에 global context 를 prompt 로 담아야 한다.

공통 블록:

- **Goal** — state.md `Goal (from X):` 한 문단 그대로.
- **Focus EPIC** — `Next.EPIC` slug + 해당 EPIC 의 `outcome` 한 줄. planner 면 "(none)" 또는 기존 EPIC 목록.
- **Pair skill** — `skills:` frontmatter 로 이미 주입되지만 한 줄로 명시 ("rubric: `skills/<slug>/SKILL.md`").
- **Task path** — `Next.Task path` 그대로.
- **Scope** — 이번 턴 허용 파일/경로 한 문장. pair skill 의 scope 정의를 기반으로 orchestrator 가 합성한다.
- **Current phase** — `Next.Intent` 자연어 그대로. 이 한 블록이 subagent 에게 "지금 이 턴에 무엇을 하는가"를 전달하는 핵심이다.
- **Axis (reviewer 전용)** — 1:M pair 에서 각 reviewer envelope 에 그 reviewer 가 맡은 채점 축을 한 줄로 명시한다. 공유 pair skill 의 Evaluation Criteria 가 reviewer 별로 태깅되어 있으므로 reviewer 는 자기 axis 태그가 붙은 항목만 채점한다. 1:1 이면 생략하거나 `Axis: (pair 전체)` 로 둔다.

가변 블록:

- **Prior tasks** — `Next.Prior tasks` 배열. 상류 task, rework baseline, retreat 수정 대상 등 상황에 따라 내용이 달라지지만 필드 shape 은 동일하다.
- **Prior reviews** — `Next.Prior reviews` 배열. PASS review, FAIL review, structural issue 보고 등 모두 여기 들어간다.

planner 전용 추가 블록:

- **Existing EPICs** — state.md 의 `## EPIC summaries` 블록 그대로.
- **Recent events** — events.md 의 tail 5 줄.

subagent 는 envelope 필드만 신뢰하고 스스로 state.md 를 읽어 라우팅을 추리하지 않는다. reviewer 는 Task path 의 task 파일 **한 개** 와 pair skill 만 근거로 판정하며 producer 전사·tool trace 는 보지 않는다.

#### Context propagation

pair agent frontmatter `skills:` 에 공유 pair skill + `harness-context` 가 선언되어 dispatch 시 둘이 자동 주입된다. envelope 은 두 skill 이 가리키지 않는 것(Goal, Focus EPIC, Task path, Scope, Current phase, Prior 들) 만 prompt 본문에 싣는다. 본 skill 의 공용 법·라우팅 규칙은 subagent 관심사가 아니어서 주입되지 않는다.

#### Structural Issue handling

producer 또는 reviewer 가 **자기 pair 로 해결 불가능한 upstream 계약 실패** 를 감지하면 review 파일에 아래 shape 로 보고한다 (동일 shape 가 `harness-context` 에도 subagent 출력 규약으로 박혀 있다):

```markdown
## Structural Issue

- Suspected upstream stage: {producer name}
- Blocked contract: {what cannot be satisfied}
- Why this pair cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream producer should revisit}
```

언제 쓰는가: (a) 현 아티팩트가 upstream 산출에 의존하는데 그 산출이 invalid, (b) pair 계약 자체가 잘못됨, (c) agent-skill 불일치로 downstream 작업이 불가능할 때. 쓰지 않는 때: 같은 pair 안에서 재작업(reviewer FAIL → 같은 producer 재호출) 으로 해결 가능한 일반 피드백.

### 4. Exceptional Paths

#### Cold start / Halt

- **Cold start** — state.md 에 `Next` 블록이 없거나 비어 있고 EPIC summaries 도 없으면 cold start 다. 이 시점의 `loop: false` 는 이미 턴 시작 시 써져 있다. orchestrator 의 첫 행동으로 **초기 Next 합성**: `To: planner`, `EPIC: (none)`, `Intent: goal.md 전체를 읽고 EPIC 분해` 를 state 에 박고 같은 턴에 실행한다. cold start 턴의 끝에서 유효한 `Next` 가 다시 생겼을 때만 `loop: true` 로 올린다.
- **Manual halt / terminal halt** — 사용자가 `Next` 블록을 수동으로 지우면 즉시 halt 다. 자동 halt 는 Phase advance #4 가 수행한다. 둘 다 `loop: false` 를 유지하며 Hook 은 재진입하지 않는다.

#### Goal-anchored entry

`/harness-orchestrate <filename.md>` 호출 시:

1. `<filename.md>` 를 읽어 **trimmed body 전체**를 Goal 문자열로 삼는다. `# Goal` / `## Constraints` 같은 load-bearing header 를 요구하지 않는다.
2. state.md 의 기존 `Goal (from X):` 와 의미적 유사도로 분류한다.
   - **same** (혹은 이전 Goal 비어있음) → no-op. 기존 Next 블록과 EPIC summaries 로 라우팅을 이어간다. state 가 비어 있으면 Cold start 로 간다.
   - **refined** (scope 확장/세부화) → 현재 `Next` 를 planner recall 로 교체한다. planner 가 append-only 로 신규 EPIC 을 얹거나 기존 EPIC 을 `superseded` 로 마킹한 뒤 대체 EPIC 을 추가한다(기존 EPIC 필드 in-place 수정 금지).
   - **different** (의도/도메인 뚜렷이 다름) → reset. `init.ts` 호출해 이전 사이클 archive 후 재초기화한 뒤 Cold start 로 들어간다.
3. 분류는 orchestrator 의 semantic judgment 다. 사용자 confirmation prompt 를 띄우지 않는다 (Hook 재진입 환경에 interactive channel 이 없다). 마크다운 내부 marker header 로 분류를 지시하게 하지도 않는다.

#### Hook re-entry

Hook(`.harness/hook.sh`) 은 state.md 의 `loop: true` 를 확인해 `/harness-orchestrate` 를 재호출한다. slash 명령은 설치 시점에 하드코드되어 있어 state.md 에서 읽지 않는다. Hook 은 cadence driver 가 아니라 yield 재진입 메커니즘이다. 한 응답의 끝은 항상 state.md write-back (특히 다음 `Next` 블록) + yield 이다.

## Evaluation Criteria

- description 이 `/harness-orchestrate <file.md>` + Hook 재진입 트리거 키워드를 포함해 pushy 하다.
- 본문이 `references/state-md-schema.md` 와 `references/events-md-format.md` 의 shape 을 전제로 편집·append cadence 를 기술하고, 본문 안에 동일 스키마를 재서술하지 않는다.
- `Next` 블록 필드셋(`To/EPIC/Task path/Intent/Prior tasks/Prior reviews`) 을 Phase advance 규칙이 결정적으로 채운다.
- one-pair-per-response · Phase advance 는 **현재 턴 말미 한 번** 합성 · 다음 턴은 Next 를 **그대로 실행** 의 셋이 Turn Algorithm 안에서 한 흐름으로 읽힌다.
- least-advanced EPIC 선택 규칙이 "roster position 최소, tie-break EPIC 번호 작은 쪽" 으로 명시.
- Exceptional Paths 안에서 Goal-anchored entry 의 세 branch(no-op / refine / reset) 와 Cold start / Hook re-entry 가 lookup 가능하다.
- script/prompt 경계 — install/init/sync/hook 내부 로직을 본문에 복제하지 않고 경로로만 인용.
- Semantic Contract 의 `Authority Rules` · `Reviewed-Work Contract` 와 Interfaces 의 `Structural Issue handling` 이 본 skill 본문에 담겨 reviewer 가 외부 cite 없이 채점 가능하다.
- planner meta-role 예외(task 파일 없음, state.md EPIC summaries 반환) + EPIC mutation append-only(신규 추가 · 기존 `superseded` 마킹만, in-place 수정 금지) 가 모두 명시.
- Context propagation 이 subagent 에게는 `harness-context` 만 주입되고 orchestrator 법은 주입되지 않음을 밝힌다.

## Taboos

- state.md 에 파이프 테이블/셀 포맷을 넣는다 (헤더 + Next 블록 + EPIC 헤딩 열거가 정답).
- EPIC 요약을 한 덩어리 prose 로 뭉쳐 개별 EPIC 을 식별하기 어렵게 만든다.
- 숫자 기반 phase slug 를 쓴다 (`Phase: skill-writer` 가 정답, `Phase: 1` 은 오답).
- 한 응답에 producer+reviewer 쌍을 둘 이상 디스패치한다.
- subagent 가 `Next` 블록을 직접 쓰게 한다.
- 판단을 다음 턴으로 미루고 이번 턴에 `Next` 를 비어 있거나 모호하게 남긴다.
- 같은 `T<id>` 를 덮어써 rework 흔적을 지운다.
- 본 skill 본문에 install/init/sync/hook 스크립트의 내부 구현을 다시 적는다.
- goal 분류 시 사용자 confirmation prompt 를 띄우거나 goal markdown 에 marker header 를 요구한다.
- planner 산출을 task 파일로 기록한다 (planner 는 `.harness/epics/**` 를 건드리지 않고 state.md 의 EPIC summaries 만 갱신한다).
- 기존 EPIC 의 `outcome`/`roster`/`upstream` 필드를 in-place 수정한다 (append-only 원칙 위반 — `superseded` 마킹 + 새 EPIC 추가가 정답).
- Evaluation Criteria 가 직접 채점 근거로 인용하는 계약 블록(`Authority Rules` / `Reviewed-Work Contract` / `Phase advance` / `Structural Issue handling`)을 본 skill 밖으로 빼고 cite 만 남긴다 — reviewer 가 본문만 읽고 채점하지 못하게 된다 (`oversized-split.md:32-42` "What Stays in SKILL.md" 참조). 스키마·템플릿·예시 같은 비(非)채점 자료는 references 로 이관 가능.
- subagent-facing skill(`harness-context`)에 phase advance · state schema · Hook 재진입 같은 orchestrator 법을 복사해 주입한다 — subagent 의 관심사가 아니며 noise 로 작동한다.

## References

- `references/state-md-schema.md` — state.md 헤더/Next 블록/EPIC summaries 필드 정본.
- `references/events-md-format.md` — events.md 한 줄 포맷과 invariants.
- `../harness-planning/SKILL.md` — planner 가 참조하는 EPIC 분해 / roster 작성 rubric.
- `../harness-context/SKILL.md` — subagent 주입용 축소 배경 skill (envelope 해석 · 출력 shape · Taboos). 본 skill 의 공용 법 본문과 중복되지 않도록 subagent 관심사만 담는다.
- `.harness/hook.sh` — yield 재진입 메커니즘.
