---
name: harness-planning
description: "Use when authoring or reviewing the planner subagent output for this project. Defines how to read the goal markdown, decompose into outcome EPICs (cap 3–4 per turn), and emit the per-EPIC executing-department sequence (roster). Invoke whenever the `harness-planner` agent is dispatched or its output is audited."
user-invocable: false
---

# Harness Planning

이 코드베이스의 도메인을 먼저 읽고, 실제 작업이 요구하는 producer 역할이 드러나게 한다. 고정된 팀 형태를 강요하지 않는다. planner 한 턴은 **EPIC 목록과 각 EPIC 의 실행 부서 시퀀스(roster)** 를 **같은 산출물** 안에 함께 낸다. 산출은 state.md 의 `## EPIC summaries` 블록 형태로 반환하며, planner 는 task 파일을 남기지 않는다(실제 state.md 기록은 orchestrator 소유). EPIC mutation 은 **append-only** — 신규 EPIC 을 얹거나 기존 EPIC 을 `superseded` 로 마킹할 수만 있고, 기존 EPIC 의 `outcome`/`roster`/`upstream` 필드는 in-place 수정하지 않는다. 한 턴은 3~4개 EPIC 에서 끊는다 — 초과분은 다음 턴으로 미룬다. 이 제한은 한 턴에 planner 가 신중하게 고민할 수 있는 에픽 수를 보호한다.

## Design Thinking

좋은 팀 설계는 이 코드베이스의 도메인에서 출발한다. "하네스는 항상 이런 모양이다" 라는 선험적 템플릿은 쓸모가 없다. 같은 waterfall·pair·cycle 모델 위에서도 backend-heavy 코드, docs-heavy 코드, ML 파이프라인은 서로 다른 producer 를 요구한다. planner 는 코드베이스 파일과 goal markdown 을 읽어 **"어떤 종류의 산출물이 몇 번 반복해서 만들어질 것인가"** 를 먼저 파악하고, 거기서 department 를 도출한다. EPIC 은 "작업의 묶음" 이 아니라 "하나의 outcome" 이다. outcome 이 달성되기까지 필요한 department 들이 waterfall 순서로 그 EPIC 안에서 돈다.

planner 는 다른 producer 와 동등한 하나의 producer 이며, 산출은 곧 downstream EPIC 목록이다. orchestrator 가 그 목록을 그대로 state.md 의 EPIC summaries 에 반영한다. planner role 자체를 손봐야 하는 경우에도 이 문서가 먼저 지켜야 할 런타임 planning contract 이다.

## Methodology

### 1. Read the codebase

도메인 신호를 수집한다:

- 코드베이스 구조 (언어, 주요 디렉터리, 빌드/런타임 경계).
- `README.md` / 루트 문서 — 코드베이스가 스스로를 어떻게 설명하는가.
- `.harness/events.md` 가 있으면 과거 사이클의 실패/성공 패턴.
- 사용자가 `/harness-orchestrate <file.md>` 로 넘긴 goal markdown 본문 전체.

goal markdown 은 전체 문자열이 goal 이다. `# Goal` 같은 마커 헤더를 요구하지 않는다. 본문의 각 줄을 goal-source citation 으로 참조할 수 있다.

### 2. Emit EPICs directly

첫 planner 호출은 `EP-1--{kebab-outcome}` 부터 순번을 매겨 downstream EPIC 을 바로 낸다. 재계획 턴에서는 기존 EPIC 을 `superseded` 로 넘기고 필요한 새 EPIC 을 기존 목록 뒤에 append 하는 방식으로 결과를 남긴다.

### 3. Generate EPICs

각 EPIC 은 다섯 필드를 갖는다:

- `slug` — `EP-N--{kebab-outcome}` (예: `EP-2--auth-skill-authoring`).
- `outcome` — 한 문장짜리 완료 조건. 동사+대상형. "무엇을 만들거나 고치면 이 EPIC 이 끝나는가".
- `upstream` — 이 EPIC 이 시작되기 전에 끝나야 하는 다른 EPIC slug 목록 (없으면 `none`).
- `why` — goal markdown 의 어느 줄에서 이 EPIC 이 파생됐는지 citation (`goal.md:L12` 처럼).
- `roster` — EPIC 안에서 돌 producer-reviewer 순서 (아래 §4).

upstream 그래프는 acyclic 이어야 한다.

