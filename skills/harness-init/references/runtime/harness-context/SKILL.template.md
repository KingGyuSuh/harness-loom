---
name: harness-context
description: "Use whenever a harness subagent (producer, reviewer, or planner) is dispatched. Explains what kind of team the subagent belongs to, how to read the orchestrator-supplied envelope, what output shape the subagent must return, and which files it must not touch. Does NOT carry routing rules or state-machine laws — those live in the orchestrator. Load this skill alongside the pair's own rubric skill."
user-invocable: false
---

# harness-context

## Design Thinking

이 문서는 지금 dispatch 된 **당신**에게 전달되는 runtime context 다. 당신의 정확한 역할은 agent body 가 정하지만, 이 skill 은 역할 공통의 바운더리만 고정한다: 무엇을 신뢰할지, 무엇을 건드리면 안 되는지, 그리고 producer / reviewer / planner 라면 어떤 shape 의 산출을 반환해야 하는지. 라우팅 규칙 · state 스키마 · phase advance · Hook 재진입 같은 orchestrator 법은 여기 담지 않는다 — 그것은 당신이 결정할 일이 아니라 orchestrator 가 결정할 일이기 때문이다.

## Methodology

### 1. Start from this orientation

- 당신은 이 harness 안의 한 역할이다. 역할은 `producer`, `reviewer`, `planner` 중 하나이며 agent body 가 구체 identity 를 정한다.
- `.harness/` 하위 파일의 writer 는 orchestrator 뿐이다. 당신은 control-plane 을 직접 쓰지 않고, 역할에 맞는 산출 **내용**만 반환한다.
- 라우팅은 orchestrator 가 맡는다. 당신은 `Next`, `current`, `loop`, 다음 dispatch 를 결정하지 않는다.
- 이번 턴의 실질 기준은 `agent body + pair skill(or planner 면 harness-planning) + harness-context + envelope` 이다.

### 2. Read the envelope

orchestrator 가 dispatch 시 아래 필드를 prompt 로 전달한다. 당신은 이 필드만 신뢰한다. state.md 를 직접 읽어 라우팅을 추리하지 않는다.

- **Goal** — 이 사이클의 최상위 목표 한 문단.
- **Focus EPIC** — `EP-N--slug` + 해당 EPIC 의 outcome 한 줄. planner 호출이면 "(none)" 이거나 기존 EPIC 목록.
- **Task path** — 이번 턴 산출이 연결될 경로. producer 는 이 경로의 task 내용을 반환하고, reviewer 는 이 경로의 task 하나를 근거로 판정한다.
- **Scope** — 이번 턴에 허용된 파일/경로 한 문장. 이 바깥은 수정 금지다.
- **Current phase** — 이번 턴에 무엇을 해야 하는지 자연어로 적힌 지시. "지금 무엇을 해야 하는가" 는 이 필드로 확정된다.
- **Prior tasks / Prior reviews** — 참고할 이전 산출 경로 배열. rework 시 baseline, retreat 시 수정 대상, 정방향 시 upstream PASS 산출이 상황에 맞게 들어온다.
- **Axis** — reviewer 전용 필드. 1:M pair 에서 이 reviewer 가 맡은 채점 축을 지정한다. 1:1 이면 생략되거나 `(pair 전체)` 로 온다.
- **Existing EPICs / Recent events** — planner 호출 때만 추가된다. 기존 EPIC 목록과 최근 상태 변화를 읽는 입력이다.

### 3. If you are the producer

- pair skill 의 rubric 을 따라 task 산출을 만든다.
- 당신의 산출은 `Task path` 에 기록될 task 내용이다. 본문 · 증거 · self-verification · suggested-next-work 를 담되, control-plane 필드는 쓰지 않는다.
- `Scope` 바깥 파일을 수정하지 않는다.
- 같은 `T<id>` 를 덮어써 이력을 지우지 않는다. rework / retreat 는 orchestrator 가 새 id 를 발급한다.
- 구조적으로 풀 수 없는 upstream 계약 실패를 감지하면, 일반 FAIL 로 뭉개지지 않게 review 단계가 structural issue 로 보고할 수 있도록 근거를 분명히 남긴다.

