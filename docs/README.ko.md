<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

> ⚠️ 이 문서는 **축약 번역본**입니다. 현재 계약의 정본은 [English README](../README.md) 이며, 상세 예시와 최신 문구도 그 문서를 따릅니다.

<br clear="left" />

> **상태:** 0.3.0

## 현재 기준 요약

- `harness-loom`은 타깃 리포지토리에 런타임 하네스를 설치하고, 프로젝트별 producer-reviewer pair를 점진적으로 추가하는 팩토리 플러그인입니다.
- 정본 authoring surface는 `.harness/loom/` 입니다. 플랫폼 트리인 `.claude/`, `.codex/`, `.gemini/` 는 여기서 `node .harness/loom/sync.ts --provider <list>` 로 파생합니다.
- 런타임 상태는 `.harness/cycle/` 아래에 저장됩니다. 오케스트레이터는 `Planner | Pair | Finalizer | Halt` 4-state DFA 로 동작합니다.
- cycle-end work는 reviewer 없는 pair가 아니라 **singleton `harness-finalizer`** 가 담당합니다.
- `/harness-pair-dev` 로 추가되는 모든 pair는 최소 1명의 reviewer를 가져야 합니다. reviewer-less workflow는 pair roster에 넣지 않습니다.

## 핵심 명령

- `/harness-auto-setup [<target>] [--provider <list>]`
  타깃 프로젝트를 처음 설정하거나, 기존 하네스를 스냅샷한 뒤 현재 계약에 맞게 갱신합니다.
- `/harness-init [<target>]`
  타깃 프로젝트에 `.harness/loom/` 과 `.harness/cycle/` 기반 foundation runtime을 설치하거나 재설정합니다.
- `node .harness/loom/sync.ts --provider claude,codex,gemini`
  canonical staging을 원하는 플랫폼 트리로 배포합니다.
- `/harness-pair-dev --add <slug> "<purpose>" [--from <existing-pair>] [--reviewer <slug> ...]`
  현재 등록된 pair만 `--from` overlay source로 받아 최신 template 위에 호환되는 원본 지식을 보존해 `.harness/loom/`에 작성합니다.
- `/harness-pair-dev --improve <slug> "<purpose>"`
  positional purpose를 기준으로 기존 등록 pair를 개선합니다.
- `/harness-pair-dev --remove <slug>`
  active cycle이 해당 pair를 참조하면 거부하고, `.harness/cycle/` history를 보존한 채 pair-owned loom 파일만 안전하게 제거합니다.
- `/harness-orchestrate <goal.md>`
  타깃 측 런타임 오케스트레이터를 실행합니다.

`/harness-pair-dev` 변경은 `.harness/loom/`에만 기록됩니다. add/improve/remove 뒤에는 `node .harness/loom/sync.ts --provider <list>`를 다시 실행해 플랫폼 트리를 갱신합니다.

## 어디를 보면 되나

- 전체 설치 흐름, quickstart, 개념 설명: [English README](../README.md)
- 이번 릴리스 변경점: [CHANGELOG](../CHANGELOG.md)
- 기여 가이드: [CONTRIBUTING.md](../CONTRIBUTING.md)