planner 산출의 필드셋은 `outcome / upstream / why / roster` 네 개다. state.md 의 `## EPIC summaries` 블록은 `outcome / roster / current / note` 네 필드로 각 EPIC 을 열거하지만, **`current` 와 `note` 는 orchestrator 가 산정·append 하는 runtime 필드**다. planner 산출에 `current` 나 `note` 를 포함하지 않는다. `upstream` 과 `why` 는 orchestrator 가 `note` 로 합쳐 기록한다.

### 4. Waterfall roster within an EPIC

각 EPIC 의 `roster` 는 해당 EPIC 이 완주하기 위해 거쳐야 하는 producer 시퀀스다. 형식:

```
roster: <pair1-producer> → <pair2-producer> → <pair3-producer>
```

- 각 slug 는 이 사이클에 등록된 pair producer 만 사용한다. 등록 안 된 slug 는 roster 에 쓰지 않는다.
- reviewer 는 roster 에 별도 표기하지 않는다 — producer 이름 하나가 pair 전체를 가리키며 orchestrator 가 pair 의 paired reviewer 를 자동 호출한다.
- planner 자신은 roster 의 producer 이름으로 등장하지 않는다. planner 는 orchestrator 의 escalation 경로에서만 재호출된다.
- 등록된 pair 로 roster 를 채울 수 없으면 **해당 EPIC 을 이번 턴 EPICs 블록에 포함시키지 않는다**. 대신 `Additional pairs required` 섹션에 필요한 pair slug + purpose 를 남기고, `Remaining` 필드에 어떤 outcome 이 pair 대기로 보류됐는지 한 줄 요약을 적는다. 빈 roster EPIC 을 emit 해 state 에 올리지 않는 게 원칙이다 — state.md `## EPIC summaries` 에는 **실행 가능한(roster 가 등록 pair 로 완전히 채워진) EPIC 만** 올라간다. 사용자가 `/harness-pair-dev --add` 로 요청 pair 를 추가한 뒤 orchestrator 가 planner 를 재호출하면, 이때 보류됐던 outcome 이 정식 EPIC 으로 emit 된다.

orchestrator 는 EPIC 의 `current` 필드를 roster 에서의 현재 producer slug 로 관리하며, reviewer PASS 때마다 roster 의 다음 slug 로 이동한다. roster 끝을 통과하면 `current: done`. planner 가 해당 EPIC 을 새 EPIC 으로 대체하며 파기 지시한 경우 `current: superseded` 로 마킹된다 — planner 가 직접 이 값을 쓰는 게 아니라 새 EPIC 을 얹는 산출을 낼 때 orchestrator 가 함께 적용한다.

### 5. 3–4 EPICs per planner turn

한 planner 턴 산출은 **최대 4개 EPIC** 까지만 다룬다. 더 많은 EPIC 이 필요하면 이번 턴 EPIC 들만 완성해서 내고 `next-action` 에 "계속해서 EP-{N+1}부터 추가 EPIC 산출" 같은 continuation 을 적는다. orchestrator 가 다음 사이클에서 planner 를 다시 호출해 이어간다. 한 턴에 4개를 초과해서 내지 않는다 — 이 제한은 planner 가 매 턴 신중하게 생각할 수 있도록 보장한다.

### 6. Escalation path

downstream producer 가 자기 권한으로 풀 수 없는 구조 결함을 발견하면 orchestrator 는 해당 EPIC 의 `current` 를 `harness-planner` 로 되돌리고 planner 를 재디스패치한다. 재호출된 planner 는 `.harness/events.md` 의 escalation note 와 envelope 의 `Recent events` / `Existing EPICs` 를 읽고 **append-only** 로 EPIC 목록을 수정 산출한다 — 교체·분할·병합·upstream 재연결이 필요하면 해당 EPIC 을 `superseded` 로 마킹하고 새 번호의 새 EPIC(들) 을 얹는다. 파기된 EPIC 폴더의 이미 완료된 task/review 는 보존되므로 새 EPIC 의 `upstream` 참조로 재사용할 수 있다.

## EPIC summary shape (for state.md)

orchestrator 가 state.md 의 `## EPIC summaries` 블록에 흡수하는 형식은 **테이블 없이 열거된 헤딩+짧은 필드** 다. 한 EPIC = 한 `### EP-N--slug` 헤딩 + 4 필드(`outcome`, `roster`, `current`, `note`). 한 덩어리 prose 로 여러 EPIC 을 뭉치지 않고, 파이프 테이블도 쓰지 않는다.

예:

```
### EP-2--auth-skill-authoring
outcome: OAuth 로그인 흐름용 skill 세트 작성.
roster: skill-dev-producer → test-writer-producer.
current: skill-dev-producer.
note: upstream EP-1--domain-agent-design 완료됨. goal.md:L18 "로그인은 OAuth2 third-party 기반이어야 한다" 에서 파생.
```

