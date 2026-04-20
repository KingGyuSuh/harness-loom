<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.4-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#マルチプラットフォーム)

**最新のコーディングアシスタントが備える汎用ハーネスの上に、本番運用向けのハーネスを重ねていくためのツールです。**

<br clear="left" />

> **ステータス:** 0.1.4 — 初期公開版です。1.0 までは公開インターフェースが変わる可能性があります。重要な変更は [CHANGELOG](../CHANGELOG.md) を確認してください。

`harness-loom` は、対象リポジトリにランタイムハーネスを導入し、pair ごとに少しずつ育てていくファクトリプラグインです。

最近のアシスタント製品は、もはや単なる「モデル + プロンプト」ではありません。プランナー、フック、サブエージェント、スキル、ツールルーティング、制御フローといった汎用ハーネスを備えており、仕事をどう計画し、委譲し、レビューし、再開するかまで面倒を見ます。この層は確かに便利ですが、あなたの本番システムそのものを理解しているわけではありません。どのレビューが重要か、何を成果物として残すべきか、仕事をどう分解するか、権限の境界をどこに置くかは、プロジェクトごとに違います。

選んだモデルスタックがすでに本番品質の成果を出せる段階に来ると、次の差分はモデル選びよりも **harness engineering** に移ります。つまり、毎回プロンプトで説明し直すのではなく、リポジトリのレビュー基準、タスクの形、Definition of Done をバージョン管理された構造として固定するということです。`harness-loom` が扱うのはモデルの微調整ではなく、ハーネスの微調整です。

`harness-loom` は、すでにアシスタントスタックに本番投入の手応えがあり、これを単発のセッションではなく、継続して回るシステムとして運用したいチーム向けのツールです。

このリポジトリはファクトリとして機能し、対象側に次のようなランタイムハーネスを植え込みます。

- planner と orchestrator
- `.harness/` 配下の共有コントロールプレーン
- すべてのサブエージェントが読む共通ランタイムコンテキスト
- 時間をかけて追加していく、プロジェクト固有の producer-reviewer pair

正本は `.claude/` にあり、`.codex/` と `.gemini/` は必要に応じてそこから派生させます。

## なぜこの形なのか

- **スキルを先に、エージェントは後から。** 共有の方法論を pair ごとの `SKILL.md` に集約することで、実装ルールとレビュールールのずれを防ぎます。
- **Producer と Reviewer の分業。** 1 つの pair は 1 人以上の reviewer に広げられ、それぞれが別の評価軸を担当できます。
- **正本は 1 か所だけ。** ハーネスは `.claude/` で記述し、`.codex/` と `.gemini/` は必要なときだけ派生します。
- **フック駆動の実行。** orchestrator が次の dispatch を `.harness/state.md` に書き出し、フックが手作業なしで次のサイクルへつなぎます。
- **リポジトリに根ざした作成。** pair の生成時に実際の対象コードベースを読むので、抽象的な boilerplate ではなく、実在するファイルやパターンを前提にできます。

## インストールされるもの

対象リポジトリで `/harness-init` を実行すると、使い捨てのプロンプトテンプレートではなく、ランタイムハーネスがインストールされます。

```text
target project
├── .harness/
│   ├── state.md
│   ├── events.md
│   ├── hook.sh
│   └── epics/
├── .claude/
│   ├── agents/
│   │   └── harness-planner.md
│   ├── skills/
│   │   ├── harness-orchestrate/
│   │   ├── harness-planning/
│   │   └── harness-context/
│   └── settings.json
└── プロジェクト固有の producer / reviewer pair
```

その後、`/harness-pair-dev` でドメイン固有の pair を追加し、必要なら `/harness-sync` で Codex / Gemini 向けのツリーを派生できます。

## 要件