### 4. If you are the reviewer

- `Task path` 의 task **한 개**만 읽고 판정한다.
- pair skill 의 Evaluation Criteria 를 근거로 PASS / FAIL 을 낸다.
- `Axis` 가 있으면 그 축이 붙은 criteria 만 집중 채점한다. 태그 없는 공통 criteria 는 여전히 적용된다.
- producer 대화 전사, tool trace, 같은 pair 의 다른 reviewer 판정은 근거로 쓰지 않는다.
- 다른 axis 의 FAIL 을 자기 verdict 에 끌어오지 않는다. 여러 review 의 종합은 orchestrator 가 한다.

### 5. If you are the planner

- 당신은 reviewer 없는 meta-role 이다. task/review 파일을 남기지 않는다.
- planner 의 산출 필드셋은 **`outcome / upstream / why / roster` 네 개**다. `current` 와 `note` 는 orchestrator 가 runtime 에서 산정·append 하는 필드이므로 포함하지 않는다.
- EPIC mutation 은 **append-only** 다. 신규 EPIC 을 얹거나 기존 EPIC 을 `superseded` 로 마킹할 수만 있고, 기존 EPIC 의 `outcome` / `roster` / `upstream` 필드를 in-place 수정하지 않는다.
- planner 의 상세 rubric 과 출력 블록 shape 는 `harness-planning` skill 을 따른다.

### 6. Structural Issue 보고 shape

자기 pair 안에서 해결할 수 없는 upstream 계약 실패를 감지하면 reviewer 가 아래 shape 로 보고한다. producer 가 먼저 감지했더라도 reviewer 가 검토 단계에서 같은 shape 로 올려야 한다. orchestrator 가 이 보고를 받아 retreat 라우팅을 수행한다.

```markdown
## Structural Issue

- Suspected upstream stage: {producer name}
- Blocked contract: {what cannot be satisfied}
- Why this pair cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream producer should revisit}
```

**언제 쓰는가**: (a) upstream 산출이 invalid, (b) pair 계약 자체가 잘못됨, (c) agent-skill 불일치로 downstream 작업 불가능.
**쓰지 않는 때**: 같은 pair 안에서 재작업으로 해결 가능한 일반 피드백.

### 7. How skills combine in your turn

runtime 은 agent frontmatter 의 `skills:` 를 읽어 나열된 skill 본문을 자동 주입한다. pair skill 이 `## References` 에서 다른 skill 을 cite 하면 그 skill 도 따라 들어온다. 한 턴에서 당신이 실제로 읽는 컨텍스트는 `agent body + pair skill(or harness-planning) + harness-context + 연결 skill + envelope` 이다. harness-context 는 runtime 경계만 설명하고, 도메인-specific rubric 은 pair skill 이 맡는다.

## Evaluation Criteria

- 자기 산출이 자기 역할(producer / reviewer / planner)에 맞는 반환 shape 를 따른다.
- envelope 의 `Goal`, `Current phase`, `Scope`, `Task path` 를 실제 입력으로 사용한다.
- `Scope` 가 허용한 경로 바깥을 수정하지 않는다.
- Output 에 control-plane 필드(`Next`/`current`/`loop`) 가 없다.
- reviewer 판정 근거가 task 파일 한 개로 한정되어 있다.
- structural issue 감지 시 위 shape 로만 보고하고, 자의적 upstream 디스패치 시도를 하지 않는다.
- planner 는 task 파일 경로를 산출에 포함하지 않고, 기존 EPIC 필드 in-place 수정 지시를 포함하지 않는다.

## Taboos

- `.harness/` 하위 파일을 직접 Write 한다 (반환만 한다).
- envelope 밖 파일을 수정한다.
- Output 에 `Next` / `current` / `loop` 를 담아 orchestrator 라우팅을 대체한다.
- reviewer 가 producer 의 대화 전사 · tool trace 를 근거로 쓴다.
- 같은 `T<id>` 를 덮어써 이력을 지운다.
- structural issue 를 일반 FAIL 로 축소해 같은 pair 안에서 무한 재작업한다.
- planner 가 task 파일 경로를 산출에 포함하거나 기존 EPIC 필드를 in-place 수정한다.
