<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#マルチプラットフォーム)

**最新のコーディングアシスタントが備える汎用ハーネスの上に、本番運用向けのハーネスを重ねていくためのツールです。**

<br clear="left" />

> **ステータス:** 0.2.0 — 初期公開版です。1.0 までは公開インターフェースが変わる可能性があります。重要な変更は [CHANGELOG](../CHANGELOG.md) を確認してください。

`harness-loom` は、対象リポジトリにランタイムハーネスを導入し、pair ごとに少しずつ育てていくファクトリプラグインです。

最近のアシスタント製品は、もはや単なる「モデル + プロンプト」ではありません。プランナー、フック、サブエージェント、スキル、ツールルーティング、制御フローといった汎用ハーネスを備えており、仕事をどう計画し、委譲し、レビューし、再開するかまで面倒を見ます。この層は確かに便利ですが、あなたの本番システムそのものを理解しているわけではありません。どのレビューが重要か、何を成果物として残すべきか、仕事をどう分解するか、権限の境界をどこに置くかは、プロジェクトごとに違います。

選んだモデルスタックがすでに本番品質の成果を出せる段階に来ると、次の差分はモデル選びよりも **harness engineering** に移ります。つまり、毎回プロンプトで説明し直すのではなく、リポジトリのレビュー基準、タスクの形、Definition of Done をバージョン管理された構造として固定するということです。`harness-loom` が扱うのはモデルの微調整ではなく、ハーネスの微調整です。

`harness-loom` は、すでにアシスタントスタックに本番投入の手応えがあり、これを単発のセッションではなく、継続して回るシステムとして運用したいチーム向けのツールです。

このリポジトリはファクトリとして機能し、対象側に次のようなランタイムハーネスを植え込みます。

- planner と orchestrator
- `.harness/` 配下の共有コントロールプレーン
- すべてのサブエージェントが読む共通ランタイムコンテキスト
- 時間をかけて追加していく、プロジェクト固有の producer-reviewer pair

対象プロジェクトの `.harness/` は 3 つの兄弟ネームスペースに分かれます。`loom/` は install と sync が所有する正本 staging ツリー、`cycle/` は orchestrator が所有するランタイム状態、`docs/` は新たに導入された組み込み `harness-doc-keeper` producer が所有するドキュメントスナップショットです。プラットフォームツリー (`.claude/`、`.codex/`、`.gemini/`) は必要に応じて `.harness/loom/` から派生させます。

## なぜこの形なのか

- **スキルを先に、エージェントは後から。** 共有の方法論を pair ごとの `SKILL.md` に集約することで、実装ルールとレビュールールのずれを防ぎます。
- **Producer と Reviewer の分業。** 1 つの pair は 1 人以上の reviewer に広げられ、それぞれが別の評価軸を担当できます。
- **正本は 1 か所だけ。** ハーネスは `.harness/loom/` で記述し、`.claude/`、`.codex/`、`.gemini/` は必要なときだけ派生します。
- **フック駆動の実行。** orchestrator が次の dispatch を `.harness/cycle/state.md` に書き出し、フックが手作業なしで次のサイクルへつなぎます。
- **リポジトリに根ざした作成。** pair の生成時に実際の対象コードベースを読むので、抽象的な boilerplate ではなく、実在するファイルやパターンを前提にできます。

## インストールされるもの

対象リポジトリで `/harness-init` を実行すると、使い捨てのプロンプトテンプレートではなく、ランタイムハーネスがインストールされます。

```text
target project
└── .harness/
    ├── loom/                    # 正本 staging (install + sync が所有)
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
    ├── cycle/                   # ランタイム状態 (orchestrator 所有)
    │   ├── state.md
    │   ├── events.md
    │   └── epics/
    └── _archive/                # 過去のサイクル; goal-different リセット時に作成
```

プロジェクトドキュメント (ルート `*.md`、`docs/`) は `.harness/` の外、**対象プロジェクト内に直接**保存されます。その後、`node .harness/loom/sync.ts --provider claude` (マルチプラットフォームなら `codex,gemini` も) で少なくとも 1 つのプラットフォームツリーを派生し、`/harness-pair-dev` でドメイン固有の pair を追加します。組み込みの `harness-doc-keeper` は reviewer のいない producer で、毎サイクルの停止直前に自動実行され、プロジェクト + goal + サイクル活動を読み取り、このプロジェクトが実際に必要とするドキュメント (`CLAUDE.md`、`AGENTS.md`、`ARCHITECTURE.md`、`docs/design-docs/`、`docs/product-specs/`、`docs/exec-plans/` など、証拠が正当化する範囲内) を作成・更新します。ユーザが直接呼び出すことはなく、orchestrator が halt 直前の最後の reviewer-less ターンとして dispatch します。

## 要件

