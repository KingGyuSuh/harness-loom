---
name: harness-init
description: "Use when `/harness-init [<target>] [--force]` is invoked to install the canonical `.claude/` harness foundation into a target project. Scaffolds `.harness/` runtime + `.claude/skills/{harness-orchestrate, harness-planning, harness-context}/` + `.claude/agents/harness-planner.md` + `.claude/settings.json` Stop hook."
argument-hint: "[target-path] [--force]"
user-invocable: true
---

# harness-init

## Design Thinking

`harness-init` 은 **canonical-only foundation installer** 다. 공통 산출물(`harness-orchestrate`, `harness-planning`, `harness-context`, `harness-planner` 롤, `.claude/` Stop hook wiring, `.harness/` scaffold)은 **템플릿 + 스크립트로 고정**되어 있고, Claude 는 본 skill 을 읽은 뒤 단일 Bash 호출로 설치 스크립트를 돌리고 결과를 해석·보고만 한다. 공용 법(pair/cycle rhythm, authority, reviewed-work contract)은 `harness-context` skill 하나로 모든 subagent 에 주입되어 dispatch 시 자기 위치와 계약을 즉시 재구성할 수 있게 한다. **install.ts 는 `.claude/` 만 만진다** — `.codex/` 나 `.gemini/` 는 `/harness-sync` 가 사용자 명시적 요청 시에만 derive 한다. 프로젝트별 차이는 **pair 단위** 에만 존재하며 그 책임은 `harness-pair-dev` 가 가져간다.

## Methodology

### 1. Arguments

`/harness-init [<target>] [--force]`

- `<target>` — 대상 프로젝트 루트 경로. 생략 시 현재 작업 디렉터리(`process.cwd()`) 가 target. 상대/절대 경로 모두 허용, 스크립트가 절대 경로로 정규화한다.
- `--force` — 기존 `.harness/` 존재 시에도 진행. 이 경우 기존 디렉터리 전체가 삭제된 뒤 재초기화된다 (archive 없음 — `--force` 는 명시적 "날리고 다시" 의도).

`--provider` 플래그는 없다 — install 은 `.claude/` 만 만든다. Multi-platform 사용자는 init 후 `/harness-sync --provider codex,gemini` 로 opt-in 한다.

### 2. Execution

`$ARGUMENTS` 는 사용자가 `/harness-init` 뒤에 전달한 문자열 전체다 (예: 사용자가 `/harness-init /tmp/target --force` 를 입력하면 `$ARGUMENTS` 는 `/tmp/target --force` 가 된다). 생략 시 빈 문자열이며 install 스크립트가 cwd 를 기본 target 으로 쓴다.

