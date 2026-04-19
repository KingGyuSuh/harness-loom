---
name: harness-pair-dev
description: "Use when `/harness-pair-dev --add|--improve|--split <pair-slug>` is invoked to author, refine, or split a producer-reviewer pair for a target project's harness. `--add` requires `--purpose \"<text>\"` (what this pair does) and optionally `--reviewer <slug>` repeated for 1:N reviewer pairs. `--improve` accepts `--hint \"<free-form>\"`; without hint it applies rubric hygiene + codebase-drift fixes."
argument-hint: "--add <pair-slug> --purpose \"<text>\" [--reviewer <slug> ...] [--target <path>] [--provider <list>] | --improve <pair-slug> [--hint \"<text>\"] [--target <path>] [--provider <list>] | --split <pair-slug> [--target <path>] [--provider <list>]"
user-invocable: true
---

# harness-pair-dev

## Design Thinking

`harness-pair-dev` 는 **하네스의 프로젝트별 저작 표면**이다. 공통 foundation 은 `harness-init` 이 템플릿으로 박아 주므로 매 프로젝트가 갈라지는 지점은 producer-reviewer pair 뿐이다. Claude 는 본 skill 의 references(example-agents + example-skills) 를 메인 턴에서 직접 읽고 pair 세트를 저작한 뒤, 결정적 작업(registration, provider sync) 은 스크립트에 위임한다. orchestrate/planning skill 의 roster 섹션은 `register-pair.ts` 만 편집한다 — 수동 편집은 diff 기반 갱신을 깨뜨려 runtime 이 pair 를 못 찾게 한다. **Canonical source = `.claude/`**: 모든 모드는 `<target>/.claude/` 트리에만 직접 쓴다. `.codex/`, `.gemini/` 는 `sync.ts` 가 canonical 로부터 결정적으로 derive 하므로 provider 별 분기 저작이 필요 없다.

## Methodology

### 1. Modes

| Mode | Input | Output |
|------|-------|--------|
| `--add <pair-slug> --purpose "<text>" [--reviewer <slug> ...]` | 신규 pair slug + 필수 purpose + optional extra reviewer slugs | 코드베이스 분석 후 도메인-specific producer 1 개 + reviewer M 개 + 공유 pair skill 1 개를 `.claude/` 에 저작, registration + sync |
| `--improve <pair-slug> [--hint "<text>"]` | 기존 pair slug (+ 사용자 의도) | 코드베이스 re-analysis + rubric 진단 + (있으면) hint 반영 → `.claude/` 파일 리터치 + re-sync. split 필요 감지 시 사용자 승인 유도 후 중단 |
| `--split <pair-slug>` | 과부하 pair slug | `.claude/` 에 두 sub-pair 생성 + 원본 제거 + registration + sync |

공통 플래그: `--target <path>` (기본 cwd), `--provider <list>` (생략 시 target 감지; sync 대상 provider 결정).

### 2. `--add <pair-slug> --purpose "<text>" [--reviewer <slug> ...]`

1. **Args 파싱 및 precondition** — `--purpose` 가 없으면 즉시 중단하고 사용자에게 요구한다(slug 만으로는 identity·principles·skill body 를 채울 수 없다). target 경로 확정 후 `<target>/.claude/skills/{harness-orchestrate, harness-planning, harness-context}/SKILL.md` 존재 확인. 누락 시 `/harness-init` 선행 실행 요구 후 중단.
2. **Reviewer roster 결정** — `--reviewer` 플래그가 없으면 기본 reviewer 1명(`<pair-slug>-reviewer`). 플래그가 하나 이상 주어지면 각 값이 reviewer slug 가 되어 M 명 reviewer 로 1:M pair 구성. reviewer slug 는 kebab-case + 도메인 역할명(예: `sql-reviewer`, `server-reviewer`). 숫자 suffix 금지.
3. **References 읽기** — Claude 가 본 skill 의 다음 references 를 차례로 읽는다:
   - `references/example-agents/` (7 개) — pair shape 톤/구조 샘플.
   - `references/example-skills/agent-authoring.md` — agent frontmatter, 5 principles, Task, Output Format 엄격 규칙.
   - `references/example-skills/skill-authoring.md` — skill frontmatter, description-as-trigger, 섹션 순서, 200-line cap, oversized-split threshold.
