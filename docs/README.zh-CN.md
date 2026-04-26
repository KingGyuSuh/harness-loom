<img src="../plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md)

[![Version](https://img.shields.io/badge/version-0.3.4-blue.svg)](../CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](../README.md#multi-platform)

**在现代编码助手随附的通用 harness 之上,微调出一个面向你生产体系的专属 harness。**

<br clear="left" />

> 如有表述差异,以[英文 README](../README.md) 为准。

`harness-loom` 是一个工厂插件,会把运行时 harness 装入目标仓库,并按 pair 逐步扩展 producer-reviewer 组合。

如今的助手产品早已不再只是"模型 + 提示词"。它们随附一整套通用 harness —— planner、hook、subagent、skill、工具路由、控制流 —— 决定工作如何被规划、委派、复核与续接。这一层很有价值,但它并不了解你的生产体系:哪些 review 重要、哪些产物需要长存、工作如何被分解、权限边界在哪里。

一旦你选定的模型栈已经具备足以产出生产级别成果的能力,杠杆点就从模型选择转向 **harness 工程** —— 把仓库的 review 标准、任务形态与"完成"定义编码进版本化的基础设施,而不是每个会话都重新提示一次。这是 harness 微调,不是模型微调。

`harness-loom` 面向的是已经在助手栈中看到生产质量潜力,且希望它像一个系统而不是一次会话那样运转的团队。

本仓库就是工厂。它会种入或收敛一份目标侧的运行时 harness,由以下部分组成:

- 一个 planner 与一个 orchestrator
- 位于 `.harness/` 之下的共享控制平面
- 服务于所有 subagent 的通用运行时上下文
- 你随时间累积的、项目特有的 producer-reviewer pair

目标的 `.harness/` 划分为两个并列命名空间 —— `loom/` 是由 setup 与 pair authoring 拥有的正本 staging 树,`cycle/` 是由 orchestrator 拥有的运行时状态。周期之外的产物(目标根目录下的 `*.md`、`docs/`、发布说明、审计输出等)由周期收尾的 **Finalizer** 轮次直接写到目标根目录,而不是写入 `.harness/`。平台树(`.claude/`、`.codex/`、`.gemini/`)按需从 `.harness/loom/` 派生。

## 为什么是这种形态

- **Skill 优先,agent 其次。** 共享方法论位于每个 pair 的单一 `SKILL.md` 中,使生产规则与 review 规则保持对齐。
- **Producer 加 Reviewers。** 一个 pair 可以 fan-out 给一个或多个 reviewer,每个 reviewer 在不同维度上打分。
- **正本一次,派生向外。** 在 `.harness/loom/` 中 author harness;只在你需要时再派生到 `.claude/`、`.codex/`、`.gemini/`。
- **Hook 驱动执行。** orchestrator 把下一次 dispatch 写入 `.harness/cycle/state.md`,hook 在无需手工记账的情况下重新进入周期。
- **以仓库为锚的 authoring。** Pair 生成会读取真实目标代码库,因此可以引用真实文件与模式,而不是堆砌抽象样板。

## 安装的内容

在目标仓库中运行 `/harness-init` 时,`harness-loom` 安装的是一个运行时 harness,而不是一份一次性的提示词模板。运行 `/harness-auto-setup` 则在更安全的 setup/migration 工作流中复用同一套 foundation 安装器。

```text
target project
└── .harness/
    ├── loom/                    # canonical staging (setup + pair authoring own; sync reads)
    │   ├── skills/
    │   │   ├── harness-orchestrate/
    │   │   ├── harness-planning/
    │   │   └── harness-context/
    │   ├── agents/
    │   │   ├── harness-planner.md
    │   │   └── harness-finalizer.md     # generic cycle-end skeleton; project fills in
    │   ├── hook.sh
    │   └── sync.ts
    ├── cycle/                   # runtime state (orchestrator owns)
    │   ├── state.md
    │   ├── events.md
    │   ├── epics/
    │   └── finalizer/
    │       └── tasks/
    ├── _snapshots/              # auto-setup provenance, when convergence runs
    │   └── auto-setup/
    └── _archive/                # past cycles, created on goal-different reset
```

项目文档(目标根目录的 `*.md` 文件、`docs/`)是 **直接在目标里** author 的,不在 `.harness/` 里。然后用 `node .harness/loom/sync.ts --provider claude` 至少派生一棵平台树(多平台时再追加 `codex,gemini`),再用 `/harness-pair-dev` 添加领域特定的 pair。安装 scaffold 不会创建请求快照。当你直接以 `/harness-orchestrate <file.md>` 进入时,orchestrator 会把请求全文保存在 `.harness/cycle/user-request-snapshot.md`,而 `state.md` 的 `Goal` 头部保留为压缩摘要。orchestrator 以四状态 DFA —— `Planner | Pair | Finalizer | Halt` —— 运行。当所有 EPIC 都到达 terminal 且 planner 没有可继续的工作时,它进入 **Finalizer 状态**,dispatch 单例 `harness-finalizer` 代理后停机。种入的 `harness-finalizer` 是一份通用骨架;你需要把项目实际所需的周期收尾工作 —— 文档刷新(`CLAUDE.md`、`AGENTS.md`、`docs/`)、对照 `events.md` 与用户请求快照检查请求覆盖、发布准备、审计输出等 —— 写进它的正文。你不会直接调用 finalizer,而是由 orchestrator 在停机前作为周期收尾轮次 dispatch 它。

`/harness-auto-setup` 是首次安装、按项目形态进行配置或迁移既有 harness 的更安全入口。`--setup`(默认)用于从零启动新的目标,如果已经存在 `.harness/`,它不会触动 foundation,会在项目分析与必要的用户澄清之后,继续以增量方式 author pair/finalizer。`--migration` 是处理既有 foundation 的模式:对当前的 `.harness/loom/` 与 `.harness/cycle/` 做快照,刷新 foundation,恢复非 pair 的自定义 loom 条目,在保留兼容的 pair/finalizer 指引的同时只重写 contract 所拥有的运行时表面。它从不直接写 `.claude/`、`.codex/`、`.gemini/`。

## 要求

- **Node.js ≥ 22.6** —— 脚本通过原生 TypeScript stripping 直接运行;无构建步骤,无 `package.json`。
- **git** —— 推荐用于审阅生成的 harness 改动,以及通过常规 VCS 流程恢复本地试验。
- **至少一个已认证的受支持助手 CLI**:
  - [Claude Code](https://code.claude.com/docs) —— 主要目标;`.harness/loom/` 中的正本 staging 通过 `node .harness/loom/sync.ts --provider claude` 派生为 `.claude/`。
  - [Codex CLI](https://developers.openai.com/codex/cli) —— 通过 `node .harness/loom/sync.ts --provider codex` 派生为 `.codex/`;生成的 agent TOML 会显式提及所需的 `$skill-name` 主体。
  - [Gemini CLI](https://geminicli.com/docs/) —— 通过 `node .harness/loom/sync.ts --provider gemini` 派生为 `.gemini/`;由于 Gemini frontmatter 拒绝 `skills:`,生成的 agent 主体会直接命名所需 skill。

## 安装工厂

实际操作中分两步安装:

1. 把 **工厂插件** 安装到 Claude Code 或 Codex CLI。
2. 在每个目标仓库内,运行 `/harness-auto-setup --setup`(对既有 harness 做最小增量升级则用 `--migration`)以种入、检查或迁移 `.harness/`,然后运行 `node .harness/loom/sync.ts --provider <list>` 部署你实际想用的助手特定运行时树。

工厂以标准的 `plugins/<name>/` monorepo 布局发布 —— 仓库根目录持有 `.claude-plugin/marketplace.json` 与 `.agents/plugins/marketplace.json`,实际插件树位于 `plugins/harness-loom/` 之下。

请在下面挑选一种工厂安装路径。多数用户从 Claude Code 或 Codex CLI 安装工厂,然后在目标仓库里使用任意助手运行生成出的运行时。

### Claude Code

本地一次性试运行(无需 marketplace):

```bash
claude --plugin-dir ./plugins/harness-loom
```

通过会话内 marketplace 进行持久安装。本地检出:

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

公共 git 仓库(GitHub shorthand):

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

如需固定到特定 tag:

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

添加 marketplace 源 —— 参数指向仓库根目录(包含 `.agents/plugins/marketplace.json`):

```bash
# 本地检出
codex marketplace add /path/to/harness-loom

# 公共 git 仓库
codex marketplace add KingGyuSuh/harness-loom

# 如需固定 tag
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

然后在 Codex TUI 内运行 `/plugins`,打开 `Harness Loom` marketplace 条目并安装该插件。

### Gemini Runtime

先用 Claude Code 或 Codex CLI 安装工厂,再在目标项目中派生 `.gemini/`:

1. 从 Claude Code 或 Codex CLI 安装工厂,在目标项目中运行 `/harness-auto-setup --setup --provider gemini`,然后运行 `node .harness/loom/sync.ts --provider gemini`。这会部署目标侧运行时(`.harness/loom/`、`.harness/cycle/`、`.gemini/agents/`、`.gemini/skills/`,以及包含 `AfterAgent` hook 的 `.gemini/settings.json`)。
2. `cd` 进入该目标项目,运行 `gemini`。CLI 会自动加载工作区作用域的 `.gemini/agents/*.md`、`.gemini/skills/<slug>/SKILL.md`,以及 `.gemini/settings.json` 中的 `AfterAgent` hook。
3. 你的 orchestrator 周期可以端到端在 Gemini 上运行 —— 工厂 authoring 留在 Claude/Codex,执行可以是三者中任意一个。

## 启动一个目标项目

在助手中安装好工厂之后,目标仓库的常规流程是:

1. 用 `/harness-auto-setup --setup` 或 `/harness-auto-setup --migration` 种入、按项目形态配置,或迁移 `.harness/`。
2. 用 `sync.ts` 至少部署一棵助手运行时树。
3. 为你的仓库添加第一批 producer-reviewer pair。
4. 如果需要,再自定义周期收尾的 finalizer。
5. 运行 `/harness-orchestrate <file.md>`。

### 1. 设置或迁移目标仓库

在 Claude Code 或 Codex CLI 中打开目标仓库,运行:

```text
/harness-auto-setup --setup --provider claude
```

如果已经知道要刷新哪些平台树,使用逗号分隔的 provider 列表:

```text
/harness-auto-setup --setup --provider claude,codex,gemini
```

`--setup` 通过 foundation 安装器种入新的目标,并保留默认 finalizer 直到你选择具体的周期收尾工作。新目标在 author pair/finalizer 文件之前,需要助手侧的 LLM 项目分析;仅凭 docs/tests/CI 的存在不再创建 `harness-document` 或 `harness-verification`。如果目标已经有 `.harness/loom/` 或 `.harness/cycle/`,`--setup` 不会做快照、reseed、恢复、重建或迁移;它会检查实时 harness 与仓库信号,然后进入项目分析、必要时简短的用户澄清,以及 `.harness/loom/` 之下的增量 pair/finalizer authoring。

如果你想要的是既有 harness 的最小增量升级而不是 setup 模式收敛:

```text
/harness-auto-setup --migration --provider claude
```

迁移模式尽可能保留用户 author 的 pair/finalizer 指引(包括兼容的重命名或自定义 H2 节),并刷新由 contract 拥有的表面,例如必填 frontmatter、`skills:`、Output Format 块,以及 finalizer 的 Structural Issue contract。JSON 摘要包含 source/target overlay 计划的 `convergence.migrationPlan`。快照只是机器层面的 provenance 与迁移证据,而不是恢复的真值来源。

如果你只想做 foundation 重置,不做收敛:

```text
/harness-init
```

该命令在 `.harness/loom/` 之下写入正本 staging 树,在 `.harness/cycle/` 之下写入运行时状态 scaffold。它会种入 `state.md`、`events.md`、`epics/`、`finalizer/tasks/`,但不会创建 goal/request 快照占位、`.claude/`、`.codex/` 或 `.gemini/`。

如果你之后再次运行 `/harness-init`,请把它当作目标侧 harness scaffolding 的重置:pair author 的 `.harness/loom/` 内容与当前 `.harness/cycle/` 状态会被 reseed 而不是保留。新目标 bootstrap 或增量项目形态配置请使用 `/harness-auto-setup --setup`,既有 foundation 的最小增量 contract 刷新请使用 `/harness-auto-setup --migration`。

### 2. 部署你实际想用的助手运行时

从正本 staging 至少派生一棵平台树:

```bash
node .harness/loom/sync.ts --provider claude
```

多平台部署:

```bash
node .harness/loom/sync.ts --provider claude,codex,gemini
```

每次编辑 pair 或 finalizer 后,请重新运行该命令。`.harness/loom/` 是 authoring surface,`.claude/`、`.codex/`、`.gemini/` 是派生输出。

### 3. 添加第一批 pair

按你仓库中工作真正分解的方式来创建 pair。正本 pair slug 使用 `harness-` 前缀,而且每个 pair 都必须至少包含一个 reviewer。助手或许接受 `document` 这样的简短名字,但生成的文件与注册条目始终以 `harness-document` 写入。

```text
/harness-pair-dev --add harness-game-design "Spec snake.py features and edge cases"
/harness-pair-dev --add harness-impl "Implement snake.py against the spec" --reviewer harness-code-reviewer --reviewer harness-playtest-reviewer
```

在 author、改进或移除 pair 之后,请再次运行 `node .harness/loom/sync.ts --provider <list>`,让平台树拾取当前的 agent 与 skill。

### 4. 如果需要周期收尾工作,请自定义 Finalizer

种入的 `.harness/loom/agents/harness-finalizer.md` 是一个安全的 no-op。默认情况下它返回 `Status: PASS` 与 `Summary: no cycle-end work registered for this project`,不触碰任何文件。

如果你只希望周期干净停机,可以原样保留。

如果你的项目需要以下周期收尾工作,就编辑它:

- 刷新 `CLAUDE.md`、`AGENTS.md` 或 `docs/`
- 对照 `.harness/cycle/events.md` 检查目标覆盖
- 写发布说明或审计产物
- 快照 schema 或派生报告

编辑 finalizer 主体之后,请再次运行 `sync.ts`,把更新的 agent 部署到平台树。

### 5. 运行第一个周期

创建一个请求文件并启动 orchestrator:

```bash
cat > goal.md <<'EOF'
Ship a lightweight terminal Snake game with curses
EOF

/harness-orchestrate goal.md
```

产物落在 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` 之下。运行时状态位于 `.harness/cycle/state.md`,原始请求全文位于 `.harness/cycle/user-request-snapshot.md`,只追加的事件日志位于 `.harness/cycle/events.md`。当所有活动 EPIC 到达 terminal 且 planner 不再有继续工作时,orchestrator 进入 **Finalizer 状态**,运行单例 `harness-finalizer` 后停机。

## 你通常要自定义的内容

绝大多数用户只需要自定义三件事:

- **Pair** —— 持续添加、改进、移除 producer-reviewer pair,直到它们反映你仓库实际的工作分解与 review 维度。如果一个 pair 已经变成两份不同的工作,先显式 add/improve 替代物,再移除旧的 pair。
- **Finalizer 主体** —— 仅当你的项目需要在目标根目录做周期收尾工作时,才替换默认的 no-op。
- **周期请求文件** —— 每个周期都以用户 author 的请求文件开始,通常命名为 `goal.md`。orchestrator 把全文保存在 `.harness/cycle/user-request-snapshot.md`,并通过 dispatch envelope 以 `User request snapshot` 的形式向下游传递路径;`Goal` 仍是压缩摘要。

绝大多数用户 **不需要** 手工编辑的内容:

- `harness-orchestrate`
- `harness-planning`
- `harness-context`
- `.harness/cycle/state.md`
- `.harness/cycle/events.md`

除非你有意改变 harness contract 本身,否则请把上面这些当作运行时基础设施。

## 概念

有几个术语会在命令、文件、状态中反复出现,理解它们就足够阅读仓库的其余部分:

- **Harness** —— 围绕助手的持久层:状态文件、hook、subagent、contract。`harness-loom` 把这一层塑造成贴合你仓库的样子。
- **Pair** —— 一个 **producer** 加上一个或多个 **reviewer**,共享一份 `SKILL.md`。是领域工作的 authoring 单位。
- **Producer** —— 为某个任务执行工作(写代码、写规范、做分析)并返回任务产物的 subagent。它的 `Status` 仅是自报告;Pair verdict 由 reviewer 决定。
- **Reviewer** —— 在某个特定维度(代码质量、规范契合度、安全性等)给 producer 输出打分的 subagent。一个 pair 可以 fan-out 给多个 reviewer,各自独立打分,他们的 `Verdict` 才是 Pair 轮 verdict 的 load-bearing 来源。
- **EPIC / Task** —— EPIC 是 planner 产出的结果单位,Task 是该 EPIC 内单一的 producer-reviewer 轮次。产物落在 `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/` 之下。
- **Orchestrator vs Planner** —— **orchestrator** 拥有 `.harness/cycle/state.md`,以四状态 DFA(`Planner | Pair | Finalizer | Halt`)运行,每次响应正好 dispatch 一个 producer(Pair 轮并行运行 producer 加 1 至 M 个 reviewer,Finalizer 轮运行单一周期收尾 agent 且无 reviewer)。**planner** 在该循环内把 goal 分解成 EPIC,选择每个 EPIC 适用的固定全局 roster 子集,并跨 EPIC 声明同 stage 上游 gate。
- **Finalizer** —— 周期收尾 hook。运行时只附带一个单例 `harness-finalizer` agent,在所有 EPIC 都 terminal 且 planner 不再继续时运行。它没有配对的 reviewer;verdict 是 finalizer 自己的 `Status` 加上机械的 `Self-verification` 证据。种入的默认 `harness-finalizer` 是通用骨架;由项目用具体的周期收尾工作替换正文。

## 命令

| 命令 | 用途 |
|---------|---------|
| `/harness-init` | 在当前工作目录之下脚手架出正本 `.harness/loom/` staging 树以及 `.harness/cycle/` 运行时状态。写入运行时 skill、`harness-planner` agent、通用 `harness-finalizer` 周期收尾骨架,以及 `.harness/loom/` 之下自包含的 `hook.sh` + `sync.ts` 副本。会种入 `state.md`、`events.md`、`epics/`、`finalizer/tasks/`,但不会创建 goal 或 request 快照占位。重新运行会 reseed 两个命名空间。不触碰任何平台树。 |
| `/harness-auto-setup [--setup \| --migration] [--provider <list>]` | 安全地设置、配置或迁移当前工作目录的 harness。`--setup`(默认)bootstrap 新目标,且要求在 author pair/finalizer 文件之前进行助手侧项目分析,而不是按 docs/tests 现成创建 pair;在既有目标上则不动 foundation 文件,除非用户要求改进,只做增量项目形态 authoring。`--migration` 对既有 harness 做最小增量升级:先快照,再刷新 foundation,恢复自定义 loom 条目,然后在保留 pair/finalizer 指引的同时只重写 contract 所拥有的运行时表面,并发出迁移计划。两种模式都以一条显式 sync 命令收尾,不触碰任何平台树。 |
| `node .harness/loom/sync.ts --provider <list>` | 把正本 `.harness/loom/` 部署到平台树(`.claude/`、`.codex/`、`.gemini/`)。单向同步,绝不回写到 `.harness/loom/`。provider 选择是显式的:不带 provider flag 的 bare 调用是错误。Claude 保留 agent `skills:` frontmatter;Codex 与 Gemini 在生成的 agent 主体中接收所需的 skill 加载提示。 |
| `/harness-pair-dev --add <slug> "<purpose>" [--from <source>] [--reviewer <slug> ...] [--before <slug> \| --after <slug>]` | author 一个锚定到当前代码库的新 producer-reviewer pair。`<purpose>` 必填。`--from` 接受当前已注册的活动 pair slug,或目标本地的 `snapshot:<ts>/<pair>` / `archive:<ts>/<pair>` locator,作为 template-first overlay 源:在保持当前 harness 形状不变的同时,保留兼容的来源域指引。它不是任意文件系统路径,也不是 provider 树导入。默认 1:1;1:N reviewer 拓扑请重复 `--reviewer`。authoring 只写到 `.harness/loom/`;之后请重新运行 `node .harness/loom/sync.ts --provider <list>`。 |
| `/harness-pair-dev --improve <slug> "<purpose>" [--before <slug> \| --after <slug>]` | 以位置参数 `<purpose>` 为主要修订维度改进已注册的 pair,然后整合 rubric 卫生与当前仓库证据。如果一个 pair 已经变成两份不同的工作,请使用显式的 add/improve/remove 步骤。之后重新运行 sync 以刷新平台树。 |
| `/harness-pair-dev --remove <slug>` | 安全地注销 pair,并且只删除该 pair 所拥有的 `.harness/loom/` 文件。在变更前会拒绝 foundation/单例目标以及 `## Next` 或活动 EPIC roster/current 字段中的 active-cycle 引用,会保留 `.harness/cycle/` 中的 task/review 历史,且不触碰任何 provider 树;之后请重新运行 sync。 |
| `/harness-orchestrate <file.md>` | 目标侧运行时入口。读取请求文件,把全文保存在 `.harness/cycle/user-request-snapshot.md`,并以四状态 DFA(`Planner | Pair | Finalizer | Halt`)运行,每次响应正好 dispatch 一个 producer;hook 重新进入会从 `state.md` 与已有的快照路径推进周期。当所有 EPIC 到达 terminal 且 planner 续接清晰时,orchestrator 进入 Finalizer 状态,dispatch 单例 `harness-finalizer` 后停机。 |

## 工厂与运行时

```text
factory (this repo)                            target project
-----------------------------------------      ----------------------------------
plugins/harness-loom/skills/harness-init/          installs ->      .harness/loom/{skills,agents,hook.sh,sync.ts}
plugins/harness-loom/skills/harness-init/                            .harness/cycle/{state.md,events.md,epics/,finalizer/tasks/}
plugins/harness-loom/skills/harness-init/references/runtime/ seeds -> .harness/loom/skills/<slug>/SKILL.md
plugins/harness-loom/skills/harness-auto-setup/    migrates ->      .harness/_snapshots/auto-setup/<timestamp>/
                                                                    .harness/loom/ + .harness/cycle/ refreshed in --migration
plugins/harness-loom/skills/harness-pair-dev/      authors  ->      .harness/loom/agents/<slug>-producer.md
                                                                    .harness/loom/agents/<reviewer>.md
                                                                    .harness/loom/skills/<slug>/SKILL.md
                                                     |
                                                     +-- node .harness/loom/sync.ts --provider <list>
                                                         -> .claude/{agents,skills,settings.json}
                                                         -> .codex/
                                                         -> .gemini/
                                                     |
                                                     +-- Finalizer state auto-fires at cycle halt
                                                         -> .harness/loom/agents/harness-finalizer.md
                                                         -> whatever that finalizer body writes
```

这种拆分是有意为之的:

- 工厂保持小巧,可由用户直接调用
- 目标运行时持有项目特定的工作状态
- 周期收尾 hook 保持单例,且可由项目自定义
- 平台特定树是派生产物,而不是 authoring surface

## 多平台

`sync.ts` 应用的平台 pin:

| 平台 | 模型 | Hook 事件 | 备注 |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` 触发 `.harness/loom/hook.sh`。 |
| Codex | `gpt-5.5`, `model_reasoning_effort: xhigh` | `Stop` | Agent TOML 把所需的 `$skill-name` 提及 prepend 到 `developer_instructions`;skill 镜像在 `.codex/skills/` 之下。 |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | Agent 主体命名所需的 skill;skill 镜像在 `.gemini/skills/` 之下。 |

## 何时使用

在以下情形使用 `harness-loom`:

- 基础助手环境已经强到足以在你的仓库中做真实工作
- 剩余的差距在于可重复性、review 结构、状态连续性与领域贴合度
- 你希望 harness 规则存于版本化文件中,而不是临时再提示
- 你想要一份单一正本 authoring surface,并对多平台派生有确定性

如果你还在评估底层模型栈是否能胜任你的工作,就不要选它。本项目假设通用 harness 已经有用,并专注于把它塑造成面向生产的特定系统。

## 贡献

欢迎 issue、bug 修复与 rubric 精修。开发循环、smoke-test 命令与范围指引(新的用户可调用 skill 或 orchestrator 节奏变更应先以 discussion 启动)请见 [CONTRIBUTING.md](../CONTRIBUTING.md)。安全报告请见 [SECURITY.md](../SECURITY.md)。所有参与都受 [Code of Conduct](../CODE_OF_CONDUCT.md) 约束。

## 项目文档

- [CHANGELOG.md](../CHANGELOG.md) - 发布历史
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 开发设置与 PR 流程
- [SECURITY.md](../SECURITY.md) - 负责任的披露
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) - 社区期望
- [LICENSE](../LICENSE) - Apache 2.0
- [NOTICE](../NOTICE) - Apache 2.0 要求的归属声明
