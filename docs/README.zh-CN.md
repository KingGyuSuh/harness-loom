<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.4-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#多平台)

**在现代编码助手自带的通用 harness 之上，搭建一套更贴合生产环境的工作台。**

<br clear="left" />

> **状态：** 0.1.4 —— 初始公开版本。1.0 之前公共接口仍可能调整；涉及破坏性变更时请查看 [CHANGELOG](../CHANGELOG.md)。

`harness-loom` 是一个工厂型插件：它会把运行时 harness 安装到目标仓库里，并按 pair 的粒度逐步扩展。

今天的助手产品，早已不只是“模型 + 提示词”。它们还自带一层通用 harness：planner、hook、subagent、skill、工具路由、控制流，决定了任务如何被规划、委派、审查与恢复。这一层很有价值，但它并不了解你的生产系统。哪些审查最关键、哪些产物必须保留、工作该如何拆分、权限边界落在哪里，这些都只能由项目自己定义。

一旦你选用的模型栈已经足够胜任生产级工作，真正的杠杆往往会从“选什么模型”转向 **harness engineering**。也就是把代码库的审查标准、任务形态和完成定义写进可版本化的基础设施，而不是每一轮会话都重新解释一次。`harness-loom` 做的是 harness 的微调，不是模型的微调。

`harness-loom` 适合这样一类团队：你已经确认助手栈具备生产潜力，现在要解决的是，如何让它从“一次会话”进化成“一个可持续运转的系统”。

这个仓库就是工厂。它会在目标端播下一套由以下部分组成的运行时 harness：

- planner 与 orchestrator
- 位于 `.harness/` 下的共享控制平面
- 所有 subagent 共用的运行时上下文
- 随时间逐步补充的、面向项目领域的 producer-reviewer pair

`.claude/` 是正本。`.codex/` 和 `.gemini/` 按需从它派生。

## 为什么是这种结构

- **先有 skill，再有 agent。** 共享方法论放在每个 pair 的 `SKILL.md` 里，让生产规则与审查规则保持一致。
- **Producer 加 Reviewer。** 一个 pair 可以扩展为一个或多个 reviewer，每个 reviewer 关注不同的评估维度。
- **只维护一个正本。** harness 统一写在 `.claude/`，只有在需要时才派生出 `.codex/` 和 `.gemini/`。
- **由 hook 驱动执行。** orchestrator 把下一次 dispatch 写入 `.harness/state.md`，hook 再无缝把循环接起来。
- **基于仓库实际情况来写。** 生成 pair 时会读取真实的目标代码库，因此引用的是实际文件与模式，而不是抽象 boilerplate。

## 会安装什么

在目标仓库里运行 `/harness-init` 后，`harness-loom` 安装的是一套运行时 harness，而不是一次性的提示词模板。

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
└── 面向项目领域的 producer / reviewer pair
```

之后，你可以通过 `/harness-pair-dev` 添加领域相关的 pair，也可以在需要时用 `/harness-sync` 派生出 Codex 或 Gemini 专用树。

## 要求

- **Node.js ≥ 22.6** —— 脚本通过原生 TypeScript stripping 运行；不需要构建步骤，也没有 `package.json`。
- **git** —— 在 pair 拆分时，`--split` 会依赖 git 历史来处理回退。
- **至少一个受支持的助手 CLI**，并且已经完成认证：
  - [Claude Code](https://code.claude.com/docs) —— 主要目标平台，`.claude/` 是正本。
  - [Codex CLI](https://developers.openai.com/codex/cli) —— 通过 `/harness-sync --provider codex` 派生。
  - [Gemini CLI](https://geminicli.com/docs/) —— 通过 `/harness-sync --provider gemini` 派生。

## 安装

工厂采用标准的 `plugins/<name>/` monorepo 布局：仓库根目录放 `.claude-plugin/marketplace.json` 和 `.agents/plugins/marketplace.json`，真正的插件树放在 `plugins/harness-loom/` 下。**工厂本身在 Claude Code 或 Codex CLI 中运行。** Gemini CLI 作为*运行时消费者*被支持（见下文「Gemini CLI (runtime only)」）。

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

锁定特定 tag：

```text
/plugin marketplace add KingGyuSuh/harness-loom@v0.1.4
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

添加 marketplace source，参数指向仓库根目录（包含 `.agents/plugins/marketplace.json`）：

```bash
# 本地 checkout
codex marketplace add /path/to/harness-loom

# 公开 git 仓库
codex marketplace add KingGyuSuh/harness-loom

# 锁定 tag
codex marketplace add KingGyuSuh/harness-loom@v0.1.4
```

然后在 Codex TUI 中执行 `/plugins`，打开 `Harness Loom` marketplace 条目并安装插件。

### Gemini CLI (runtime only)

harness-loom **工厂自身无法作为 Gemini extension 安装** —— Gemini 的 extension 加载器把 repo 根目录硬编码为 extension 根，与工厂所采用的 Codex / Claude `plugins/<name>/` monorepo 约定冲突。不过 Gemini CLI 作为**在目标项目中消费运行时 harness** 的平台是被支持的：

