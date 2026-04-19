---
name: harness-sync
description: "Use when `/harness-sync [--provider <list>]` is invoked to derive the canonical `.claude/` tree into `.codex/` and `.gemini/`. Strictly one-way canonical→derived; sync never writes to `.claude/`. `--provider` 생략 시 이미 존재하는 derived 디렉터리(`.codex/`, `.gemini/`)만 자동 감지 — 처음 multi-platform 을 시작하려면 `--provider codex,gemini` 로 opt-in."
argument-hint: "[--provider codex,gemini]"
user-invocable: true
---

# harness-sync

## Design Thinking

`harness-sync` 는 **canonical `.claude/` → derived platform 으로의 결정적 one-way 통로**다. `harness-init` 은 canonical 만 깔고 끝나고, `harness-pair-dev` 는 canonical 만 편집한다 — multi-platform 배포는 사용자가 명시적으로 원할 때만 일어나야 한다는 디자인. 이 skill 은 `sync.ts` CLI 를 한 번 호출하고 결과를 보고하는 얇은 wrapper 다. 본문에 sync 알고리즘 자체는 재서술하지 않는다 — 정본은 `sync.ts` 소스다.

sync 는 `.claude/` 를 **절대 건드리지 않는다** (canonical 은 read-only 관점). `--provider claude` 를 주면 hard error 로 거부되며 `/harness-init --force` 로 안내된다. `--provider` 생략 시 detection 은 derived platform 만 본다: `.codex/` 가 disk 에 있으면 codex, `.gemini/` 가 있으면 gemini. 처음 codex/gemini 를 추가하려면 명시적으로 `--provider codex,gemini` 로 opt-in.

## Methodology

### 1. Arguments

`/harness-sync [--provider <list>]`

- `--provider <list>` — `codex`, `gemini` 의 쉼표 구분 subset (예: `--provider codex,gemini`). 생략 시 disk 의 derived 디렉터리만 자동 감지. `claude` 를 포함하면 hard error (canonical 정상화는 `/harness-init --force` 영역).

### 2. Execution

`$ARGUMENTS` 는 사용자가 `/harness-sync` 뒤에 전달한 문자열 전체다. Claude 는 본 skill 을 읽은 직후 **정확히 하나의 Bash 호출**을 cwd 에서 실행한다:

```bash
node ${CLAUDE_SKILL_DIR}/../harness-pair-dev/scripts/sync.ts $ARGUMENTS
```

스크립트는 stdout 으로 JSON summary 를 출력한다(`{providers, codex?, gemini?}` — 각 provider 별로 `{copied: [...], deleted: [...]}`). 감지된 derived provider 가 없으면 `{providers: [], note: "..."}` 형태로 no-op 안내만 온다. Claude 는 이 JSON 을 파싱해 사용자에게 사람이 읽을 수 있는 한 문단 요약으로 보고한다.

본 skill 의 관할은 **호출 계약**까지다. agent 변환 (codex TOML, gemini frontmatter), hook 설정 작성 (`.codex/hooks.json` Stop, `.gemini/settings.json` AfterAgent), stale agent cleanup 같은 결정적 로직은 `sync.ts` 소스가 정본이다.

### 3. When to call

- **Multi-platform 처음 추가**: `/harness-init` 직후 `/harness-sync --provider codex,gemini` 로 `.codex/` 와 `.gemini/` 디렉터리 생성 + agent/skill 변환 배포 + hook 설정.
- **새 platform 1개만 추가**: `/harness-sync --provider gemini` 처럼 단일 provider 로 호출.
- **canonical 변경 후 re-derive**: `/harness-pair-dev --add` 가 자동으로 sync 호출하지만, 사용자가 직접 `.claude/` 를 편집했거나 template 이 업그레이드된 경우 수동 호출.
- **stale 정리**: canonical 에서 agent 가 삭제된 후 sync 를 돌리면 derived tree 의 대응 agent 도 정리된다 (`cleanStaleAgents`).
- **canonical 정상화가 필요한 경우는 여기가 아니다**: `.claude/` 자체를 다시 찍고 싶으면 `/harness-init --force` 가 정답.

### 4. What it does NOT do

- `.claude/` 하위 어느 것도 건드리지 않는다 — `settings.json`, `agents/`, `skills/` 전부 canonical 이며 sync 는 read-only 관점. `.claude/` 를 다시 찍는 책임은 `/harness-init --force`.
- `.harness/` 하위 control plane 은 손대지 않는다.

## Evaluation Criteria

- description 이 트리거 키워드(`/harness-sync`, `--provider`)를 포함하고 canonical-read-only + opt-in detection 을 한 문장으로 설명한다.
- 본문이 sync 알고리즘을 재서술하지 않고 `sync.ts` 소스에 위임한다 (script/prompt 경계).
- 출력 JSON 에 `providers` 필드가 있어 어떤 derived provider 가 실제 처리됐는지 사용자가 즉시 알 수 있다.
- `.claude/` 를 건드리지 않는다는 canonical-read-only 원칙과 `/harness-init --force` 로 안내되는 예외 경로가 본문에 명시된다.
- 호출이 **단일 Bash one-shot** 이며 Claude 는 결과 해석만 한다 (LLM 이 sync 로직을 즉석 추리하지 않는다).

## Taboos

- `sync.ts` 의 내부 로직(deployCodex/deployGemini 의 변환, hook 설정 JSON shape) 을 본 skill 본문에 산문으로 재서술한다 — script/prompt 경계 위반.
- `.claude/` 하위 어떤 파일이든 sync 가 쓴다 — canonical-read-only 원칙 위반. `/harness-init --force` 로 보내는 게 정답.
- `--provider claude` 를 허용하려 한다 — 스크립트가 이미 hard error 로 막지만 본 skill 이 그걸 우회하거나 override 하려 하면 안 된다.
- `--provider` 생략 시 자동으로 codex/gemini 디렉터리를 생성한다 — opt-in 원칙 위반. Detection 은 "이미 disk 에 있는 derived 디렉터리만" 이다.
- 한 호출 안에 canonical 편집과 sync 를 동시에 수행한다 — sync 는 read-only canonical → write derived 이므로 canonical 편집은 `harness-pair-dev` 책임.
- Claude 가 `sync.ts` 가 아닌 자체 파일 복사 루프로 derive 를 시도한다 — 결정적 변환은 스크립트 소유.

## References

- `../harness-pair-dev/scripts/sync.ts` — 호출 대상 정본. `runSync({targetRoot, providers})` 와 `detectDeployedProviders(targetRoot)` 를 export.
- `../harness-init/SKILL.md` — canonical scaffold 책임 분담.
- `../harness-pair-dev/SKILL.md` — pair 편집 후 자동 sync 호출 흐름.
