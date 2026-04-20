<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#多平台)

**在现代编码助手自带的通用 harness 之上，搭建一套更贴合生产环境的工作台。**

<br clear="left" />

> **状态：** 0.2.0 —— 初始公开版本。1.0 之前公共接口仍可能调整；涉及破坏性变更时请查看 [CHANGELOG](../CHANGELOG.md)。

`harness-loom` 是一个工厂型插件：它会把运行时 harness 安装到目标仓库里，并按 pair 的粒度逐步扩展。

今天的助手产品，早已不只是“模型 + 提示词”。它们还自带一层通用 harness：planner、hook、subagent、skill、工具路由、控制流，决定了任务如何被规划、委派、审查与恢复。这一层很有价值，但它并不了解你的生产系统。哪些审查最关键、哪些产物必须保留、工作该如何拆分、权限边界落在哪里，这些都只能由项目自己定义。

一旦你选用的模型栈已经足够胜任生产级工作，真正的杠杆往往会从“选什么模型”转向 **harness engineering**。也就是把代码库的审查标准、任务形态和完成定义写进可版本化的基础设施，而不是每一轮会话都重新解释一次。`harness-loom` 做的是 harness 的微调，不是模型的微调。

`harness-loom` 适合这样一类团队：你已经确认助手栈具备生产潜力，现在要解决的是，如何让它从“一次会话”进化成“一个可持续运转的系统”。

这个仓库就是工厂。它会在目标端播下一套由以下部分组成的运行时 harness：

- planner 与 orchestrator
- 位于 `.harness/` 下的共享控制平面
- 所有 subagent 共用的运行时上下文
- 随时间逐步补充的、面向项目领域的 producer-reviewer pair

目标项目的 `.harness/` 划分为两个并列的命名空间：`loom/` 是由 install 与 sync 拥有的正本 staging 树，`cycle/` 是由 orchestrator 拥有的运行时状态。项目文档（根目录 `*.md`、`docs/`）直接放在目标项目中，不在 `.harness/` 内部。平台树（`.claude/`、`.codex/`、`.gemini/`）按需从 `.harness/loom/` 派生。

## 为什么是这种结构

- **先有 skill，再有 agent。** 共享方法论放在每个 pair 的 `SKILL.md` 里，让生产规则与审查规则保持一致。
- **Producer 加 Reviewer。** 一个 pair 可以扩展为一个或多个 reviewer，每个 reviewer 关注不同的评估维度。
- **只维护一个正本。** harness 统一写在 `.harness/loom/`，只有在需要时才派生出 `.claude/`、`.codex/` 和 `.gemini/`。
- **由 hook 驱动执行。** orchestrator 把下一次 dispatch 写入 `.harness/cycle/state.md`，hook 再无缝把循环接起来。
- **基于仓库实际情况来写。** 生成 pair 时会读取真实的目标代码库，因此引用的是实际文件与模式，而不是抽象 boilerplate。

## 会安装什么

在目标仓库里运行 `/harness-init` 后，`harness-loom` 安装的是一套运行时 harness，而不是一次性的提示词模板。

```text
target project
└── .harness/
    ├── loom/                    # 正本 staging（install + sync 拥有）
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
    ├── cycle/                   # 运行时状态（orchestrator 拥有）
    │   ├── state.md
    │   ├── events.md
    │   └── epics/
    └── _archive/                # 历史循环；goal-different 复位时创建
```

项目文档（根目录 `*.md`、`docs/`）**直接放在目标项目中**，不在 `.harness/` 内部。之后用 `node .harness/loom/sync.ts --provider claude`（多平台时再加 `codex,gemini`）派生至少一个平台树，再通过 `/harness-pair-dev` 添加领域相关的 pair。内置的 `harness-doc-keeper` 是一个无 reviewer 的 producer，会在每个循环停止前自动运行，读取项目 + goal + 循环活动，然后精细地创作或演进项目实际需要的文档（`CLAUDE.md`、`AGENTS.md`、`ARCHITECTURE.md`、`docs/design-docs/`、`docs/product-specs/`、`docs/exec-plans/` 等 — 只取项目证据支持的子集）。用户不直接调用它；orchestrator 在 halt 之前作为最后一个无 reviewer 的回合自动 dispatch。

## 要求