Claude 는 본 skill 을 읽은 직후 **정확히 하나의 Bash 호출**을 실행한다. skill 디렉터리는 `${CLAUDE_SKILL_DIR}` 로 참조해야 플러그인이 어디에 설치되든 경로가 깨지지 않는다:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/install.ts $ARGUMENTS
```

스크립트는 stdout 으로 JSON summary 를 출력한다(`{target, harnessDir, stateMd, eventsMd, hook, claudeSettings, scaffolded, verification, nextStep}`). Claude 는 이 JSON 을 파싱해 사용자에게 사람이 읽을 수 있는 한 문단 요약으로 보고하고, `nextStep` 메시지(`/harness-sync` 안내 + `/harness-pair-dev --add` 안내)를 함께 전달한다.

본 skill 의 관할은 **호출 계약**까지다. `install.ts` 내부의 파일 복사 루틴, hook JSON merge 알고리즘, template placeholder 치환 로직은 스크립트 소스가 정본이다.

### 3. Post-install verification (자동, 스크립트 소유)

검증은 `install.ts` 가 **결정적 스크립트 로직** 으로 수행한다. Claude 는 인간의 `ls` 추리를 돌리지 않는다. 스크립트 출력 JSON 의 `verification` 블록이 다음을 담는다:

- `ok: true|false` — 모든 체크 통과 여부.
- `checks: { "<label>": boolean, ... }` — 정량 체크 각각의 결과. 체크 항목은 `.harness/{state.md, events.md, hook.sh, epics/}` + `hook.sh executable` + canonical `.claude/{skills/harness-orchestrate, skills/harness-planning, skills/harness-context, agents/harness-planner.md, settings.json}` 존재 확인 + `no placeholder residue`(`{{FOO}}` 잔존 0). `.codex/` / `.gemini/` 는 install 의 책임이 아니므로 검증 대상이 아니다.
- `failures: string[]` — 실패 항목 요약.
- `placeholderResidue: string[]` — 템플릿 치환이 끝나지 않은 파일 경로.

`verification.ok === false` 면 스크립트는 non-zero exit code 로 종료한다. Claude 는 JSON 을 파싱해 `verification.ok` 가 false 면 사용자에게 실패 항목을 보고하고 중단한다 (`ls` 재확인 금지 — 스크립트 결과가 유일한 진실 소스). 성공 시에는 요약 한 문단 + 설치 경로 목록만 사용자에게 전한다.

### 4. Re-run semantics

- **기본** — `<target>/.harness/` 가 이미 존재하면 비파괴 종료, stderr 로 충돌 메시지. 사용자에게 `--force` 사용 여부를 묻는 안내를 포함한다.
- **`--force`** — 기존 `<target>/.harness/` 를 **통째로 삭제** 한 뒤 새로 스캐폴드한다. `state.md` · `events.md` · `epics/` · `_archive/` 등 하위 산출물은 모두 소실된다 — `--force` 는 "현재 사이클을 완전히 폐기하고 처음부터 다시 시작" 을 명시적으로 요청하는 플래그다. 기존 사이클을 보존하면서 새 Goal 로 교체하고 싶으면 `--force` 대신 `init.ts --goal-source <markdown>` 으로 in-place reset 을 수행한다 (archive 경로로 state/events/epics 만 이동).
- 템플릿 기반 파일(`harness-orchestrate/SKILL.md`, `harness-planning/SKILL.md`, `harness-planner.md`) 은 idempotent 하게 덮어쓴다. 사용자가 해당 파일을 손으로 수정했다면 `--force` 시 복구 수단이 없으므로, 수정본은 git 이나 별도 백업으로 보관한다.

### 5. Sync relationship

`harness-init` 은 **canonical 만 설치한다**. 다른 platform 으로의 derive 는 `/harness-sync` 책임:

```
/harness-sync --provider codex,gemini   # 처음 multi-platform 추가 시
/harness-sync                            # 이후 detection 으로 disk 에 있는 platform 자동 derive
```

`harness-pair-dev` 가 pair 파일 저작 + registration + provider sync 를 모두 담당하지만, 자동 sync 는 detection 결과(disk 에 이미 있는 platform 만) 를 따른다. 즉 사용자가 codex/gemini 를 한 번도 추가한 적이 없으면 pair-dev 는 canonical 만 만지고 끝난다. `harness-init` 이 생성한 `harness-orchestrate` / `harness-planning` skill 본문에는 "Registered pairs" / "Available departments" 섹션이 빈 seed 상태로 존재하며, `harness-pair-dev --add` 가 `register-pair.ts` 를 통해 이 섹션을 append-edit 한다.

### 6. Init vs sync boundary

- `harness-init` 은 **one-time setup, claude-only** 이다. target 당 최초 1 회 실행, 이후는 `--force` 로만 재실행.
- `/harness-sync` 는 **ongoing platform derive** 다. canonical `.claude/` → `.codex/` / `.gemini/` 변환. `harness-pair-dev` 도 내부적으로 같은 sync.ts 를 호출.
- `/harness-init` 은 절대로 `sync.ts` 를 호출하지 않는다. multi-platform 은 사용자 opt-in 이다.

## Evaluation Criteria

- 실행 후 `<target>/.harness/{state.md, events.md, hook.sh, epics/}` 네 경로가 모두 존재한다.
- `<target>/.claude/skills/harness-orchestrate/SKILL.md`, `<target>/.claude/skills/harness-planning/SKILL.md`, `<target>/.claude/skills/harness-context/SKILL.md` 세 skill 이 템플릿 치환 완료본으로 작성되었다 (`{{...}}` 잔존 없음).
- `<target>/.claude/agents/harness-planner.md` 가 설치되어 있고 frontmatter `skills` 에 `harness-planning` 과 `harness-context` 두 항목이 모두 선언되어 있다.
- `<target>/.claude/settings.json` 의 `hooks.Stop` 이 `bash .harness/hook.sh` 로 wired 되어 있고, 기존 settings 항목은 merge 되어 보존된다.
- `<target>/.codex/`, `<target>/.gemini/` 가 install 후에 **존재하지 않는다** — 이 디렉터리들은 `/harness-sync` 가 사용자 명시적 요청 시에만 생성한다.
- 재실행 시 `--force` 없으면 비파괴 종료, `--force` 있으면 기존 `.harness/` 전체 삭제 후 재초기화(두 번 연속 `--force` 실행해도 결과 동일 = idempotent).
- `state.md` seed 가 새 스키마(헤더 3줄: Goal / Phase / loop + `## Next` 블록: To/EPIC/Task path/Intent/Prior tasks/Prior reviews + `## EPIC summaries` headed-list) 를 따르며 파이프 테이블이 아니다. EPIC 은 `### EP-N--slug` 헤딩 + outcome/roster/current/note 4 필드로 열거된다.
- `events.md` seed 가 단 한 줄 — `<ISO-ts> T0 orchestrator install — harness seeded at <target>`.
- `harness-orchestrate` / `harness-planning` / `harness-context` / `harness-planner` 본문이 LLM 즉석 저작이 아닌 `references/runtime/` 템플릿 원본에서 파생됐음을 디스크 비교로 확인 가능하다.
- 출력 JSON 의 `nextStep` 필드가 `/harness-sync` 와 `/harness-pair-dev --add` 두 다음 단계를 안내한다.