- **Node.js ≥ 22.6** — スクリプトはネイティブの TypeScript stripping で動作します。ビルド工程や `package.json` は不要です。
- **git** — pair の分割時に `--split` の巻き戻し根拠として git 履歴を使います。
- **対応するアシスタント CLI を少なくとも 1 つ**、認証済みで利用できること:
  - [Claude Code](https://code.claude.com/docs) — 主対象のプラットフォームであり、`.claude/` が正本です。
  - [Codex CLI](https://developers.openai.com/codex/cli) — `/harness-sync --provider codex` で派生します。
  - [Gemini CLI](https://geminicli.com/docs/) — `/harness-sync --provider gemini` で派生します。

## インストール

ファクトリは標準の `plugins/<name>/` モノレポレイアウトで配布されます。リポジトリ root に `.claude-plugin/marketplace.json` と `.agents/plugins/marketplace.json` があり、実際のプラグインツリーは `plugins/harness-loom/` 配下に置かれます。**ファクトリ自体は Claude Code または Codex CLI で動かします。** Gemini CLI は *ランタイム消費者* として対応しています (下の「Gemini CLI (runtime only)」セクション)。

### Claude Code

ローカル動作確認用 (単一セッション、marketplace なし):

```bash
claude --plugin-dir ./plugins/harness-loom
```

永続インストールはセッション内 marketplace フローを使います。ローカル checkout:

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

公開 git リポジトリ (GitHub shorthand):

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

特定タグを固定:

```text
/plugin marketplace add KingGyuSuh/harness-loom@v0.1.4
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

marketplace source を追加します。引数はリポジトリのルート (`.agents/plugins/marketplace.json` がある場所) を指します。

```bash
# ローカル checkout
codex marketplace add /path/to/harness-loom

# 公開 git リポジトリ
codex marketplace add KingGyuSuh/harness-loom

# タグを固定
codex marketplace add KingGyuSuh/harness-loom@v0.1.4
```

その後、Codex TUI で `/plugins` を実行し、`Harness Loom` marketplace エントリを開いてプラグインをインストールします。

### Gemini CLI (runtime only)

harness-loom の **ファクトリ自体は Gemini extension としてインストールできません** — Gemini の extension ローダーはリポジトリ root を extension root にハードコードしており、ファクトリが採用している Codex / Claude の `plugins/<name>/` モノレポ規約と衝突します。代わりに Gemini CLI は **ターゲットプロジェクトに配置されたランタイムハーネスを消費する** プラットフォームとして対応します。

1. Claude Code または Codex CLI でファクトリをインストールし、ターゲットプロジェクトで `/harness-init` + `/harness-sync --provider gemini` を実行します。これによりターゲット側ランタイム (`.harness/`, `.gemini/agents/`, `.gemini/skills/`, `AfterAgent` フック付きの `.gemini/settings.json`) が導入されます。
2. そのターゲットプロジェクトへ `cd` して `gemini` を起動します。CLI が workspace スコープの `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, `.gemini/settings.json` の `AfterAgent` フックを自動ロードします。
3. オーケストレータサイクルがそのまま Gemini で回ります — ファクトリ著作は Claude / Codex、実行は三プラットフォームどれでも。

## クイックスタート

```bash
cd your-project
claude

# 1) 正本の基盤をインストール
/harness-init

# 2) 今回のサイクルのゴールを定義
echo "curses を使った軽量なターミナル Snake ゲームを出荷する" > goal.md

# 3) プロジェクト固有の pair を追加
#    `<purpose>` は 2 番目の位置引数です。`--purpose` フラグはもう受け付けません。
/harness-pair-dev --add game-design "snake.py の機能とエッジケースを仕様化する"
/harness-pair-dev --add impl "仕様に沿って snake.py を実装する" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 3a) reviewer なしの opt-in: 決定論的 / 補助タスク (sync, format, mirror) 専用。
#     既定はあくまで pair です。
/harness-pair-dev --add asset-mirror "正本アセットを派生ツリーへコピーする" \
  --reviewer none

# 4) （任意）正本 .claude/ から Codex / Gemini 向けツリーを派生
/harness-sync --provider codex,gemini

# 5) ランタイムハーネスを実行
/harness-orchestrate goal.md
```

出力は `.harness/epics/EP-N--<slug>/{tasks,reviews}/` に蓄積されます。ランタイム状態は `.harness/state.md`、イベントログは `.harness/events.md` に残ります。

## コア概念

コマンド、ファイル、状態をまたいで繰り返し出てくる用語です。以下の 6 つを押さえれば、このリポジトリの全体像は追えます。

- **Harness** — アシスタントを取り巻く持続的な層です。状態ファイル、フック、サブエージェント、契約がここに含まれます。`harness-loom` はこの層を各リポジトリ向けに形作ります。
- **Pair** — 1 人の **producer** と 1 人以上の **reviewer** が 1 つの `SKILL.md` を共有する単位です。ドメイン作業を設計し実行する最小単位です。
- **Producer** — コード、仕様、分析などの実作業を担い、次のアクションを提案するサブエージェントです。
- **Reviewer** — producer の成果を特定の評価軸で採点するサブエージェントです。コード品質、仕様適合性、セキュリティなどが代表的です。
- **EPIC / Task** — EPIC は planner が定義する成果単位で、Task はその EPIC の中で 1 回行われる producer-reviewer ラウンドです。成果物は `.harness/epics/EP-N--<slug>/{tasks,reviews}/` に保存されます。
- **Orchestrator vs Planner** — **orchestrator** は `.harness/state.md` を管理し、応答ごとに 1 つの pair だけを dispatch します。**planner** はそのループの内部でゴールを EPIC と roster に分解します。

## コマンド

| コマンド | 目的 |
|---------|---------|
| `/harness-init [<target>] [--force]` | 対象プロジェクトに正本 `.claude/` の基盤を組み込みます。`.harness/`、ランタイムスキル、`harness-planner` エージェント、フック接続を生成します。 |
| `/harness-sync [--provider <list>]` | 正本 `.claude/` から `.codex/` と `.gemini/` を派生します。一方向同期であり、`.claude/` には書き戻しません。 |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | 現在のコードベースに根ざした新しい producer-reviewer pair を作成します。`<purpose>` は 2 番目の位置引数です。`--reviewer` を繰り返せば 1:N 構成、`--reviewer none` を渡せば reviewer 無しの producer-only グループになります（決定論的 / 補助タスク専用、既定はあくまで pair）。 |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | 既存 pair をルーブリックと現在のコードベースに照らして再監査し、改善します。 |
| `/harness-pair-dev --split <slug>` | 肥大化した pair を、より狭い 2 つの pair に分割します。 |
| `/harness-orchestrate <goal.md>` | 対象側ランタイムの入口です。ゴールを読み、応答ごとに 1 つの pair を dispatch し、フック再入でサイクルを進めます。 |

## ファクトリとランタイム

```text
factory (このリポジトリ)                          target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          installs ->      .harness/{state,events,hook,epics}/
plugins/harness-loom/skills/harness-pair-dev/      authors  ->      .claude/agents/<slug>-producer.md
plugins/harness-loom/skills/harness-sync/          derives  ->      .claude/agents/<reviewer>.md
plugins/harness-loom/skills/harness-init/references/runtime/ seeds -> .claude/skills/<slug>/SKILL.md
                                               .claude/settings.json
                                                     |
                                                     +-- /harness-sync (opt-in)
                                                         -> .codex/
                                                         -> .gemini/
```

この分離は意図的です。

- ファクトリ自体は小さく保ち、ユーザーが直接呼び出せるようにします。
- 対象ランタイムは、プロジェクト固有の作業状態を保持します。
- プロバイダー別のツリーは執筆対象ではなく、派生成果物です。

## マルチプラットフォーム

`sync.ts` が適用するプラットフォーム pin は次のとおりです。

| プラットフォーム | モデル | フックイベント | 備考 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` が `.harness/hook.sh` を起動します。 |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | サブエージェントは mini model を使いません。 |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | スキルはプラットフォームツリーにミラーされます。 |

## どんなときに使うべきか

次のような状況では `harness-loom` が向いています。

- ベースのアシスタント環境が、すでにリポジトリで実作業をこなせるだけの力を持っている
- 残る課題が、再現性、レビュー構造、状態の継続性、ドメインへの適合にある
- ハーネスのルールを、その場その場でプロンプトし直すのではなく、バージョン管理されたファイルとして保持したい
- 1 つの正本から決定的にマルチプラットフォームへ派生したい

逆に、そもそも基盤モデルが自分たちの仕事を扱えるかどうかをまだ見極めている段階なら、このツールを導入するには早すぎます。このプロジェクトは、汎用ハーネスがすでに一定の役に立つという前提の上で、それを本番向けのシステムに鍛えていくことに焦点を当てています。

## コントリビュート

Issue、バグ修正、ルーブリック改善の提案を歓迎します。開発ループ、スモークテストの手順、スコープの考え方は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。ユーザーが直接呼べる新しいスキルの追加や orchestrator のリズム変更は、まず議論から始めることを勧めます。セキュリティ報告は [SECURITY.md](../SECURITY.md) を確認してください。すべての参加は [Code of Conduct](../CODE_OF_CONDUCT.md) に従います。

## プロジェクト文書

- [CHANGELOG.md](../CHANGELOG.md) - リリース履歴
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 開発設定と PR フロー
- [SECURITY.md](../SECURITY.md) - 脆弱性の責任ある開示
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - コミュニティの期待事項
- [LICENSE](../LICENSE) - Apache 2.0
- [NOTICE](../NOTICE) - Apache 2.0 に基づく帰属表示
