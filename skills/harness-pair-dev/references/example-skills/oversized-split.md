# Oversized SKILL.md Split Spec

이 파일은 canonical `SKILL.md` 가 커져 references 분리가 필요해질 때 **언제** 분리해야 하는지와 **어떻게** 분리해야 하는지를 고정하는 authoritative spec 이다. producer 와 reviewer 가 공유 pair skill 을 점검할 때 split 판단 근거로 읽는다. 본 파일은 `skill-authoring.md` §3 "Line budget & oversized-split" 에서 정본으로 인용한다.

## 1. Split Trigger Thresholds

세 가지 정량 기준 중 **하나 이상**이 참이면 해당 `SKILL.md` 는 split 후보이며, producer 는 같은 pair 턴에서 spec 인용과 함께 분리안을 제시한다. 여러 조건이 동시에 걸리면 우선 가장 큰 블록부터 references 로 이관한다.

- **≥ 300 lines** — canonical `SKILL.md` 본문이 300 줄을 넘으면 split 대상이다. Claude official plugin best practice 상 `SKILL.md` 는 "필요할 때만 load 되는 on-trigger 컨텍스트"이며, 300 줄을 넘기 시작하면 producer 와 reviewer 가 같은 섹션을 오간 뒤 길을 잃는다 (scroll fatigue). 이 기준은 "한눈에 읽히는 본문" 하한을 보호한다. 별도로 authoring rubric 의 1 차 기준은 본문 200 줄이며, 200 줄을 넘는 시점에 먼저 split 을 시도하고 300 줄 cap 은 hard ceiling 으로 남긴다.
- **≥ 3 authority-citation blocks** — "State.md Contract", "Pair/Cycle Law", "Ledger-Driven Routing Synthesis" 처럼 계약을 정의하거나 상위 문서에서 line-range 로 인용되는 섹션이 한 파일 안에 3 개 이상이면, 각 섹션이 references 로 이사한다. 계약 블록은 외부에서 anchor 처럼 참조되므로 한 파일에 몰아두면 한 섹션 수정이 관계 없는 다른 계약의 line-range 를 밀어낸다. 기준은 "line-range 안정성" 을 보호한다.
- **≥ 2 examples blocks** — GOOD/BAD 예시 쌍, 템플릿, 또는 여러 줄의 실물 샘플이 한 `SKILL.md` 안에 2 개 이상이면 examples 는 references 로 이관한다. 예시는 본문 "왜" 를 보조하는 재료이므로 본문에 쌓일수록 "왜" 의 신호가 흐려진다. 기준은 "insight-first 본문" 을 보호한다.

## 2. references/ Directory Naming Convention

`references/{kebab-topic}.md` 패턴만 허용한다. `{kebab-topic}` 은 파일이 소유하는 **하나의 계약 또는 패턴** 의 이름이다.

- 허용 예: `references/state-md-contract.md`, `references/pair-cycle-law.md`, `references/ledger-routing.md`, `references/scripted-bootstrap.md`.
- 금지 예: `references/notes.md`, `references/details.md`, `references/misc.md`, `references/extra.md` (포괄적 이름), `references/v2.md`, `references/state-md-contract-v2.md` (버전 접미사), `references/state_md_contract.md` (snake_case).

한 파일은 한 topic 만 소유한다. 한 파일이 여러 계약을 소유하면 이 spec 의 §1 에서 정한 `≥ 3 authority-citation` 기준에 재진입한다.

## 3. Cross-File Citation Format

`SKILL.md` 본문이 references 로 이관된 topic 을 가리킬 때 인용 shape 는 정해져 있다.

- 같은 skill 내부: `references/{kebab-topic}.md:{line-range}` (예: `references/oversized-split.md:12-40`).
- 다른 skill 의 references: `../{skill-name}/references/{kebab-topic}.md:{line-range}` (예: `../api-design/references/rest-conventions.md:18-44`).
- repo-root anchored 절대경로는 `CLAUDE.md`/`AGENTS.md` 급 docs 에서만 허용한다. `SKILL.md` 와 references 파일은 **상대경로**만 사용한다. 절대경로 인용은 repo 이동이나 sync tree 관찰 시 깨지기 쉽다.

