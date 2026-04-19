---
name: agent-authoring
description: "Use when authoring or reviewing an `agents/*.md` role definition for any target project. Defines the canonical frontmatter, identity paragraph, five Why-first Principles, numbered Task, and fenced Output Format that a producer-reviewer pair shares."
user-invocable: false
---

# Agent Authoring

Producer-Reviewer pair 가 공유하는 단일 rubric. Agent 본문에 "어떻게" 가 섞이면 pair reviewer 와 판정이 어긋나므로, 방법론은 pair skill 에만 두고 agent 는 롤·원칙·Task·Output shape 만 담는다.

## Design Thinking

Agent = 롤(누구인가). 절차(how) 는 pair skill 소유다. 이 분리가 깨지면 Producer 가 가르치는 방법과 Reviewer 가 평가하는 방법이 달라져 판정이 불안정해진다.

Frontmatter 의 `description` 은 documentation 이 아니라 **트리거 메커니즘**이다. 런타임 라우팅 로직이 그 문장을 읽고 이 롤을 부를지 결정한다. 따라서 pushy·specific 해야 하며, "Use when …" / "Invoke whenever …" 형태의 능동 트리거 키워드를 포함한다.

## Canonical Agent Shape

다음 템플릿을 순서대로 따른다. 각 섹션의 order 는 load-bearing 이며 재배치하지 않는다.

```
---
name: <kebab-slug matching filename>
description: "<one line with trigger keywords: Use when X / Invoke whenever Y>"
skills:
  - <pair-slug>            # required — 공유 pair rubric
  - harness-context        # required — 공용 법(envelope 해석·출력 shape·금지선)
  # 이하 optional — 이 agent 만 필요로 하는 부가 도메인 skill
  # - data-schema
  # - sql-conventions
model: <opus | inherit>    # optional
---

# <Role Display Name>

<2–4 line identity paragraph: 이 롤이 "무엇인가"만 서술. how 는 담지 않는다.>

## Principles

1. <원리 한 문장>. <이유 한 문장.>
2. ...
(정확히 5 개. Why-first, positive form.)

## Task

1. <능동태 스텝, ≤25 단어, 구체적 산출물/결정 1 개>
2. ...
(5–10 개 numbered.)

## Output Format

End your response with this structured block:

```
<fenced block; role-type 별 shape 은 아래 §Output Format Rules>
```
```

## Frontmatter Rules

- `name` 은 파일명 kebab-slug 와 문자 단위로 일치.
- `description` 은 single-line. 반드시 능동 트리거 키워드(예: "Use when …", "Invoke whenever …", "Use this agent to …") 를 포함. multi-paragraph·trivia·서술형 prose 금지. 트리거가 없는 description 은 라우팅 엔진이 롤을 고르지 못해 무효다.
- `skills` 는 **필수 두 항목(pair 고유 `<pair-slug>` + 공용 `harness-context`)을 포함**하고, 그 뒤에 0 개 이상의 부가 도메인 skill 을 append 할 수 있다(예: producer 에 `data-schema`, sql-reviewer 에 `sql-conventions`). 모든 slug 는 on-disk 에 실존하는 `skills/{slug}/SKILL.md` 만 참조. 필수 두 항목의 순서(pair-skill 먼저, harness-context 다음)는 유지해 가독성을 보호한다.
- `model` 은 선택. runtime 이나 sync 레이어가 플랫폼별 값을 주입할 수 있으므로 agent 본문은 platform 분기를 알 필요가 없다.
- 금지 필드: `path`, `effort`, `allow-tools`, `allowed-tools`, `tools`. platform dispatch knob 은 agent contract 에 섞이지 않는다.

## Identity Paragraph Rules

- 2–4 줄. "이 롤은 무엇인가" 만. 절차·판정 기준·템플릿 금지.
- 능동태, Korean narration. kebab-slug 대신 Title-case display name 을 헤딩으로 쓴다.
- 짝 Reviewer 가 평가하는 기준을 여기서 재서술하지 않는다.

## Principle Rules

- 정확히 **5 개**. 3 개는 얕고, 6+ 는 scroll fatigue·restatement 를 부른다.
- 형태: "X 한다. 이유: Y." 각 bullet 은 원리(positive form) + 짧은 근거 한 문장.
- Negative-only ("~하지 않는다" 만으로 끝나는) 금지. 금지는 anti-pattern 영역 소유.
- Reviewer criteria·Task step 의 재서술 금지. Principle 은 identity·stance 만 표현한다.
- 절차 drift 금지 — "먼저 X 를 읽고, 그 다음 …" 같은 how-to 는 Task 또는 연결된 skill 소유.

## Task Rules

- Numbered, 능동태, 각 스텝 ≤25 단어. 5–10 개.
- 각 스텝은 **구체적 산출물 또는 결정 1 개**. "Consider X" 같은 관찰형 스텝은 금지, "Produce X" / "Decide Y" / "Write Z" 처럼 outcome 을 명시한다.
- 스텝 간 순서는 dependency 를 따른다. 병렬 가능한 두 행동은 한 스텝으로 합치지 않고 두 스텝으로 분리하되 번호만 부여한다.
- Task 본문은 pair skill 본문을 인용할 수 있으나 복제하지 않는다. `<skill-slug> 의 Output Format Rules 를 따른다` 가 올바른 인용 방식이다.