- **Node.js ≥ 22.6** —— 脚本通过原生 TypeScript stripping 运行；不需要构建步骤，也没有 `package.json`。
- **git** —— 在 pair 拆分时，`--split` 会依赖 git 历史来处理回退。
- **至少一个受支持的助手 CLI**，并且已经完成认证：
  - [Claude Code](https://code.claude.com/docs) —— 主要目标平台，正本 staging `.harness/loom/` 通过 `node .harness/loom/sync.ts --provider claude` 派生到 `.claude/`。
  - [Codex CLI](https://developers.openai.com/codex/cli) —— 通过 `node .harness/loom/sync.ts --provider codex` 派生到 `.codex/`。
  - [Gemini CLI](https://geminicli.com/docs/) —— 通过 `node .harness/loom/sync.ts --provider gemini` 派生到 `.gemini/`。

## 安装

工厂采用标准的 `plugins/<name>/` monorepo 布局：仓库根目录放 `.claude-plugin/marketplace.json` 和 `.agents/plugins/marketplace.json`，真正的插件树放在 `plugins/harness-loom/` 下。工厂通过 Claude Code 或 Codex CLI 使用，而在目标项目内部则按需派生各个平台树。

### Claude Code

本地快速验证（单会话，无需 marketplace）：

```bash
claude --plugin-dir ./plugins/harness-loom
```

持久化安装走 Claude Code 会话内的 marketplace 流程。本地 checkout：

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

公开 git 仓库（GitHub shorthand）：

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

需要时锁定特定 tag：

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

添加 marketplace source，参数指向仓库根目录（包含 `.agents/plugins/marketplace.json`）：

```bash
# 本地 checkout
codex marketplace add /path/to/harness-loom

# 公开 git 仓库
codex marketplace add KingGyuSuh/harness-loom

# 需要时锁定 tag
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

然后在 Codex TUI 中执行 `/plugins`，打开 `Harness Loom` marketplace 条目并安装插件。

### Gemini Runtime

工厂从 Claude Code 或 Codex CLI 安装，目标项目里再派生 `.gemini/` 作为 Gemini 运行时使用：

1. 在 Claude Code 或 Codex CLI 里安装工厂，然后在目标项目中运行 `/harness-init` 和 `node .harness/loom/sync.ts --provider gemini`。这会在目标端部署 runtime（`.harness/loom/`、`.harness/cycle/`、`.gemini/agents/`、`.gemini/skills/`，以及带 `AfterAgent` 钩子的 `.gemini/settings.json`）。
2. `cd` 进入该目标项目，启动 `gemini`。CLI 会自动加载 workspace 范围的 `.gemini/agents/*.md`、`.gemini/skills/<slug>/SKILL.md`，以及 `.gemini/settings.json` 中的 `AfterAgent` 钩子。
3. orchestrator 循环就能在 Gemini 中端到端运行——工厂侧编写仍走 Claude / Codex，执行可以在三种平台的任意一种。

## 快速开始

```bash
cd your-project
claude

# 1) 安装正本基础环境（.harness/loom/ + .harness/cycle/）
/harness-init

# 2) 从正本 staging 至少派生一个平台树。
node .harness/loom/sync.ts --provider claude
#    多平台时请列出所有希望派生的 provider：
# node .harness/loom/sync.ts --provider claude,codex,gemini

# 3) 定义本轮循环的目标
echo "发布一个基于 curses 的轻量级终端贪吃蛇游戏" > goal.md

# 4) 添加项目专属 pair
#    `<purpose>` 是第二个位置参数。编写完成后请再次运行上面的 sync 命令，
#    用于刷新派生的平台树。
/harness-pair-dev --add game-design "为 snake.py 编写功能与边界情况说明"
/harness-pair-dev --add impl "按照说明实现 snake.py" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 4a) 无 reviewer 的 opt-in：仅用于确定性 / 辅助工作（sync、format、mirror）；
#     默认仍然是 pair。
/harness-pair-dev --add asset-mirror "把正本资产复制到派生树" \
  --reviewer none

# 4b) 再次运行 sync，把新 pair 部署到平台树
node .harness/loom/sync.ts --provider claude

# 5) 运行运行时 harness
/harness-orchestrate goal.md
```

输出会落在 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` 下面。运行时状态保存在 `.harness/cycle/state.md`，事件日志保存在 `.harness/cycle/events.md`。每个循环停止之前，orchestrator 会自动 dispatch 内置的 `harness-doc-keeper` 无 reviewer producer，读取项目 + goal + 循环活动后精细地创作或演进项目文档——根目录的主文件（`CLAUDE.md`、`AGENTS.md`、`ARCHITECTURE.md` 等）以及 `docs/` 子树（`design-docs/`、`product-specs/`、`exec-plans/`、`generated/` 等只取项目证据支持的子集）。指针区段之外的人工撰写内容按字节保留。

## 核心概念

下面这些词会反复出现在命令、文件和状态里。理解这六个概念，基本就能顺着读完整个仓库。

- **Harness** —— 围绕助手的一层持久化结构，包括状态文件、hook、subagent 和契约。`harness-loom` 会把这层结构调成适配你仓库的样子。
- **Pair** —— 一个 **producer** 加上一个或多个 **reviewer**，共享同一个 `SKILL.md`。这是领域工作的基本编排单元。
- **Producer** —— 执行实际工作并提出下一步建议的 subagent，例如写代码、写规范、做分析。
- **Reviewer** —— 沿某个明确维度给 producer 输出打分的 subagent，例如代码质量、规范契合度或安全性。
- **EPIC / Task** —— EPIC 是 planner 发出的成果单元；Task 是该 EPIC 内一次 producer-reviewer 循环。产物会落在 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` 下。
- **Orchestrator vs Planner** —— **orchestrator** 拥有 `.harness/cycle/state.md`，并保证每次响应只 dispatch 一个 producer（以及 0、1 或 M 个 reviewer 并行）。**planner** 则在该循环内部把目标分解成 EPIC，为每个 EPIC 选择固定 global roster 中适用的阶段切片，并声明同一阶段上的 upstream gate。

## 命令

| 命令 | 作用 |
|---------|---------|
| `/harness-init [<target>] [--force]` | 在目标项目里搭建正本 `.harness/loom/` staging 树和 `.harness/cycle/` 运行时状态。写入运行时 skill、`harness-planner` agent、内置 `harness-doc-keeper` producer，以及 `.harness/loom/` 内 self-contained 的 `hook.sh` + `sync.ts` 副本。不触碰平台树。 |
| `node .harness/loom/sync.ts --provider <list>` | 把正本 `.harness/loom/` 派生到平台树（`.claude/`、`.codex/`、`.gemini/`）。单向同步，不会回写 `.harness/loom/`。省略 `--provider` 时仅自动检测磁盘上已存在的平台树。 |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | 基于当前代码库编写新的 producer-reviewer pair。`<purpose>` 是第二个位置参数。重复 `--reviewer` 形成 1:N 拓扑；传入 `--reviewer none` 则得到无 reviewer 的 producer-only 组（仅用于确定性/辅助工作；默认仍然是 pair）。写入仅作用于 `.harness/loom/`，结束后请再次运行 `node .harness/loom/sync.ts --provider <list>`。 |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | 依据 rubric 与当前代码库重新审视已有 pair，并对其改进。改进后请再次运行 sync 刷新平台树。 |
| `/harness-pair-dev --split <slug>` | 将过于臃肿的 pair 拆成两个更聚焦的 pair。拆分后请再次运行 sync。 |
| `/harness-orchestrate <goal.md>` | 目标侧运行时入口。读取目标后，每次响应 dispatch 一个 producer（以及配对的 reviewer 集合，若适用），并通过 hook 重入推进整个循环。halt 之前会自动 dispatch 内置的 `harness-doc-keeper` 无 reviewer producer，再清空 `Next`。 |

## 工厂与运行时

```text
factory (本仓库)                                target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          安装    ->      .harness/loom/{skills,agents,hook.sh,sync.ts}
plugins/harness-loom/skills/harness-init/                            .harness/cycle/{state.md,events.md,epics/}
plugins/harness-loom/skills/harness-init/references/runtime/ 播种 -> .harness/loom/skills/<slug>/SKILL.md
plugins/harness-loom/skills/harness-pair-dev/      编写    ->      .harness/loom/agents/<slug>-producer.md
                                                                    .harness/loom/agents/<reviewer>.md
                                                                    .harness/loom/skills/<slug>/SKILL.md
                                                     |
                                                     +-- node .harness/loom/sync.ts --provider <list>
                                                         -> .claude/{agents,skills,settings.json}
                                                         -> .codex/
                                                         -> .gemini/
                                                     |
                                                     +-- harness-doc-keeper 在循环 halt 时自动运行
                                                         -> CLAUDE.md / AGENTS.md（指针区段）
                                                         -> ARCHITECTURE.md / DESIGN.md / ...
                                                         -> docs/{design-docs,product-specs,exec-plans,generated,...}/
```

这样的拆分是有意设计的：

- 工厂本身保持小巧，并且可以由用户直接调用
- 目标运行时负责保存项目专属的工作状态
- 各平台的树属于派生产物，而不是编写时的主表面

## 多平台

`sync.ts` 会应用以下平台 pin：

| 平台 | 模型 | hook 事件 | 说明 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` 会触发 `.harness/loom/hook.sh`。 |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | subagent 不使用 mini model。 |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | skill 会镜像到平台树中。 |

## 什么时候适合使用

在下面这些场景里，`harness-loom` 会特别合适：

- 基础助手环境已经足够强，能在你的代码库里完成真实工作
- 剩下的问题主要集中在可重复性、审查结构、状态延续和领域适配
- 你希望把 harness 规则沉淀为可版本控制的文件，而不是每次临时重新提示
- 你希望围绕一套正本结构，稳定地派生到多个平台

如果你还在评估底层模型栈是否能胜任这类工作，那么现在可能还不是引入它的时候。这个项目的前提是：通用 harness 已经有用了，接下来要做的是把它进一步打磨成适合生产环境的系统。

## 参与贡献

欢迎提交 issue、修复 bug、改进 rubric。开发流程、冒烟测试命令和范围说明见 [CONTRIBUTING.md](../CONTRIBUTING.md)。新增用户可直接调用的 skill，或者调整 orchestrator 节奏这类改动，建议先发起讨论。安全问题请查看 [SECURITY.md](../SECURITY.md)。所有参与均受 [Code of Conduct](../CODE_OF_CONDUCT.md) 约束。

## 项目文档

- [CHANGELOG.md](../CHANGELOG.md) - 发布历史
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 开发设置与 PR 流程
- [SECURITY.md](../SECURITY.md) - 负责任披露
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - 社区行为预期
- [LICENSE](../LICENSE) - Apache 2.0
- [NOTICE](../NOTICE) - Apache 2.0 要求的归属声明