`current` 값은 숫자가 아닌 producer 이름이거나 종결 상태(`done` | `superseded`)다. roster 끝을 통과하면 `done`, planner 가 새 EPIC 으로 대체하며 파기 지시하면 `superseded`. 요약 순서는 EP 번호 오름차순.

## Evaluation Criteria

planner 산출이나 planning rubric 을 점검할 때 쓰는 기준:

- 도메인 증거가 코드베이스 file + line range 인용으로 등장한다 (추상적 요약이 아니라).
- 각 EPIC 의 outcome 이 동사+대상형이고 완료 판정이 가능하다.
- 각 EPIC 의 `why` 가 goal markdown 의 특정 줄을 citation 한다.
- `roster` 가 등록된 pair producer slug 만 사용한다.
- 산출이 downstream EPIC 목록 그 자체다(첫 slug 가 `EP-1--{outcome}` 으로 시작).
- 이번 턴에 다룬 EPIC 이 4개 이하이다.
- 초과분은 `next-action` 에 continuation 으로 남았고 truncate 되지 않았다.
- upstream 그래프가 acyclic 이고 참조된 slug 가 모두 실존한다.
- escalation 이 발생한 경우 envelope 의 `Recent events` 를 명시적으로 읽고 반영했다.
- EPIC summary 의 `current:` 가 숫자 기반이 아니라 producer 이름이거나 종결 상태(`done` | `superseded`)다.
- 재호출 산출이 append-only (신규 EPIC 추가 또는 기존 EPIC `superseded` 마킹 지시) 로만 표현되고 기존 EPIC 필드 in-place 수정 지시를 포함하지 않는다.
- 산출에 task 파일 경로가 포함되지 않는다 (planner 는 task 파일을 쓰지 않는다).

## Taboos

- 고정된 "항상 7개 EPIC" 템플릿을 쓰지 않는다. 도메인이 수를 결정한다.
- 숫자/알파벳 혼합 current slug 를 쓰지 않는다. current 는 producer 이름이다.
- state.md 에 파이프 테이블을 넣지 않는다. EPIC 은 "한 EPIC = 한 헤딩 + 4 필드" 의 headed-paragraph 리스트로 열거한다.
- roster 에 등록되지 않은 임의 producer slug 를 넣지 않는다.
- 임시·이중 실행 같은 상태 플래그를 도입하지 않는다. 현재 phase = 현재 producer, 그뿐이다.
- 한 planner 턴에 5개 이상 EPIC 을 산출하지 않는다.
- producer 전사나 reviewer 내부 대화 기록을 EPIC 근거로 삼지 않는다. disk 증거만 쓴다.
- EPIC outcome 을 "작업 목록" 이나 "체크리스트" 로 쓰지 않는다. 한 문장 outcome 이다.
- EPIC 목록과 roster 를 별개 턴으로 분리하지 않는다. 한 턴 한 산출 안에 함께 낸다.
- 기존 EPIC 의 `outcome`/`roster`/`upstream` 필드를 in-place 수정하는 산출을 내지 않는다. 변경이 필요하면 해당 EPIC 을 `superseded` 로 마킹하고 새 번호의 새 EPIC 을 얹는다(append-only).
- planner 산출에 task 파일 경로를 포함하지 않는다. planner 는 task 파일을 쓰지 않고 EPIC summaries 블록만 반환한다.

## Example (GOOD)

```
EPIC list (this turn: EP-1, EP-2, EP-3):

EP-1--domain-agent-design
- outcome: OAuth 도메인 전담 agent (auth-gatekeeper) 정의 작성.
- upstream: none.
- why: goal.md:L11 "서드파티 OAuth 흐름을 다루는 전담 역할 필요".
- roster: agent-dev-producer.

EP-2--auth-skill-authoring
- outcome: auth-gatekeeper 가 참조할 skill 세트 작성.
- upstream: EP-1--domain-agent-design.
- why: goal.md:L18 "로그인은 OAuth2 third-party 기반이어야 한다".
- roster: skill-dev-producer → test-writer-producer.

EP-3--runtime-wiring
- outcome: orchestrator 에 auth EPIC 배선 + 전체 파이프라인 검증.
- upstream: EP-1--domain-agent-design, EP-2--auth-skill-authoring.
- why: goal.md:L22 "로그인 실패 시 retry 한번 후 사용자에게 알림".
- roster: wiring-producer.

next-action: "EP-4 이후 domain EPIC 이 남았다면 다음 턴에 이어서 산출."
```
