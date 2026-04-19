---
name: skill-authoring
description: "Use when authoring or reviewing a `skills/{slug}/SKILL.md` file — the shared pair rubric. Invoke whenever a producer writes skill body/frontmatter or a reviewer grades skill shape, description-as-trigger, line budget, or references split."
user-invocable: false
---

# Skill Authoring

## Design Thinking

스킬은 methodology 레이어다. 한 skill 은 짝이 된 **producer 와 reviewer 가 공유하는 단일 기준**이며, producer 는 본문을 근거로 산출물을 만들고 reviewer 는 같은 본문을 근거로 FAIL/PASS 를 가른다. 따라서 skill 은 "무엇이 좋은가 (Design Thinking) + 어떻게 적용하는가 (Methodology) + 어떻게 채점하는가 (Evaluation Criteria) + 무엇이 깨지는가 (Taboos)" 의 네 축만 있으면 충분하다. 절차 transcript, 플랫폼 hook 설정, 도구 whitelist 같은 host-control 관심사는 skill 본문에 들어오지 않는다.

프론트매터의 `description` 필드는 단순 메타데이터가 아니라 **플랫폼이 skill 을 자동 load 할지 결정하는 트리거**다. "Use when ...", "Invoke whenever ..." 같은 명령형 문구와 구체 트리거 어휘가 있어야 load 되고, "This skill helps with ..." 같은 수동 서술은 load 를 놓친다. 또한 skill 본문이 커지면 producer/reviewer 모두 길을 잃기 때문에 `SKILL.md` 본문은 **200 줄 cap** 을 따르고 넘치는 재료는 `references/{kebab-topic}.md` 로 분리한다.

## Methodology

### 1. Canonical skill shape

```markdown
---
name: {skill-slug}
description: "Use when {trigger condition}. Invoke whenever {secondary trigger}."
user-invocable: false   # slash/hook 진입점이면 생략 (default true)
---

# {Skill Title}

## Design Thinking
{1 문단. 이 skill 이 왜 존재하며, producer/reviewer 가 무엇을 판단하기 위해 읽는지.}

## Methodology
{1~N 개 하위 섹션. 각 섹션은 "언제 / 어떻게 판단하는가"를 담는다.}

## Evaluation Criteria
- {reviewer 가 grade 할 때 직접 인용하는 체크 항목들}

## Taboos
- {하면 안 되는 것들과 왜 안 되는지}

## Examples (BAD / GOOD)   # optional — 말로 설명하기 어려운 패턴에만
## References               # optional — references/{kebab-topic}.md 포인터
```

섹션 **순서는 고정**이다. Design Thinking 이 맨 앞에 오지 않으면 reviewer 는 트리거 직후 "왜" 를 못 찾고 skill 의 판단 근거를 잃는다.

### 2. Description-as-trigger

`description` 은 플랫폼이 파싱하는 트리거이므로 다음 규칙을 지킨다.

- **명령형**: `Use when ...`, `Invoke whenever ...`, `Trigger on ...` 로 시작한다.
- **구체 트리거 어휘**: 슬래시 명령 (`/name`), 사용자 연속 발화 (`continue`, `next`), hook 재진입, 파일 종류, 검토 대상 등 **load 되어야 할 상황**을 적는다.
- **누가 load 하는지 적지 않는다**. `Loaded ONLY by X`, `never by workers` 같은 권한 문구는 플랫폼이 "나는 X 가 아니니 이 skill 은 이번 턴과 무관" 으로 해석해 본문을 드롭한다.
- 슬래시 진입점 스킬은 `user-invocable` 기본 (true) 을 쓴다. 내부 methodology 스킬은 `user-invocable: false`.

### 3. Line budget & oversized-split

본문 **200 줄 cap** 이 1차 기준이다. 본문이 캡을 넘거나 아래 세 threshold 중 하나라도 걸리면 split 한다.

- **≥ 300 lines** — 본문이 300 줄을 넘는다.
- **≥ 3 authority-citation blocks** — 상위 문서가 line-range 로 인용하는 계약 블록이 한 파일에 3개 이상.
- **≥ 2 examples blocks** — GOOD/BAD 쌍, 템플릿, 긴 샘플이 한 파일에 2개 이상.

Split 시 규칙과 naming convention 은 `oversized-split.md` 의 §1–§5 를 정본으로 삼는다. 본문에 남기는 것은 **Frontmatter, Design Thinking, Methodology skeleton, Evaluation Criteria, Taboos** 다. references 로 이관하는 것은 계약 본문 전체 인용, 긴 템플릿, 예시 모음이다. references 파일 자체도 300 줄을 넘기지 않는다.

### 4. Coexistence with existing references/