4. **Codebase analysis (필수)** — pair 가 어떤 코드 위에서 일하게 될지 먼저 읽는다. 일반적·추상적 producer 를 만들지 말고, **이 코드베이스가 실제로 쓰는 패턴**을 흡수해 pair body 에 녹인다. 최소 다음을 수집:
   - `README.md` / 루트 문서 / `CLAUDE.md` 또는 `AGENTS.md` 가 있으면 — 프로젝트가 자기를 어떻게 설명하는가.
   - `--purpose` 키워드로 grep + glob — purpose 가 가리키는 도메인의 실제 파일·디렉터리·함수·테스트 위치 (예: purpose 가 "snake game UI" 면 기존 UI 코드, 입력 처리 모듈, 렌더 루프 위치).
   - 사용 중인 언어/프레임워크/빌드 시스템 (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` 등) 과 명명 규칙 (snake_case vs camelCase, 어떤 디렉터리 구조).
   - 기존 테스트 패턴 (있으면) — producer 가 어떤 검증 방식으로 산출물을 자가검증해야 하는지의 근거.
   이 단계에서 충분한 신호가 없으면 사용자에게 추가 정보 요청 후 중단. **빈손으로 generic 한 pair 저작 진입 금지.**
5. **Domain 설계** — `--purpose` + 위에서 수집한 코드베이스 evidence 를 primary axis 로 삼아 producer identity · 5 principles · Task steps · 공유 pair skill 의 Design Thinking/Methodology/Evaluation Criteria/Taboos 를 구상한다. **각 섹션이 도메인 evidence (실제 파일 경로, 함수 이름, 패턴 이름) 를 최소 한 번 이상 인용**하도록 한다. 1:M 이면 각 reviewer 가 어떤 axis(예: SQL schema vs HTTP handler)를 맡는지 purpose 와 코드베이스 구조에서 도출하고, pair skill Evaluation Criteria 를 reviewer 별 축으로 분리·태깅한다.
6. **Agent 저작** — `templates/producer-agent.md` 치환 → `<target>/.claude/agents/<pair-slug>-producer.md`. 각 reviewer 에 대해 `templates/reviewer-agent.md` 치환 → `<target>/.claude/agents/<reviewer-slug>.md` (1명이면 `<pair-slug>-reviewer.md`, M명이면 사용자가 준 slug 그대로). identity paragraph 가 추상적 ("코드를 작성한다") 이 아니라 코드베이스 specific ("`src/engine/snake.py` 의 게임 루프 패턴을 따라 새 입력 핸들러를 추가한다") 이어야 한다.
7. **Pair skill 저작** — `templates/pair-skill.md` 치환 → `<target>/.claude/skills/<pair-slug>/SKILL.md`. Design Thinking 은 "이 코드베이스에서 이 도메인이 왜 어렵고 무엇을 보호해야 하는가" 를 코드 evidence 로 답한다. Evaluation Criteria 는 reviewer 별 축으로 태깅(예: `- [sql-reviewer] ...`, `- [server-reviewer] ...`) 하고 각 항목은 코드베이스 patterns/files 를 인용해 채점 가능해야 한다 (vague rubric 금지).
8. **Extra skill 부가 (optional)** — producer 나 특정 reviewer 가 pair skill 외 도메인 지식을 참조해야 하면 해당 agent 의 frontmatter `skills:` 에 추가 slug 를 append 한다(예: producer 에 `data-schema`, sql-reviewer 에 `sql-conventions`). **필수 두 항목(`<pair-slug>`, `harness-context`)은 유지하고 그 뒤에 부가**한다. 추가 slug 는 on-disk 에 실존하는 `skills/<slug>/SKILL.md` 만 참조.
9. **Registration**:

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/register-pair.ts \
     --target <path> --pair <slug> \
     --producer <slug>-producer \
     --reviewer <reviewer-slug-1> [--reviewer <reviewer-slug-2> ...] \
     --skill <slug>
   ```

   스크립트가 target 의 `harness-orchestrate` / `harness-planning` skill 본문의 "Registered pairs" / "Available departments" 섹션을 idempotent 하게 갱신한다. 1:M 이면 `reviewers [<r1>, <r2>, ...]` 배열 형태로 기록.
10. **Pointer docs sync** — `node ${CLAUDE_SKILL_DIR}/scripts/docs-sync.ts`. target 의 `CLAUDE.md` / `AGENTS.md` 가 있으면 "## Harness Pairs" 섹션 재렌더(registration line 파싱 기반 — 1:M 도 포맷 유지). 없으면 skip.
11. **Provider sync** — `node ${CLAUDE_SKILL_DIR}/scripts/sync.ts` 호출. `--provider` 가 사용자 명령에 명시됐으면 그대로 전달, 생략 시 sync.ts 가 disk 의 derived provider(`.codex/`, `.gemini/`) 를 자동 감지해 derive. multi-platform 이 아닌 프로젝트는 no-op 이므로 안전. 처음 codex/gemini 를 추가하려면 사용자가 별도로 `/harness-sync --provider codex` 를 호출한다. **sync 는 `.claude/` 를 절대 건드리지 않는다 (canonical read-only).**

### 3. `--improve <pair-slug> [--hint "<text>"]`

1. **Roster 파악** — target 의 `harness-orchestrate/SKILL.md` "Registered pairs" 섹션에서 해당 pair 라인을 읽어 producer slug 와 reviewer slug 목록(M ≥ 1) 을 확정한다. 그 뒤 `<target>/.claude/agents/<producer-slug>.md`, `<target>/.claude/agents/<reviewer-slug>.md` (M 개), `<target>/.claude/skills/<pair-slug>/SKILL.md` 를 모두 읽는다.
2. **Evidence-fit 재평가** — pair body 가 인용하는 파일 경로·함수 이름·패턴 이름이 **현재 코드베이스 상태와 여전히 match 하는지** 한 건씩 verify 한다. 방법: (a) 인용된 각 파일이 존재하는지 ls, (b) 인용된 함수/심볼을 grep, (c) 인용된 패턴이 여전히 그 디렉터리에 살아있는지 확인. 어긋난 인용(파일 이동/삭제, 함수 개명, 패턴 폐기)은 모두 수정 axis 로 쌓는다. 추가로 purpose 가 가리키는 도메인 영역에 **새로 등장한 패턴**이 있는지 스캔해 "현 코드베이스가 이 pair 한테 새로 요구하는 것" 을 흡수할 기회를 찾는다.
3. **Hint 처리** — `--hint` 가 주어지면 사용자 의도(예: "reviewer criteria 를 더 tight 하게", "producer 가 테스트 근거 인용을 강제하도록") 를 진단의 primary axis 로 삼는다. hint 없으면 rubric 진단 + codebase drift 정합화만 수행.
4. **Rubric 진단** — `references/example-skills/agent-authoring.md` + `skill-authoring.md` 기준으로 미흡 지점(description-as-trigger, 5 principles 수, 섹션 순서, Output Format shape, 200-line cap, 도메인 evidence 인용 부족 등) 을 식별. hint 가 있으면 hint 의도와 rubric 을 함께 만족하도록 수정안을 설계. **추상적/generic 문구를 코드베이스 specific 인용으로 교체하는 것이 1순위 fix.**
5. **Split escalation check** — skill 본문이 `oversized-split.md:6-11` 의 세 threshold(≥300 lines / ≥3 authority-citation / ≥2 examples) 중 하나라도 트리거하거나, hint 가 scope 분할을 명시적으로 요청하면 **여기서 중단** 하고 split 권고를 사용자에게 제시한다. 사용자가 승인하면 `--split <pair-slug>` 로 재호출하도록 안내. 자동 승격은 하지 않는다 (split 은 registration 다중 변경 · Phase 필드 고아화 위험이 있는 파괴적 전환).
6. 수정만 적용해 세 파일을 in-place 편집. **명칭/slug 변경 금지** — 바뀌면 orchestrate/planning 의 registration line 과 state.md `Phase:` 필드가 고아가 된다.
7. `sync.ts` 호출. registration 섹션 편집은 name/slug 변경이 없으므로 생략.

### 4. `--split <pair-slug>`

1. **Scope 분석** — registration 라인에서 producer slug 와 reviewer slug 목록을 확인하고, producer agent + 모든 reviewer agent + pair skill 을 읽어 두 개의 자연스러운 하위 관심사로 나뉘는지 본다. 안 나뉘면 사용자에게 split 근거를 제시하고 중단.
2. **신규 slug 결정** — 도메인에 맞는 의미 slug (`<pair>-<concern-a>`, `<pair>-<concern-b>`). 숫자 suffix(`pair-1`) 금지.
3. `--add` 절차를 두 번 반복해 두 신규 pair 를 저작한다(각 `--purpose` 와 필요한 경우 `--reviewer ...` 플래그까지 함께). 1:M pair 를 split 하는 경우, 각 하위 관심사에 맞는 reviewer subset 이 자연스럽게 각 신규 pair 에 할당된다.
4. **원본 제거** — `register-pair.ts --unregister <pair-slug>` 로 registration 을 제거하고 원본 pair 의 모든 파일(`agents/<producer-slug>.md`, `agents/<reviewer-slug>.md` × M, `skills/<pair-slug>/SKILL.md`) 을 삭제한다. **이력은 git 이 가진다 — `.harness/_archive/` 로 이동하지 않는다** (runtime dir 에 historical cruft 가 쌓이면 orchestrator 가 어떤 pair 가 live 인지 판별하기 어려워지고, 복원은 `git checkout` 으로 충분).
5. 두 신규 pair 에 대해 sync 한 번.

### 5. References usage

- `references/example-agents/` — pair 의 **톤과 구조** 참조. 본 skill 의 `--add` 가 신규 pair 를 설계할 때 design-by-analogy 기준이다.
- `references/example-skills/agent-authoring.md` — **엄격 규칙**. frontmatter(name, description, skills), identity paragraph 2-4 줄, Principles 정확히 5 개(Why-first positive), Task 5-10 numbered steps, Output Format Producer/Reviewer shape. 금지 필드 `path`/`effort`/`allow-tools`/`allowed-tools`/`tools`.
- `references/example-skills/skill-authoring.md` — **엄격 규칙**. Design Thinking → Methodology → Evaluation Criteria → Taboos 고정 순서, 200-line cap, description-as-trigger("Use when …"/"Invoke whenever …"), oversized-split threshold.
- `references/example-skills/oversized-split.md` — pair skill 본문이 200 줄 넘을 때 적용할 split 지침.

Claude 는 본 skill 읽기 직후 위 references 를 차례로 읽어들인 후에만 저작을 시작한다.

### 6. skill → subagent → skill 흐름

producer/reviewer 템플릿은 frontmatter `skills:` 에 **두 항목** 을 항상 선언한다: pair 고유 `{{SKILL_SLUG}}` + 공용 `harness-context`. dispatch 시 Claude Code 가 두 skill 을 자동 주입하므로 subagent 는 자기 rubric(pair skill) 과 공용 법(pair/cycle rhythm, authority, reviewed-work contract, structural-issue shape) 을 같은 턴 안에서 모두 읽는다. pair skill 의 `## References` 가 가리키는 다른 skill(예: `../rest-conventions/SKILL.md`) 도 함께 딸려 들어온다. **한 subagent 턴의 컨텍스트 = agent body + pair skill + harness-context + 연결 skill 들**. 본 skill 이 `--add` 로 생성하는 두 template 은 이미 `harness-context` 를 박아두므로 사용자가 수동으로 추가할 필요가 없다.

### 7. Registration contract

`register-pair.ts` 는 target 의 두 skill 본문을 편집한다:

- `<target>/.claude/skills/harness-orchestrate/SKILL.md` 의 `## Registered pairs` 섹션에 한 줄 append. 형식은 `register-pair.ts:174` 출력과 정확히 일치:
  - 1:1 예: `` - <pair-slug>: producer `<slug>-producer` ↔ reviewer `<reviewer-slug>`, skill `<slug>` ``
  - 1:M 예: `` - <pair-slug>: producer `<slug>-producer` ↔ reviewers [`r1-reviewer`, `r2-reviewer`], skill `<slug>` ``
- `<target>/.claude/skills/harness-planning/SKILL.md` 의 `## Available departments` 섹션에 동일 한 줄을 department 등록으로 append.

pair slug 가 target runtime 의 **phase 이름** 이 된다. 즉 state.md 의 `Phase:` 필드와 `Next:` 필드가 이 slug 를 그대로 쓴다. 따라서 slug 는 kebab-case 단어(영문 전용, 명사형 역할 이름) 로 유지하며 숫자 suffix(`pair-1`) 는 피한다.

`--unregister` 옵션은 해당 라인들을 제거한다. idempotent 하며 대상 라인이 없으면 no-op.

## Evaluation Criteria

- `--add` 호출에 `--purpose "<text>"` 가 **필수**로 주어졌고, 해당 문자열이 producer identity · 5 principles · pair skill Design Thinking 본문 작성의 primary axis 로 반영되었다.
- `--add` 와 `--improve` 모두 코드베이스 분석을 선행했고, 결과물(producer identity · pair skill Design Thinking · Evaluation Criteria) 이 **이 프로젝트 specific한 evidence (실제 파일 경로, 함수 이름, 패턴 이름, 테스트 위치) 를 최소 한 번 이상 인용**한다. "코드를 작성한다" 같은 추상 표현이 아니라 "`src/X.py` 의 Y 패턴을 따른다" 같은 도메인 anchor 가 본문에서 잡힌다.
- 신규 pair 의 producer/reviewer agent 파일이 `references/example-skills/agent-authoring.md` 의 모든 규칙(frontmatter 정확성, 5 principles, 5-10 Task steps, Output Format shape) 을 만족한다.
- 각 agent 의 frontmatter `skills` 가 **필수 두 항목(`<pair-slug>`, `harness-context`)을 포함**하고, 그 뒤에 0개 이상의 부가 도메인 skill 이 올 수 있다. 필수 두 항목 순서는 유지하고 부가 skill 은 on-disk 에 실존하는 `skills/<slug>/SKILL.md` 만 참조한다.
- 공유 pair skill 파일이 `references/example-skills/skill-authoring.md` 의 섹션 순서와 200-line cap, description-as-trigger 를 만족한다.
- 1:M pair 의 경우 공유 pair skill 의 Evaluation Criteria 가 reviewer 별 axis 로 태깅(예: `[sql-reviewer] ...`, `[server-reviewer] ...`) 되어 각 reviewer 가 자기 축만 집중 채점할 근거를 찾을 수 있다.
- 파일 명명 — producer 는 `<pair-slug>-producer.md`, reviewer 는 사용자가 준 reviewer slug 그대로(`<reviewer-slug>.md`; 단일 reviewer 기본값은 `<pair-slug>-reviewer.md`), skill 은 `<pair-slug>/SKILL.md`.
- `register-pair.ts` 실행 후 target 의 `harness-orchestrate` / `harness-planning` SKILL.md 에 해당 pair-slug 이 정확히 한 줄씩 append 되었다(중복 append 없음). 1:M 이면 해당 줄에 `reviewers [<r1>, <r2>, ...]` 배열이 모두 포함되어 있다.
- 모든 저작은 canonical `.claude/` 에만 기록되고, `sync.ts` 는 사용자가 명시한 `--provider` 또는 disk-detected provider 만 derive 한다. 처음 codex/gemini 를 추가하려면 `/harness-sync --provider codex,gemini` 로 사용자가 opt-in 해야 하며, pair-dev 의 자동 sync 는 그 opt-in 을 강제하지 않는다. derived 트리의 agent body 는 canonical 과 의미적 동치다(frontmatter model 필드만 platform pin 에 의해 다르다).
- `--add` 한 호출은 **정확히 한 pair** 만 생성한다 (reviewer 는 여러 개 가능하지만 pair 는 하나).
- `--improve` 가 hint 수신 시 hint 의도를 진단의 primary axis 로 취급하고, rubric 은 secondary constraint 로만 적용한다 (hint 없으면 rubric-only).
- `--improve` 가 split threshold 감지 시 자동 승격 없이 권고+중단으로 멈춘다.
- `--split` 이 원본 세 파일을 삭제하되 `.harness/_archive/` 로 옮기지 않는다 (이력은 git 이 가진다).
- 템플릿 placeholder(`{{PAIR_SLUG}}`, `{{IDENTITY_PARAGRAPH}}`, 등) 가 최종 파일에 잔존하지 않는다.

## Taboos

- `harness-init` 선행 실행 없이 `--add` 를 진행한다 — target 에 `harness-orchestrate`/`harness-planning`/`harness-context` skill 이 없어 registration 이 깨지고 신규 pair agent 가 공용 법을 읽지 못한다.
- `--add` 를 `--purpose` 없이 진행한다 — slug 만으로는 identity·principles·skill body 를 채울 근거가 없어 템플릿 placeholder 가 그대로 남거나 hallucinated content 로 메워진다.
- 코드베이스 분석을 건너뛰고 generic 한 producer/reviewer/skill 본문을 즉석 저작한다 — 이 프로젝트가 실제 쓰는 패턴·파일·테스트 방식을 모르는 채 "일반론" 만 박은 pair 는 어느 프로젝트에서도 안 통한다. purpose 키워드 grep + 관련 디렉터리 ls 가 최소 단계.
- producer identity 나 pair skill 본문에 코드베이스 evidence (파일 경로, 함수 이름, 기존 패턴) 인용이 0 건이다 — 도메인 anchor 가 없으면 reviewer 도 채점 기준을 잡지 못한다.
- pair agent 의 `skills` 에서 `harness-context` 나 pair 고유 skill 항목을 제거한다 — subagent 가 공용 법 또는 pair rubric 중 하나를 잃어 채점·저작 기준이 붕괴된다.
- 1:M pair 의 공유 pair skill 에 reviewer 별 axis 태그 없이 Evaluation Criteria 를 섞어 쓴다 — 각 reviewer 가 자기 축 기준을 찾지 못하고 채점이 중복·누락된다.
- `.codex/` 또는 `.gemini/` 를 직접 편집한다 — canonical source 는 `.claude/` 이며 다른 provider 트리는 `sync.ts` 가 다음 실행 때 덮어쓴다. 수동 편집은 소실된다. pair 저작은 반드시 `.claude/` 에 쓰고 sync 를 돌린다.
- `harness-orchestrate` / `harness-planning` skill 본문을 수동 편집한다 — `register-pair.ts` 이외 경로로 건드리면 이후 registration/unregistration 이 diff 기반 편집을 못 찾는다.
- 한 번의 `--add` 호출에 pair 두 개 이상을 생성한다 — scope 경계와 사용자 의도 추적을 깨뜨린다.
- pair slug 에 숫자 suffix 나 공백을 쓴다 — state.md 의 `Phase:` 필드 가독성을 깬다.
- producer agent 본문에 Reviewer criteria 를 embed 하거나 그 반대를 한다 — role leak, `references/example-skills/agent-authoring.md` 의 anti-pattern.
- 템플릿을 쓰지 않고 agent/skill 파일을 scratch 저작한다 — shape drift 를 낳아 rubric 채점이 불안정해진다.
- `--improve` 가 split threshold 를 감지했는데 사용자 승인 없이 자동으로 `--split` 로직을 실행한다 — registration 다중 변경과 `Phase:` 필드 고아화라는 파괴적 side effect 가 hygiene 편집에 섞이면 안 된다.
- `--improve` 가 명칭/slug 를 바꾼다 — registration line 과 state.md `Phase:` 필드가 고아화되어 orchestrator 가 pair 를 라우팅하지 못한다.
- `--split` 이 원본 pair 파일을 `.harness/_archive/` 같은 runtime dir 하위로 옮긴다 — orchestrator 가 live pair 판별에 혼선을 겪고 cruft 가 쌓인다. git 이 이력을 담당하므로 삭제가 정답.

## References

- `references/example-agents/` — 7 개 pair 샘플(tone/structure 참조).
- `references/example-skills/agent-authoring.md` — agent 저작 엄격 규칙.
- `references/example-skills/skill-authoring.md` — skill 저작 엄격 규칙.
- `references/example-skills/oversized-split.md` — 200-line cap 초과 시 split 지침.
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md` — 저작 시 치환 대상 템플릿.
- `scripts/register-pair.ts`, `scripts/sync.ts`, `scripts/docs-sync.ts` — 호출 대상 스크립트 정본. `sync.ts` 는 CLI + `runSync()` 라이브러리를 둘 다 export.
