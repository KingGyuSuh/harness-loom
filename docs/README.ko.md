<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#멀티-플랫폼)

**최신 코딩 어시스턴트가 제공하는 범용 harness 위에, 프로덕션에 맞는 하네스를 입히세요.**

<br clear="left" />

`harness-loom`은 대상 리포지토리에 런타임 하네스를 설치하고, 프로젝트에 맞는 pair를 하나씩 키워 가는 팩토리 플러그인입니다.

요즘 어시스턴트 제품은 더 이상 단순한 "모델 + 프롬프트"가 아닙니다. 플래너, 훅, 서브에이전트, 스킬, 도구 라우팅, 제어 흐름처럼 작업이 어떻게 계획되고, 위임되고, 리뷰되고, 다시 이어지는지를 결정하는 범용 하네스를 함께 제공합니다. 이 계층은 분명 유용하지만, 여러분의 실제 프로덕션 시스템까지 이해하지는 못합니다. 어떤 리뷰가 중요한지, 어떤 산출물을 남겨야 하는지, 작업을 어떻게 쪼개야 하는지, 권한 경계는 어디인지 같은 것들은 여전히 프로젝트마다 다릅니다.

선택한 모델 스택이 이미 프로덕션 품질의 결과물을 낼 만큼 충분히 강해졌다면, 그다음의 핵심 레버리지는 모델 자체보다 **하네스 엔지니어링**으로 옮겨갑니다. 즉, 세션마다 같은 요구사항을 다시 프롬프트로 설명하는 대신, 리포지토리의 리뷰 기준, 작업 형태, 완료 정의를 버전 관리되는 구조로 고정하는 것입니다. `harness-loom`이 다루는 것은 모델 파인튜닝이 아니라 하네스 파인튜닝입니다.

`harness-loom`은 이미 어시스턴트 스택에서 프로덕션 잠재력을 확인했고, 이제 그것이 "한 번의 대화"가 아니라 "지속적으로 굴러가는 시스템"처럼 동작하기를 원하는 팀을 위한 도구입니다.

이 리포지토리는 팩토리입니다. 대상 프로젝트 쪽에 다음과 같은 런타임 하네스를 심습니다.

- 플래너와 오케스트레이터
- `.harness/` 아래의 공유 컨트롤 플레인
- 모든 서브에이전트가 함께 읽는 공통 런타임 컨텍스트
- 시간이 지나며 추가해 나가는 프로젝트별 producer-reviewer pair

대상 프로젝트의 `.harness/`는 세 개의 형제 네임스페이스로 나뉩니다. `loom/`은 install과 sync가 소유하는 정본 staging 트리, `cycle/`은 오케스트레이터가 소유하는 런타임 상태, `docs/`는 새로 도입된 빌트인 `harness-doc-keeper` producer가 소유하는 문서 스냅샷입니다. 플랫폼 트리(`.claude/`, `.codex/`, `.gemini/`)는 필요할 때 `.harness/loom/`에서 파생합니다.

## 왜 이런 구조인가

- **스킬 우선, 에이전트 후행.** 공통 방법론은 pair마다 하나의 `SKILL.md`에 모아 두어, 생산 규칙과 리뷰 규칙이 따로 놀지 않게 합니다.
- **Producer + Reviewer.** 하나의 pair는 한 명 이상의 reviewer로 확장할 수 있고, 각 reviewer는 서로 다른 축으로 평가합니다.
- **정본은 한 곳에서만.** 하네스는 `.harness/loom/`에서 작성하고, `.claude/`, `.codex/`, `.gemini/`는 필요할 때만 파생합니다.
- **훅 기반 실행.** 오케스트레이터가 다음 디스패치를 `.harness/cycle/state.md`에 써 두면, 훅이 수동 정리 없이 다음 사이클을 이어갑니다.
- **리포지토리 근거 기반 작성.** pair 생성 시 실제 대상 코드베이스를 읽기 때문에, 추상적인 boilerplate 대신 실제 파일과 패턴을 인용할 수 있습니다.