## Output Format Rules

fenced block 하나. Producer 와 Reviewer 는 서로 다른 shape 을 쓴다.

**Producer 변형** — 다음 필드를 순서대로 포함:

```
Status: PASS / FAIL
Summary: {what was produced in one line}
Files created: [{file path}]
Files modified: [{file path}]
Diff summary: {sections changed vs baseline, or "N/A"}
Self-verification: {issues found and resolved during this cycle}
Suggested next-work: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
Remaining items: [{items not yet done}]
Escalation: {none | structural-retreat-to-<stage>, reason}
```

**Reviewer 변형** — 다음 필드를 순서대로 포함:

```
Verdict: PASS / FAIL
Criteria: [{criterion, result, evidence-citation (file:line)}]
FAIL items: [{item, level (technical/creative/structural), reason}]
Regression gate: {clean / regression / N/A, details}
Feedback: {short free-form rationale}
Advisory-next: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
```

- Verdict 는 `PASS` / `FAIL` 문자열. 이모지·이모티콘·중립어(예: `PARTIAL`) 금지.
- Evidence 는 디스크 경로 + 라인 범위로 인용. "I feel" / "looks good" 은 증거로 인정되지 않는다.
- Producer 는 Reviewer verdict 필드를, Reviewer 는 Producer diff 필드를 각각 쓰지 않는다 — role leak.

**Meta-role 예외** — task/review 파일을 남기지 않는 meta-role(예: `harness-planner`) 은 Producer shape 의 `Files created / Files modified / Diff summary` 필드 대신 역할 고유 반환 필드(예: `EPICs / Remaining / Next-action / Additional pairs required`) 를 사용한다. 예외를 쓰는 agent 는 identity paragraph 또는 첫 principle 에서 "task 파일을 남기지 않는 meta-role" 임을 명시해 reviewer 가 standard Producer shape 으로 채점하지 않도록 한다.

## Anti-patterns

- 이모지 — 트리거 heuristic 을 노이즈로 만든다.
- 절차 drift — how-to 는 연결된 pair skill 이 소유. agent 안에 "Step 1: 먼저 X 를 읽고 …" 같은 methodology prose 를 넣지 않는다.
- Producer agent 에 Reviewer criteria 를 embed — 평가 기준은 페어 Reviewer body 와 shared skill 이 소유한다.
- Skill body 재서술 — `skills:` list 로 slug 만 가리키고 pair skill 본문을 agent 안에 복제하지 않는다.
- Multi-paragraph description·트리거 키워드 없는 prose — single-line + active trigger verb 규칙을 깬다.
- `path` / `effort` / `allow-tools` / `allowed-tools` / `tools` 등 platform dispatch knob — agent scope 를 침범한다.
- Principles count ≠ 5 — restatement·scroll fatigue 를 부른다.
- Orchestrator routing 이나 state 쓰기 절차를 agent body 에 재서술 — routing·state 는 orchestrator 단독 소유.

## Evaluation Criteria

pair reviewer 가 이 rubric 으로 채점할 때 확인하는 항목:

- Frontmatter 필수 필드(`name`, `description`, `skills`) 가 모두 존재하고 형태 규칙을 만족한다.
- `name` 이 파일명 kebab-slug 와 일치한다.
- `description` 이 single-line 이며 능동 트리거 키워드를 포함한다.
- `skills` 리스트가 필수 두 항목(`<pair-slug>`, `harness-context`)을 그 순서로 포함하고, 추가된 부가 skill 모두 `skills/{slug}/SKILL.md` 로 on-disk 해석된다.
- 금지 필드(`path`/`effort`/`allow-tools`/`allowed-tools`/`tools`) 가 frontmatter·body 어디에도 없다.
- `## Principles` 가 정확히 5 개이며 Why-first positive form 을 따른다.
- `## Task` 가 5–10 개 numbered step, 각 ≤25 단어, 능동태, 구체적 산출물/결정 1 개를 담는다.
- `## Output Format` 이 role-type(Producer / Reviewer) 별 필드 세트를 fenced block 으로 정확히 노출한다.
- 절차 drift(how-to 가 agent body 에 섞임), skill body 재서술, 페어 Reviewer criteria embed 중 어느 하나도 발견되지 않는다.
- 이모지 부재.

## Taboos

- agent frontmatter 에 `path`, `effort`, `allow-tools`, `allowed-tools`, `tools` 를 넣는다 — platform 계층에서 해결할 문제를 artifact contract 로 끌어들인다.
- `## Principles` 를 5 개가 아닌 수로 유지한다 — rubric 수렴성이 깨진다.
- `description` 을 multi-line paragraph 나 트리거 키워드 없는 서술형 prose 로 쓴다 — 트리거 메커니즘이 무력화된다.
- agent body 안에 orchestrator routing 이나 state 쓰기 절차를 서술한다 — routing·state 는 orchestrator 단독 소유.
- pair skill 본문을 agent 안에 복제한다 — source of truth 가 둘이 되어 drift 가 불가피해진다.
- 이모지를 portrait·장식 목적으로 사용한다.
- `Next-action` 필드를 Producer 가 직접 작성하고 routing authority 로 취급한다 — orchestrator synthesis 를 침범한다.