- **Node.js ≥ 22.6** — スクリプトはネイティブの TypeScript stripping で動作します。ビルド工程や `package.json` は不要です。
- **git** — pair の分割時に `--split` の巻き戻し根拠として git 履歴を使います。
- **対応するアシスタント CLI を少なくとも 1 つ**、認証済みで利用できること:
  - [Claude Code](https://code.claude.com/docs) — 主対象のプラットフォームであり、正本 staging の `.harness/loom/` を `node .harness/loom/sync.ts --provider claude` で `.claude/` に派生します。
  - [Codex CLI](https://developers.openai.com/codex/cli) — `node .harness/loom/sync.ts --provider codex` で `.codex/` に派生します。
  - [Gemini CLI](https://geminicli.com/docs/) — `node .harness/loom/sync.ts --provider gemini` で `.gemini/` に派生します。

## インストール

ファクトリは標準の `plugins/<name>/` モノレポレイアウトで配布されます。リポジトリ root に `.claude-plugin/marketplace.json` と `.agents/plugins/marketplace.json` があり、実際のプラグインツリーは `plugins/harness-loom/` 配下に置かれます。ファクトリは Claude Code または Codex CLI で扱い、ターゲットプロジェクト内では必要なプラットフォームツリーを派生して使います。

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

必要ならタグを固定:

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

marketplace source を追加します。引数はリポジトリのルート (`.agents/plugins/marketplace.json` がある場所) を指します。

```bash
# ローカル checkout
codex marketplace add /path/to/harness-loom

# 公開 git リポジトリ
codex marketplace add KingGyuSuh/harness-loom

# 必要ならタグを固定
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

その後、Codex TUI で `/plugins` を実行し、`Harness Loom` marketplace エントリを開いてプラグインをインストールします。

### Gemini Runtime

ファクトリは Claude Code または Codex CLI から導入し、ターゲットプロジェクト内で `.gemini/` を派生して Gemini ランタイムとして使います。

1. Claude Code または Codex CLI でファクトリをインストールし、ターゲットプロジェクトで `/harness-init` + `node .harness/loom/sync.ts --provider gemini` を実行します。これによりターゲット側ランタイム (`.harness/loom/`, `.harness/cycle/`, `.gemini/agents/`, `.gemini/skills/`, `AfterAgent` フック付きの `.gemini/settings.json`) が導入されます。
2. そのターゲットプロジェクトへ `cd` して `gemini` を起動します。CLI が workspace スコープの `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, `.gemini/settings.json` の `AfterAgent` フックを自動ロードします。
3. オーケストレータサイクルがそのまま Gemini で回ります — ファクトリ著作は Claude / Codex、実行は三プラットフォームどれでも。

## クイックスタート

```bash
cd your-project
claude

# 1) 正本の基盤をインストール (.harness/loom/ + .harness/cycle/)
/harness-init

# 2) 正本 staging から少なくとも 1 つのプラットフォームツリーを派生します。
node .harness/loom/sync.ts --provider claude
#    マルチプラットフォームなら派生したい provider をすべて列挙します。
# node .harness/loom/sync.ts --provider claude,codex,gemini

# 3) 今回のサイクルのゴールを定義
echo "curses を使った軽量なターミナル Snake ゲームを出荷する" > goal.md

# 4) プロジェクト固有の pair を追加
#    `<purpose>` は 2 番目の位置引数です。作成後に上の sync コマンドを
#    再実行して派生プラットフォームツリーを更新してください。
/harness-pair-dev --add game-design "snake.py の機能とエッジケースを仕様化する"
/harness-pair-dev --add impl "仕様に沿って snake.py を実装する" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 4a) reviewer なしの opt-in: 決定論的 / 補助タスク (sync, format, mirror) 専用。
#     既定はあくまで pair です。
/harness-pair-dev --add asset-mirror "正本アセットを派生ツリーへコピーする" \
  --reviewer none

# 4b) 新しい pair をプラットフォームツリーへ反映するため sync を再実行
node .harness/loom/sync.ts --provider claude

# 5) ランタイムハーネスを実行
/harness-orchestrate goal.md
```

出力は `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` に蓄積されます。ランタイム状態は `.harness/cycle/state.md`、イベントログは `.harness/cycle/events.md` に残ります。毎サイクルの停止直前に、orchestrator は組み込みの `harness-doc-keeper` reviewer-less producer を自動 dispatch し、プロジェクト + goal + サイクル活動を読み取ってプロジェクトドキュメントを surgical に作成・更新します — ルートのマスターファイル (`CLAUDE.md`、`AGENTS.md`、`ARCHITECTURE.md` など) と `docs/` サブツリー (`design-docs/`、`product-specs/`、`exec-plans/`、`generated/` など証拠が正当化する範囲内)。ポインタセクションの外側にある人手で書かれた内容は byte-for-byte 保存されます。

## コア概念

コマンド、ファイル、状態をまたいで繰り返し出てくる用語です。以下の 6 つを押さえれば、このリポジトリの全体像は追えます。

- **Harness** — アシスタントを取り巻く持続的な層です。状態ファイル、フック、サブエージェント、契約がここに含まれます。`harness-loom` はこの層を各リポジトリ向けに形作ります。
- **Pair** — 1 人の **producer** と 1 人以上の **reviewer** が 1 つの `SKILL.md` を共有する単位です。ドメイン作業を設計し実行する最小単位です。
- **Producer** — コード、仕様、分析などの実作業を担い、次のアクションを提案するサブエージェントです。
- **Reviewer** — producer の成果を特定の評価軸で採点するサブエージェントです。コード品質、仕様適合性、セキュリティなどが代表的です。
- **EPIC / Task** — EPIC は planner が定義する成果単位で、Task はその EPIC の中で 1 回行われる producer-reviewer ラウンドです。成果物は `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` に保存されます。
- **Orchestrator vs Planner** — **orchestrator** は `.harness/cycle/state.md` を管理し、応答ごとに 1 つの producer(0・1・M 個の reviewer を並列で) を dispatch します。**planner** はそのループの内部でゴールを EPIC に分解し、各 EPIC に対して固定 global roster の適用区間と同一ステージ upstream gate を決めます。

## コマンド

| コマンド | 目的 |
|---------|---------|
| `/harness-init [<target>] [--force]` | 対象プロジェクトに正本 `.harness/loom/` staging ツリーと `.harness/cycle/` ランタイム状態を組み込みます。ランタイムスキル、`harness-planner` エージェント、組み込み `harness-doc-keeper` producer、`.harness/loom/` 内に self-contained な `hook.sh` + `sync.ts` のコピーを生成します。プラットフォームツリーには触れません。 |
| `node .harness/loom/sync.ts --provider <list>` | 正本 `.harness/loom/` からプラットフォームツリー (`.claude/`, `.codex/`, `.gemini/`) を派生します。一方向であり `.harness/loom/` には書き戻しません。`--provider` を省略するとディスク上に既に存在するプラットフォームツリーのみ自動検出します。 |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | 現在のコードベースに根ざした新しい producer-reviewer pair を作成します。`<purpose>` は 2 番目の位置引数です。`--reviewer` を繰り返せば 1:N 構成、`--reviewer none` を渡せば reviewer 無しの producer-only グループになります（決定論的 / 補助タスク専用、既定はあくまで pair）。書き込み先は `.harness/loom/` のみで、その後 `node .harness/loom/sync.ts --provider <list>` を再実行してください。 |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | 既存 pair をルーブリックと現在のコードベースに照らして再監査し、改善します。改善後は sync を再実行してプラットフォームツリーを更新します。 |
| `/harness-pair-dev --split <slug>` | 肥大化した pair を、より狭い 2 つの pair に分割します。分割後は sync を再実行します。 |
| `/harness-orchestrate <goal.md>` | 対象側ランタイムの入口です。ゴールを読み、応答ごとに 1 つの producer(ペアリングされた reviewer 集合を含む) を dispatch し、フック再入でサイクルを進めます。halt 直前に組み込みの `harness-doc-keeper` reviewer-less producer を自動 dispatch してから `Next` をクリアします。 |

## ファクトリとランタイム

```text
factory (このリポジトリ)                          target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          installs ->      .harness/loom/{skills,agents,hook.sh,sync.ts}
plugins/harness-loom/skills/harness-init/                            .harness/cycle/{state.md,events.md,epics/}
plugins/harness-loom/skills/harness-init/references/runtime/ seeds -> .harness/loom/skills/<slug>/SKILL.md
plugins/harness-loom/skills/harness-pair-dev/      authors  ->      .harness/loom/agents/<slug>-producer.md
                                                                    .harness/loom/agents/<reviewer>.md
                                                                    .harness/loom/skills/<slug>/SKILL.md
                                                     |
                                                     +-- node .harness/loom/sync.ts --provider <list>
                                                         -> .claude/{agents,skills,settings.json}
                                                         -> .codex/
                                                         -> .gemini/
                                                     |
                                                     +-- harness-doc-keeper がサイクル halt で自動実行
                                                         -> CLAUDE.md / AGENTS.md (pointer セクション)
                                                         -> ARCHITECTURE.md / DESIGN.md / ...
                                                         -> docs/{design-docs,product-specs,exec-plans,generated,...}/
```

この分離は意図的です。

- ファクトリ自体は小さく保ち、ユーザーが直接呼び出せるようにします。
- 対象ランタイムは、プロジェクト固有の作業状態を保持します。
- プロバイダー別のツリーは執筆対象ではなく、派生成果物です。

## マルチプラットフォーム

`sync.ts` が適用するプラットフォーム pin は次のとおりです。

| プラットフォーム | モデル | フックイベント | 備考 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` が `.harness/loom/hook.sh` を起動します。 |
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