## 무엇이 설치되나

대상 리포지토리에서 `/harness-init`을 실행하면, 일회성 프롬프트 템플릿이 아니라 런타임 하네스가 설치됩니다.

```text
target project
└── .harness/
    ├── loom/                    # 정본 staging (install + sync 소유)
    │   ├── skills/
    │   │   ├── harness-orchestrate/
    │   │   ├── harness-planning/
    │   │   ├── harness-context/
    │   │   └── harness-doc-keeper/
    │   ├── agents/
    │   │   ├── harness-planner.md
    │   │   └── harness-doc-keeper-producer.md
    │   ├── hook.sh
    │   └── sync.ts
    ├── cycle/                   # 런타임 상태 (orchestrator 소유)
    │   ├── state.md
    │   ├── events.md
    │   └── epics/
    └── _archive/                # 과거 사이클; goal-different 리셋 시 생성
```

프로젝트 문서(루트 `*.md`, `docs/`)는 `.harness/` 바깥, **타겟 프로젝트 안에 직접** 쌓입니다. 이후 `node .harness/loom/sync.ts --provider claude` (멀티 플랫폼이라면 `codex,gemini`까지) 로 최소 하나의 플랫폼 트리를 파생하고, `/harness-pair-dev`로 도메인별 pair를 추가합니다. 빌트인 `harness-doc-keeper`는 reviewer 없는 producer로, 매 사이클이 멈추기 직전에 자동 실행되어 프로젝트 + goal + 사이클 활동을 읽고 이 프로젝트가 실제로 필요로 하는 문서(`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/design-docs/`, `docs/product-specs/`, `docs/exec-plans/` 등 — 증거가 뒷받침하는 범위 내)를 작성·갱신합니다. 사용자가 직접 호출하지 않으며, orchestrator가 halt 직전 마지막 reviewer-less 턴으로 디스패치합니다.

## 요구 사항