기존 sibling 파일 — 예를 들어 이미 있는 `references/some-topic.md` 같은 선행 자산 — 은 **리네이밍/재배열/흡수하지 않는다**. 신규 split 은 net-new material 만 소유하고 기존 파일과 부분 겹치는 영역은 `references/{existing-topic}.md:{line-range}` 로 인용한다. 같은 skill 의 references 파일들 사이에서 **내용 duplication 을 만들지 않는다** — duplication 은 reviewer 가 어느 파일을 채점 근거로 삼을지 애매하게 만든다.

### 5. Non-goals

이 rubric 이 **정의하지 않는** 것:

- **플랫폼 sync 계약** — 플랫폼 디렉터리 배포, 모델 pin, hook wiring 은 host-control 레이어가 가진다.
- **agent 정의 shape** — frontmatter, `# Role`, `## Principles`, `## Task`, `## Output Format` 은 `agent-authoring.md` 가 소유한다.
- **문서 관리** — `CLAUDE.md` / `AGENTS.md` / `README.md` 포인터 문서는 별도 관심사다.

## Evaluation Criteria

reviewer 는 skill 산출물을 다음 항목으로 채점한다. 각 항목은 FAIL 근거로 직접 인용된다.

1. **Frontmatter 정확성** — `name` 이 skill 디렉터리 슬러그와 일치하고, `description` 존재, 내부 skill 은 `user-invocable: false`.
2. **Description-as-trigger 패턴** — 명령형 + 구체 트리거 어휘. 수동 서술 ("This skill helps with ...") 이나 권한 문구 ("Loaded ONLY by X") 없음.
3. **섹션 순서 준수** — Design Thinking → Methodology → Evaluation Criteria → Taboos. optional 블록은 뒤에.
4. **Design Thinking 밀도** — "왜 이 skill 이 존재하며 producer/reviewer 가 무엇을 판단하는가" 가 1 문단 이상 있다.
5. **Line budget (≤ 200 줄)** — 본문이 200 줄 이내, 넘으면 split 필요.
6. **References split 적용** — §3 의 세 threshold 중 하나라도 걸렸는데 split 이 안 되어 있으면 FAIL.
7. **References naming convention** — `references/{kebab-topic}.md` 만 허용. 일반명 (`notes.md`, `details.md`, `misc.md`) 과 버전 접미사 (`v2.md`) 금지.
8. **References readability floor** — 어떤 references 파일도 300 줄을 넘지 않는다.
9. **Producer-Reviewer shareability** — 같은 skill 본문을 producer 가 생성 기준으로, reviewer 가 채점 기준으로 **동시에** 쓸 수 있는가.
10. **Taboos 존재성** — 최소 4개 이상의 구체 taboo.
11. **Korean prose, English identifiers** — 설명은 한국어, 파일명/식별자/frontmatter 키는 영어. 이모지 없음.
12. **Non-goal 명시** — sync / agent-shape / docs 같은 인접 관심사가 다른 rubric 로 위임되어 있다.

## Taboos

- 이모지 사용 (예: 체크마크, 화살표 글리프).
- 수동 description ("This skill helps with ...", "Covers X topic"). 플랫폼이 트리거로 인식하지 못한다.
- 권한형 description ("Loaded ONLY by …", "never by workers"). 플랫폼이 skill 본문을 드롭한다.
- sibling rubric 의 절차를 재서술 (예: `agent-authoring.md` 의 `## Principles` 5-bullet 규칙을 본 skill 에서 다시 명시). Non-goal 경계를 침범한다.
- 일반명 references 파일 (`notes.md`, `details.md`, `misc.md`, `v2.md`). reviewer 가 line-range anchor 를 못 잡고, 중복이 파일 경계를 넘어 흐른다.
- 300 줄을 넘는 references 파일. §3 trigger 1 을 재귀 위반.
- Design Thinking 생략. trigger 직후 판단 근거를 잃는다.
- 절차 transcript 를 본문에 박제 (예: "step 1: ..., step 2: ..., step 3: ..." 을 30 줄). methodology 는 판단 기준이지 대본이 아니다.

## Examples (BAD / GOOD)

description 필드 한 예시로 bad / good 대비를 고정한다. 가상의 `api-design` 스킬 기준.

```yaml
# BAD — 수동 서술, 트리거 없음, 권한형
description: "This skill describes REST API design conventions. Loaded ONLY by api-designer; never by workers."
```

```yaml
# GOOD — 명령형 + 구체 트리거 + 권한 문구 없음
description: "Use when drafting or reviewing a REST endpoint spec in this project. Invoke whenever a producer writes an endpoint description or a reviewer grades path/method/response conventions."
```

## References

- `oversized-split.md` — split trigger 세 threshold, naming convention, cross-file citation shape, stays-in-SKILL 목록, quality-preservation invariants, coexistence 규율. 본 skill 의 §3 가 본 파일을 정본으로 인용한다.