line-range 는 실제 파일에서 resolve 해야 한다. producer 는 본인이 이번 턴에 disk 에서 읽지 않은 파일에 line-range 인용을 넣지 않는다.

## 4. What Stays in SKILL.md

references 로 **이관하지 않는다**:

- **Design Thinking** (1 section) — "무엇이 좋은가" 의 insight 는 본문에서만 산다. references 로 빼는 순간 "왜" 가 메타데이터에서 분리되어 트리거 직후 LLM 이 근거를 잃는다.
- **Methodology skeleton** — 단계 이름과 1–2 줄 내비게이션은 본문에 남긴다. 단, 한 단계가 300 줄을 넘는 계약 본문을 담으면 본문에는 요약+링크, references 에 본문이 위치.
- **Evaluation Criteria** — reviewer 가 채점 시 직접 인용하는 기준은 본문에 남긴다. 루브릭이 references 에 숨으면 reviewer 가 isolated 컨텍스트에서 트리거된 skill 본문만 읽고 채점하지 못한다.
- **Taboos** — "왜 하면 안 되는가" 역시 insight 에 속하며 references 로 내리지 않는다.
- **Description frontmatter** — load-bearing trigger 계약이다. 본문과 분리될 수 없다.

references 는 "계약 본문 / 템플릿 / 예시 모음" 의 보관소이지, skill 의 Why 나 채점 루브릭을 담지 않는다.

## 5. Quality-Preservation Invariants

split 이 끝난 직후 다음 네 조건을 **동시에** 만족해야 한다. 하나라도 깨지면 reviewer 는 해당 phase 를 FAIL 로 처리한다.

1. **No information loss** — pre-split 본문과 비교했을 때 정보가 소실되지 않는다. 증명은 `diff` 기반 byte-level 동치거나, 재배치/문장 재결합이 있었다면 reviewer verdict 에 "의미-level 동치" 증명을 첨부한다.
2. **Every citation resolves on disk** — `SKILL.md` 안의 모든 `references/...:{line-range}` 인용이 실존 파일의 실존 라인 구간을 가리킨다. 깨진 인용은 discovery 경로를 끊는다.
3. **Individually browsable** — 각 references 파일은 `SKILL.md` 본문 없이 열었을 때도 coherent 하게 읽힌다. 첫 1–2 문단에 "이 파일이 소유하는 계약이 무엇이며 누가 왜 읽는가" 를 밝힌다.
4. **Readability hard-floor** — 어떤 references 파일도 300 줄을 넘지 않는다. §1 의 trigger 1 을 재귀 적용한 결과이며, 이 조건이 깨지면 해당 파일이 또 다른 split 후보가 된다.

## 6. Coexistence with Existing references/

기존 sibling references 자산 (예: `../references/multi-platform-skills.md` 같은 플랫폼별 배포 가이드가 이미 있는 경우) 은 신규 split 작업에서 다음 규율을 따른다.

- 기존 파일을 리네이밍, 재배열, 흡수하지 않는다.
- 신규 topic 이 기존 파일과 부분 겹치면, 신규 파일은 net-new material 만 소유하고 기존 파일을 `references/{existing-topic}.md:{line-range}` 형태로 인용한다.
- 같은 skill 의 references 파일들 사이에서 내용 duplication 을 만들지 않는다. duplication 은 reviewer 가 어느 쪽을 채점 근거로 삼을지 애매하게 만든다.

## 7. Non-Goals

이 spec 이 **정의하지 않는** 것들:

- **플랫폼 sync 계약** — `.claude/skills/`, `.codex/skills/`, `.gemini/skills/` 로의 references 배포 규율은 host-control 레이어 (orchestrator + sync 스크립트) 가 소유한다. 본 spec 은 skill 파일 본문의 split 판단 기준만 다룬다.
- **agent 파일 split 정책** — agent 파일은 다른 size cap 을 따르며 `agent-authoring.md` 가 다룬다. 본 spec 은 skill 파일 한정.
- **자동 split 툴링** — 본 spec 은 producer-reviewer pair 가 수동으로 수행하는 split 의 판단 기준을 고정할 뿐이며, 스크립트 기반 자동 분리 도구는 별도 소관이다.