- **Node.js ≥ 22.6** — 스크립트는 네이티브 TypeScript stripping으로 실행됩니다. 별도 빌드 단계나 `package.json`은 없습니다.
- **git** — pair를 분할할 때 `--split`의 롤백 근거로 git 히스토리를 사용합니다.
- **지원되는 어시스턴트 CLI 최소 1개**, 인증 완료 상태:
  - [Claude Code](https://code.claude.com/docs) — 주 대상 플랫폼이며, 정본 staging인 `.harness/loom/`을 `node .harness/loom/sync.ts --provider claude`로 `.claude/`에 파생합니다.
  - [Codex CLI](https://developers.openai.com/codex/cli) — `node .harness/loom/sync.ts --provider codex`로 `.codex/`에 파생합니다.
  - [Gemini CLI](https://geminicli.com/docs/) — `node .harness/loom/sync.ts --provider gemini`로 `.gemini/`에 파생합니다.

## 설치

팩토리는 표준 `plugins/<name>/` 모노리포 레이아웃으로 배포됩니다. 저장소 루트에 `.claude-plugin/marketplace.json` 과 `.agents/plugins/marketplace.json` 이 있고, 실제 플러그인 트리는 `plugins/harness-loom/` 하위에 있습니다. 팩토리는 Claude Code 또는 Codex CLI 에서 작성하고, 타겟 프로젝트 안에서는 원하는 플랫폼 트리를 파생해서 사용합니다.

### Claude Code

로컬 동작 확인용 (1회용, 마켓플레이스 없이):

```bash
claude --plugin-dir ./plugins/harness-loom
```

영구 설치는 세션 안 마켓플레이스 흐름을 씁니다. 로컬 체크아웃:

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

공개 git 리포지토리 (GitHub shorthand):

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

특정 태그가 필요하면:

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

마켓플레이스 소스를 등록합니다. 인자는 저장소 루트(`.agents/plugins/marketplace.json` 이 있는 곳)를 가리킵니다.

```bash
# 로컬 체크아웃
codex marketplace add /path/to/harness-loom

# 공개 git 리포지토리
codex marketplace add KingGyuSuh/harness-loom

# 태그가 필요하면
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

그다음 Codex TUI 안에서 `/plugins` 를 실행하고, `Harness Loom` 마켓플레이스 항목을 열어 플러그인을 설치합니다.

### Gemini Runtime

팩토리는 Claude Code 또는 Codex CLI 에서 설치하고, 타겟 프로젝트 안에서 `.gemini/`를 파생해 Gemini 런타임으로 실행합니다.

1. Claude Code 또는 Codex CLI 에서 팩토리를 설치하고, 타겟 프로젝트에서 `/harness-init` + `node .harness/loom/sync.ts --provider gemini` 를 실행합니다. 이게 타겟 측 런타임 (`.harness/loom/`, `.harness/cycle/`, `.gemini/agents/`, `.gemini/skills/`, `AfterAgent` 훅이 들어간 `.gemini/settings.json`) 을 깔아 줍니다.
2. 그 타겟 프로젝트로 `cd` 한 뒤 `gemini` 를 실행합니다. CLI 가 workspace 범위의 `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, `.gemini/settings.json` 의 `AfterAgent` 훅을 자동 로드합니다.
3. 오케스트레이터 사이클이 Gemini 에서 그대로 돌아갑니다 — 팩토리 저작은 Claude / Codex 에서, 실제 실행은 세 플랫폼 어디서나 가능.

## 빠른 시작

```bash
cd your-project
claude

# 1) 정본 기반 설치 (.harness/loom/ + .harness/cycle/)
/harness-init

# 2) 정본 staging에서 최소 한 개의 플랫폼 트리를 파생합니다.
node .harness/loom/sync.ts --provider claude
#    멀티 플랫폼이면 원하는 모든 provider를 나열합니다.
# node .harness/loom/sync.ts --provider claude,codex,gemini

# 3) 이번 사이클의 목표 정의
echo "curses를 사용한 가벼운 터미널 스네이크 게임 출시" > goal.md

# 4) 프로젝트별 pair 추가
#    `<purpose>`는 두 번째 위치 인자입니다. 작성이 끝나면 위 sync 명령을
#    다시 실행해 파생 플랫폼 트리를 갱신합니다.
/harness-pair-dev --add game-design "snake.py 기능과 엣지 케이스 명세 작성"
/harness-pair-dev --add impl "명세에 맞춰 snake.py 구현" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 4a) reviewer 없는 opt-in: 결정론적/보조 작업(sync, format, mirror) 전용.
#     기본은 여전히 pair 입니다.
/harness-pair-dev --add asset-mirror "정본 자산을 파생 트리로 복사" \
  --reviewer none

# 4b) 새 pair를 플랫폼 트리에 반영하기 위해 sync 재실행
node .harness/loom/sync.ts --provider claude

# 5) 런타임 하네스 실행
/harness-orchestrate goal.md
```

산출물은 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` 아래에 쌓입니다. 런타임 상태는 `.harness/cycle/state.md`, 이벤트 로그는 `.harness/cycle/events.md`에 남습니다. 매 사이클이 멈추기 직전, orchestrator는 빌트인 `harness-doc-keeper` reviewer-less producer를 자동 디스패치하며, 이 producer는 프로젝트 + goal + 사이클 활동을 읽어 프로젝트 문서를 surgical하게 작성/갱신합니다 — 루트 마스터 파일(`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md` 등)과 `docs/` 하위 트리(`design-docs/`, `product-specs/`, `exec-plans/`, `generated/` 등 프로젝트 증거가 정당화하는 범위 내). 기존의 사람-작성 본문은 pointer 섹션 외부에서 byte-for-byte 보존됩니다.

## 핵심 개념

명령어, 파일, 상태 전반에서 반복해서 등장하는 개념들입니다. 아래 여섯 가지만 이해해도 나머지 문서를 읽는 데 큰 무리는 없습니다.

- **Harness** — 어시스턴트를 둘러싼 지속 레이어입니다. 상태 파일, 훅, 서브에이전트, 컨트랙트가 여기에 포함됩니다. `harness-loom`은 이 레이어를 여러분의 리포지토리에 맞게 조정합니다.
- **Pair** — 하나의 **producer**와 하나 이상의 **reviewer**가 하나의 `SKILL.md`를 공유하는 단위입니다. 도메인 작업을 설계하고 실행하는 기본 단위입니다.
- **Producer** — 코드, 명세, 분석 등 실제 작업을 수행하고 다음 액션을 제안하는 서브에이전트입니다.
- **Reviewer** — producer의 결과물을 특정 축으로 평가하는 서브에이전트입니다. 코드 품질, 명세 적합성, 보안 같은 축이 여기에 해당합니다.
- **EPIC / Task** — EPIC은 플래너가 정의한 성과 단위이고, Task는 그 EPIC 안에서 한 번 수행되는 producer-reviewer 라운드입니다. 관련 산출물은 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`에 기록됩니다.
- **Orchestrator vs Planner** — **orchestrator**는 `.harness/cycle/state.md`를 소유하고 응답당 정확히 하나의 producer(와 0·1·M개의 reviewer를 병렬로)를 디스패치합니다. **planner**는 그 루프 안에서 목표를 EPIC으로 분해하고, 각 EPIC에 대해 고정 global roster의 적용 구간과 same-stage upstream gate를 정합니다.

## 명령어

| 명령어 | 목적 |
|---------|---------|
| `/harness-init [<target>] [--force]` | 대상 프로젝트에 정본 `.harness/loom/` staging 트리와 `.harness/cycle/` 런타임 상태를 설치합니다. 런타임 스킬, `harness-planner` 에이전트, 빌트인 `harness-doc-keeper` producer, `.harness/loom/` 안의 self-contained `hook.sh` + `sync.ts` 사본을 생성합니다. 플랫폼 트리는 건드리지 않습니다. |
| `node .harness/loom/sync.ts --provider <list>` | 정본 `.harness/loom/`에서 플랫폼 트리(`.claude/`, `.codex/`, `.gemini/`)를 파생합니다. 단방향이며 `.harness/loom/`으로는 절대 되돌려 쓰지 않습니다. `--provider` 없이 실행하면 디스크에 이미 존재하는 플랫폼 트리만 자동 감지합니다. |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | 현재 코드베이스에 맞는 새 producer-reviewer pair를 작성합니다. `<purpose>`는 두 번째 위치 인자입니다. `--reviewer`를 반복하면 1:N 구성이 되고, `--reviewer none`을 넘기면 reviewer 없는 producer-only 그룹이 됩니다(결정론적/보조 작업 전용; 기본은 여전히 pair). 작성은 `.harness/loom/`에만 쓰며, 이후 `node .harness/loom/sync.ts --provider <list>`를 다시 실행합니다. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | 기존 pair를 루브릭과 현재 코드베이스 기준으로 다시 점검하고 개선합니다. 개선 후 sync를 다시 실행해 플랫폼 트리를 갱신합니다. |
| `/harness-pair-dev --split <slug>` | 과도하게 커진 pair를 더 좁은 두 pair로 나눕니다. 분할 후 sync를 다시 실행합니다. |
| `/harness-orchestrate <goal.md>` | 대상 측 런타임 진입점입니다. 목표를 읽고 응답당 하나의 producer(와 페어링된 reviewer set)를 디스패치하며, 훅 재진입을 통해 사이클을 이어갑니다. halt 직전, 빌트인 `harness-doc-keeper` reviewer-less producer를 자동 디스패치한 뒤 `Next`를 비웁니다. |

## 팩토리와 런타임

```text
factory (이 리포지토리)                           target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          설치  ->      .harness/loom/{skills,agents,hook.sh,sync.ts}
plugins/harness-loom/skills/harness-init/                            .harness/cycle/{state.md,events.md,epics/}
plugins/harness-loom/skills/harness-init/references/runtime/ 시드 -> .harness/loom/skills/<slug>/SKILL.md
plugins/harness-loom/skills/harness-pair-dev/      작성  ->      .harness/loom/agents/<slug>-producer.md
                                                                    .harness/loom/agents/<reviewer>.md
                                                                    .harness/loom/skills/<slug>/SKILL.md
                                                     |
                                                     +-- node .harness/loom/sync.ts --provider <list>
                                                         -> .claude/{agents,skills,settings.json}
                                                         -> .codex/
                                                         -> .gemini/
                                                     |
                                                     +-- harness-doc-keeper가 사이클 halt에서 자동 실행
                                                         -> CLAUDE.md / AGENTS.md (pointer 섹션)
                                                         -> ARCHITECTURE.md / DESIGN.md / ...
                                                         -> docs/{design-docs,product-specs,exec-plans,generated,...}/
```

이 분리는 의도적입니다.

- 팩토리 자체는 작고, 사용자가 직접 호출할 수 있게 유지합니다.
- 대상 런타임은 프로젝트별 작업 상태를 보관합니다.
- 제공자별 트리는 작성 표면이 아니라 파생 산출물입니다.

## 멀티 플랫폼

`sync.ts`가 적용하는 플랫폼 핀은 다음과 같습니다.

| 플랫폼 | 모델 | 훅 이벤트 | 비고 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json`이 `.harness/loom/hook.sh`를 트리거합니다. |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | 서브에이전트는 미니 모델을 사용하지 않습니다. |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | 스킬이 플랫폼 트리에 미러링됩니다. |

## 언제 쓰면 좋은가

다음과 같은 경우 `harness-loom`이 잘 맞습니다.

- 기본 어시스턴트 환경이 이미 리포지토리에서 실제 작업을 수행할 만큼 충분히 강할 때
- 남은 과제가 반복 가능성, 리뷰 구조, 상태 연속성, 도메인 적합성일 때
- 하네스 규칙을 그때그때 다시 프롬프트하기보다 버전 관리되는 파일에 고정하고 싶을 때
- 하나의 정본 작성 표면에서 결정론적으로 멀티 플랫폼 파생을 만들고 싶을 때

반대로, 아직 기본 모델 스택이 여러분의 작업을 제대로 감당할 수 있는지 자체를 평가 중이라면 이 도구는 이르다고 보는 편이 맞습니다. 이 프로젝트는 범용 하네스가 이미 어느 정도 쓸 만하다는 전제 위에서, 그것을 프로덕션용 시스템으로 다듬는 데 집중합니다.

## 기여하기

이슈, 버그 수정, 루브릭 개선을 환영합니다. 개발 루프, 스모크 테스트 명령, 범위 가이드는 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참고하세요. 새로운 사용자 호출형 스킬 추가나 orchestrator 리듬 변경은 먼저 논의부터 시작하는 것을 권장합니다. 보안 이슈 제보는 [SECURITY.md](../SECURITY.md)를 확인해 주세요. 모든 참여는 [Code of Conduct](../CODE_OF_CONDUCT.md)의 적용을 받습니다.

## 프로젝트 문서

- [CHANGELOG.md](../CHANGELOG.md) - 릴리스 이력
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 개발 설정 및 PR 흐름
- [SECURITY.md](../SECURITY.md) - 책임 있는 공개
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - 커뮤니티 기대 사항
- [LICENSE](../LICENSE) - Apache 2.0
- [NOTICE](../NOTICE) - Apache 2.0 귀속 고지