1. 在 Claude Code 或 Codex CLI 里安装工厂，然后在目标项目中运行 `/harness-init` 和 `/harness-sync --provider gemini`。这会在目标端部署 runtime（`.harness/`、`.gemini/agents/`、`.gemini/skills/`，以及带 `AfterAgent` 钩子的 `.gemini/settings.json`）。
2. `cd` 进入该目标项目，启动 `gemini`。CLI 会自动加载 workspace 范围的 `.gemini/agents/*.md`、`.gemini/skills/<slug>/SKILL.md`，以及 `.gemini/settings.json` 中的 `AfterAgent` 钩子。
3. orchestrator 循环就能在 Gemini 中端到端运行——工厂侧编写仍走 Claude / Codex，执行可以在三种平台的任意一种。

## 快速开始

```bash
cd your-project
claude

# 1) 安装正本基础环境
/harness-init

# 2) 定义本轮循环的目标
echo "发布一个基于 curses 的轻量级终端贪吃蛇游戏" > goal.md

# 3) 添加项目专属 pair
#    `<purpose>` 是第二个位置参数，不再接受 `--purpose` 标志。
/harness-pair-dev --add game-design "为 snake.py 编写功能与边界情况说明"
/harness-pair-dev --add impl "按照说明实现 snake.py" \
  --reviewer code-reviewer --reviewer playtest-reviewer

# 3a) 无 reviewer 的 opt-in：仅用于确定性 / 辅助工作（sync、format、mirror）；
#     默认仍然是 pair。
/harness-pair-dev --add asset-mirror "把正本资产复制到派生树" \
  --reviewer none

# 4) （可选）从正本 .claude/ 派生 Codex / Gemini
/harness-sync --provider codex,gemini

# 5) 运行运行时 harness
/harness-orchestrate goal.md
```

输出会落在 `.harness/epics/EP-N--<slug>/{tasks,reviews}/` 下面。运行时状态保存在 `.harness/state.md`，事件日志保存在 `.harness/events.md`。

## 核心概念

下面这些词会反复出现在命令、文件和状态里。理解这六个概念，基本就能顺着读完整个仓库。

- **Harness** —— 围绕助手的一层持久化结构，包括状态文件、hook、subagent 和契约。`harness-loom` 会把这层结构调成适配你仓库的样子。
- **Pair** —— 一个 **producer** 加上一个或多个 **reviewer**，共享同一个 `SKILL.md`。这是领域工作的基本编排单元。
- **Producer** —— 执行实际工作并提出下一步建议的 subagent，例如写代码、写规范、做分析。
- **Reviewer** —— 沿某个明确维度给 producer 输出打分的 subagent，例如代码质量、规范契合度或安全性。
- **EPIC / Task** —— EPIC 是 planner 发出的成果单元；Task 是该 EPIC 内一次 producer-reviewer 循环。产物会落在 `.harness/epics/EP-N--<slug>/{tasks,reviews}/` 下。
- **Orchestrator vs Planner** —— **orchestrator** 拥有 `.harness/state.md`，并保证每次响应只 dispatch 一个 pair。**planner** 则在 orchestrator 循环内部，把目标分解成带 roster 的 EPIC。

## 命令

| 命令 | 作用 |
|---------|---------|
| `/harness-init [<target>] [--force]` | 在目标项目里搭建正本 `.claude/` 基础环境，写入 `.harness/`、运行时 skill、`harness-planner` agent，以及 hook 连接。 |
| `/harness-sync [--provider <list>]` | 从正本 `.claude/` 派生 `.codex/` 和 `.gemini/`。这是单向同步，不会回写 `.claude/`。 |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | 基于当前代码库编写新的 producer-reviewer pair。`<purpose>` 是第二个位置参数。重复 `--reviewer` 形成 1:N 拓扑；传入 `--reviewer none` 则得到无 reviewer 的 producer-only 组（仅用于确定性/辅助工作；默认仍然是 pair）。 |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | 依据 rubric 与当前代码库重新审视已有 pair，并对其改进。 |
| `/harness-pair-dev --split <slug>` | 将过于臃肿的 pair 拆成两个更聚焦的 pair。 |
| `/harness-orchestrate <goal.md>` | 目标侧运行时入口。读取目标后，每次响应 dispatch 一个 pair，并通过 hook 重入推进整个循环。 |

## 工厂与运行时

```text
factory (本仓库)                                target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          安装    ->      .harness/{state,events,hook,epics}/
plugins/harness-loom/skills/harness-pair-dev/      编写    ->      .claude/agents/<slug>-producer.md
plugins/harness-loom/skills/harness-sync/          派生    ->      .claude/agents/<reviewer>.md
plugins/harness-loom/skills/harness-init/references/runtime/ 播种 -> .claude/skills/<slug>/SKILL.md
                                               .claude/settings.json
                                                     |
                                                     +-- /harness-sync (按需)
                                                         -> .codex/
                                                         -> .gemini/
```

这样的拆分是有意设计的：

- 工厂本身保持小巧，并且可以由用户直接调用
- 目标运行时负责保存项目专属的工作状态
- 各平台的树属于派生产物，而不是编写时的主表面

## 多平台

`sync.ts` 会应用以下平台 pin：

| 平台 | 模型 | hook 事件 | 说明 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` 会触发 `.harness/hook.sh`。 |
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
