<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.2-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

> ⚠️ この文書は**短縮翻訳版**です。現在の契約の正本は [English README](../README.md) であり、詳細な例や最新の文言もそちらを優先してください。

<br clear="left" />

> **ステータス:** 0.2.2

## 現在の要点

- `harness-loom` は、対象リポジトリにランタイムハーネスを導入し、プロジェクト固有の producer-reviewer pair を段階的に追加していくファクトリプラグインです。
- 正本の authoring surface は `.harness/loom/` です。`.claude/`、`.codex/`、`.gemini/` は `node .harness/loom/sync.ts --provider <list>` でここから派生します。
- ランタイム状態は `.harness/cycle/` に保存されます。orchestrator は `Planner | Pair | Finalizer | Halt` の 4-state DFA として動きます。
- サイクル終端の作業は reviewer のない pair ではなく、**singleton の `harness-finalizer`** が担当します。
- `/harness-pair-dev` で追加する pair は必ず 1 人以上の reviewer を持ちます。reviewer-less workflow は pair roster に入れません。

## 主なコマンド

- `/harness-init [<target>] [--force]`
  対象プロジェクトに `.harness/loom/` と `.harness/cycle/` ベースのランタイムを導入します。
- `node .harness/loom/sync.ts --provider claude,codex,gemini`
  canonical staging を必要なプラットフォームツリーへ配備します。
- `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug> ...]`
  現在のコードベースに合わせて新しい producer-reviewer pair を作成します。
- `/harness-pair-dev --improve <slug> [--hint "<text>"]`
  既存 pair をリポジトリ根拠に基づいて改善します。
- `/harness-pair-dev --split <slug>`
  肥大化した pair を、より狭い 2 つの pair に分割します。
- `/harness-orchestrate <goal.md>`
  対象側ランタイムの orchestrator を起動します。

## 参照先

- インストール手順、quickstart、概念説明: [English README](../README.md)
- 今回のリリース変更点: [CHANGELOG](../CHANGELOG.md)
- コントリビューションガイド: [CONTRIBUTING.md](../CONTRIBUTING.md)