## Taboos

- 기존 `.harness/` 가 있는 target 에 `--force` 없이 설치를 강행한다 — 사용자 작업이 날아갈 수 있다.
- install 이 `.codex/` 또는 `.gemini/` 디렉터리를 만든다 — multi-platform 은 사용자 opt-in (`/harness-sync --provider ...`) 영역.
- target 의 `.harness/`, `.claude/` 바깥 경로를 수정한다 — `harness-init` 의 scope 는 canonical foundation 에 국한된다.
- `harness-orchestrate` / `harness-planning` / `harness-context` / `harness-planner` 본문을 LLM 이 즉석 저작한다 — 공통 템플릿 고정 원칙 위반.
- 설치 산출물에 `{{PAIR_SLUG}}` 등 placeholder 를 그대로 남긴다 — 템플릿 치환 실패.
- `/harness-init` 한 번 호출 안에서 `harness-pair-dev` 의 `--add`/`--improve`/`--split` 로직 또는 `harness-sync` 의 derive 를 수행한다 — scope 혼입, 책임 경계 위반.
- `install.ts`, `init.ts`, `hook.sh` 의 내부 로직(파일 복사 루틴, merge 알고리즘, loop-invert 조건) 을 본 SKILL.md 본문에 산문으로 재서술한다 — script/prompt 경계 위반.

## References

- `skills/harness-pair-dev/SKILL.md` — pair 추가·개선·분리 진입점, 설치 이후 프로젝트별 pair 개발을 담당.
- `skills/harness-sync/SKILL.md` — canonical `.claude/` → `.codex/` / `.gemini/` derive 진입점. multi-platform 사용자 opt-in.
- `${CLAUDE_SKILL_DIR}/scripts/install.ts` — 호출 대상 정본.
- `skills/harness-init/references/runtime/` — orchestrate/planning/context/planner/state/events 배포 템플릿 정본 (`*.template.md`).
