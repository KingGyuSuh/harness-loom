<img src="./plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](README.md) | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [Español](docs/README.es.md)

[![Version](https://img.shields.io/badge/version-0.3.5-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#multi-platform)

**Tune a production-specific harness on top of the generic harness shipped by modern coding assistants.**

<br clear="left" />

## What It Does

`harness-loom` is a factory plugin that installs a runtime harness into a target repository and grows it pair by pair. The factory ships four user-facing slash commands (`/harness-init`, `/harness-auto-setup`, `/harness-pair-dev`, `/harness-goal-interview`) plus a `sync.ts` script. Once installed, your target gets a planner, an orchestrator, a shared control plane under `.harness/`, and a place to add project-specific producer-reviewer pairs over time.

This is harness fine-tuning, not model fine-tuning — you encode your repo's review standards, task shapes, and definition of done into versioned infrastructure instead of re-prompting it every session. `harness-loom` is for teams that already see production-quality potential in their assistant stack and now want it to behave like a system rather than a session.

## Quick Start

Install the factory into Claude Code. Codex and Gemini have similar flows — see [Install The Factory](#install-the-factory) for those.

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

Inside your target repository:

```bash
# 1. seed or migrate .harness/
/harness-auto-setup --setup

# 2. derive the assistant runtime tree
node .harness/loom/sync.ts --provider claude
#   (add codex,gemini for multi-platform)
```

That gets the foundation in place. To add project-specific producer-reviewer pairs and run your first cycle, see [Start A Target Project](#start-a-target-project).

## How It Works

```mermaid
flowchart LR
    subgraph Factory [harness-loom factory plugin]
        AS["/harness-auto-setup"]
        PD["/harness-pair-dev"]
        GI["/harness-goal-interview"]
        OR["/harness-orchestrate"]
    end
    subgraph Target [target repository]
        L[".harness/loom/<br/>canonical staging"]
        C[".harness/cycle/<br/>runtime state"]
        P[".claude / .codex / .gemini<br/>derived provider trees"]
    end
    AS -->|seed or migrate| L
    PD -->|author pairs| L
    GI -->|writes goal file| Target
    L -->|node sync.ts --provider| P
    OR -->|reads| L
    OR -->|writes| C
```

The factory plugin lives in your assistant CLI; running its slash commands inside a target repository writes to `.harness/loom/` (canonical staging owned by setup and pair authoring) and `.harness/cycle/` (runtime state owned by the orchestrator). Provider trees (`.claude/`, `.codex/`, `.gemini/`) are derived artifacts you regenerate with `sync.ts` whenever canonical staging changes — never edit them directly. The cycle-end **Finalizer** turn writes target-root output (docs, audits, release notes) directly into the target, not inside `.harness/`.

## Why This Shape

- **Skill-first, agent-second.** Shared methodology lives in one `SKILL.md` per pair, so production rules and review rules stay aligned.
- **Producer plus reviewers.** A pair can fan out to one or many reviewers, each grading on a separate axis.
- **Canonical once, derive outward.** Author the harness in `.harness/loom/`; derive `.claude/`, `.codex/`, and `.gemini/` only when you want them.
- **Hook-driven execution.** The orchestrator writes the next dispatch into `.harness/cycle/state.md`, and hooks re-enter the cycle without manual bookkeeping.
- **Repo-anchored authoring.** Pair generation reads the actual target codebase so it can cite real files and patterns instead of generating abstract boilerplate.

## What Gets Installed

```text
target project
└── .harness/
    ├── loom/                    # canonical staging (setup + pair authoring own; sync reads)
    │   ├── skills/{harness-orchestrate, harness-planning, harness-context}/
    │   ├── agents/{harness-planner, harness-finalizer}.md
    │   ├── hook.sh
    │   └── sync.ts
    ├── cycle/                   # runtime state (orchestrator owns)
    │   ├── state.md, events.md
    │   └── epics/, finalizer/tasks/
    ├── _snapshots/              # auto-setup provenance (when migration runs)
    └── _archive/                # past cycles (created on goal-different reset)
```

Project documentation (target-root `*.md`, `docs/`) is authored **directly in the target**, not inside `.harness/`. The orchestrator runs as a four-state DFA — `Planner | Pair | Finalizer | Halt`. When every EPIC reaches terminal and no planner continuation remains, it dispatches the singleton `harness-finalizer` agent before halting; you replace its body with the cycle-end work this project needs (documentation refresh, request-coverage inspection, release prep, audit output).

`/harness-auto-setup` is the safer entry point: `--setup` (default) bootstraps a fresh target or extends an existing harness additively; `--migration` snapshots live `.harness/loom/` and `.harness/cycle/`, refreshes the foundation, and preserves compatible custom pair/finalizer guidance.

## Requirements

- **Node.js ≥ 22.6** — scripts run via native TypeScript stripping; no build step, no `package.json`.
- **git** — recommended for reviewing generated harness changes and recovering local experiments through your normal VCS flow.
- **At least one supported assistant CLI**, authenticated:
  - [Claude Code](https://code.claude.com/docs) — primary target; canonical staging in `.harness/loom/` is derived into `.claude/` via `node .harness/loom/sync.ts --provider claude`.
  - [Codex CLI](https://developers.openai.com/codex/cli) — derived into `.codex/` via `node .harness/loom/sync.ts --provider codex`; generated agent TOMLs explicitly mention required `$skill-name` bodies.
  - [Gemini CLI](https://geminicli.com/docs/) — derived into `.gemini/` via `node .harness/loom/sync.ts --provider gemini`; generated agent bodies name the required skills because Gemini frontmatter rejects `skills:`.

## Install The Factory

There are two installs in practice:

1. Install the **factory plugin** into Claude Code or Codex CLI.
2. Inside each target repository, run `/harness-auto-setup --setup` (or `--migration` for minimal-delta upgrades of an existing harness) to seed, inspect, or migrate `.harness/`, then `node .harness/loom/sync.ts --provider <list>` to deploy the assistant-specific runtime trees you actually want to use.

The factory ships in the standard `plugins/<name>/` monorepo layout — the repo root holds `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`, and the actual plugin tree lives under `plugins/harness-loom/`.

Choose one factory install path below. Most users install the factory from either Claude Code or Codex CLI, then use the generated runtime from whichever assistants they want inside target repositories.

### Claude Code

Local sanity test (one-shot, no marketplace):

```bash
claude --plugin-dir ./plugins/harness-loom
```

Persistent install via the in-session marketplace. Local checkout:

```text
/plugin marketplace add ./
/plugin install harness-loom@harness-loom-marketplace
```

Public git repo (GitHub shorthand):

```text
/plugin marketplace add KingGyuSuh/harness-loom
/plugin install harness-loom@harness-loom-marketplace
```

Pin a specific tag if needed:

```text
/plugin marketplace add KingGyuSuh/harness-loom@<tag>
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

Add the marketplace source — the argument points at the repo root (which contains `.agents/plugins/marketplace.json`):

```bash
# local checkout
codex plugin marketplace add /path/to/harness-loom

# public git repo
codex plugin marketplace add KingGyuSuh/harness-loom

# pin a tag if needed
codex plugin marketplace add KingGyuSuh/harness-loom@<tag>
```

Then, inside the Codex TUI, run `/plugins`, open the `Harness Loom` marketplace entry, and install the plugin.

### Gemini Runtime

Use Claude Code or Codex CLI to install the factory, then derive `.gemini/` inside the target project:

1. From Claude Code or Codex CLI, install the factory and run `/harness-auto-setup --setup --provider gemini`, then `node .harness/loom/sync.ts --provider gemini` inside your target project. This deploys the target-side runtime (`.harness/loom/`, `.harness/cycle/`, `.gemini/agents/`, `.gemini/skills/`, `.gemini/settings.json` with `AfterAgent` hook).
2. `cd` into that target project and run `gemini`. The CLI auto-loads workspace-scope `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, and the `AfterAgent` hook from `.gemini/settings.json`.
3. Your orchestrator cycle runs on Gemini end-to-end — factory authoring remains on Claude/Codex, execution can be any of the three.

## Start A Target Project

Once the factory is installed in your assistant, the usual target-repo flow is:

1. Seed `.harness/`, configure project-shaped pairs/finalizer, or migrate it with `/harness-auto-setup --setup` or `/harness-auto-setup --migration`.
2. Deploy at least one assistant runtime tree with `sync.ts`.
3. Add the first producer-reviewer pairs for your repo.
4. Optionally customize the cycle-end finalizer.
5. Run `/harness-orchestrate <file.md>`.

### 1. Setup Or Migrate The Target Repository

Open the target repository in Claude Code or Codex CLI and run:

```text
/harness-auto-setup --setup --provider claude
```

Use a comma-separated provider list when you know the platform trees you will refresh:

```text
/harness-auto-setup --setup --provider claude,codex,gemini
```

`--setup` seeds a fresh target through the foundation installer and keeps the default finalizer until concrete cycle-end work is selected. Fresh targets require assistant-side LLM project analysis before pair/finalizer files are authored; docs/tests/CI presence alone no longer creates `harness-document` or `harness-verification`. If the target already has `.harness/loom/` or `.harness/cycle/`, `--setup` does not snapshot, reseed, restore, reconstruct, or migrate anything; it inspects the live harness and repo signals, then continues with project analysis, concise user questions when needed, and additive pair/finalizer authoring under `.harness/loom/`.

When you want a minimal-delta upgrade of an existing harness instead of setup-mode convergence, run:

```text
/harness-auto-setup --migration --provider claude
```

Migration mode preserves user-authored pair/finalizer guidance where possible, including compatible renamed or custom H2 sections, and refreshes contract-owned surfaces such as required frontmatter, `skills:`, Output Format blocks, and the finalizer Structural Issue contract. The JSON summary includes a `convergence.migrationPlan` source/target overlay plan. The snapshot remains machine provenance and migration evidence, not a restored source of truth.

If you only want a foundation reset with no convergence, run:

```text
/harness-init
```

This writes the canonical staging tree under `.harness/loom/` and the runtime state scaffold under `.harness/cycle/`. It seeds `state.md`, `events.md`, `epics/`, and `finalizer/tasks/`; it does not create goal/request snapshot placeholders, `.claude/`, `.codex/`, or `.gemini/`.

If you rerun `/harness-init` later, treat it as a reset of the target-side harness scaffolding: pair-authored `.harness/loom/` content and the current `.harness/cycle/` state are reseeded rather than preserved. Use `/harness-auto-setup --setup` for fresh bootstrap or additive project-shaped configuration, and `/harness-auto-setup --migration` when you want minimal-delta contract refresh of an existing foundation.

### 2. Deploy The Assistant Runtime You Actually Want To Use

Derive at least one platform tree from canonical staging:

```bash
node .harness/loom/sync.ts --provider claude
```

For multi-platform deployment:

```bash
node .harness/loom/sync.ts --provider claude,codex,gemini
```

Re-run this command after any pair edits or finalizer edits. `.harness/loom/` is the authoring surface; `.claude/`, `.codex/`, and `.gemini/` are derived outputs.

### 3. Add The First Pairs

Create pairs that match how work actually decomposes in your repo. Canonical pair slugs use the `harness-` prefix, and every pair must include at least one reviewer. Assistants may accept a bare name such as `document`, but generated files and registry entries are always written as `harness-document`.

```text
/harness-pair-dev --add harness-game-design "Spec snake.py features and edge cases"
/harness-pair-dev --add harness-impl "Implement snake.py against the spec" --reviewer harness-code-reviewer --reviewer harness-playtest-reviewer
```

After authoring, improving, or removing pairs, run `node .harness/loom/sync.ts --provider <list>` again so the platform trees pick up the current agents and skills.

### 4. Customize The Finalizer If You Need Cycle-End Work

The seeded `.harness/loom/agents/harness-finalizer.md` is a safe no-op. By default it returns `Status: PASS` with `Summary: no cycle-end work registered for this project` and touches no files.

Leave it as-is if you only want the cycle to halt cleanly.

Edit it if your project needs cycle-end work such as:

- refreshing `CLAUDE.md`, `AGENTS.md`, or `docs/`
- checking goal coverage against `.harness/cycle/events.md`
- writing release notes or audit artifacts
- snapshotting schemas or derived reports

After editing the finalizer body, run `sync.ts` again to deploy the updated agent into the platform trees.

### 5. Run The First Cycle

Create a request file and start the orchestrator:

```bash
cat > goal.md <<'EOF'
Ship a lightweight terminal Snake game with curses
EOF

/harness-orchestrate goal.md
```

Artifacts land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`. Runtime state lives in `.harness/cycle/state.md`, the full original request lives in `.harness/cycle/user-request-snapshot.md`, and the append-only event log lives in `.harness/cycle/events.md`. When every live EPIC reaches terminal and no planner continuation remains, the orchestrator enters the **Finalizer state**, runs the singleton `harness-finalizer`, and halts.

## What You Usually Customize

Most users only need to customize three things:

- **Pairs** — add, improve, and remove producer-reviewer pairs until they reflect your repo's actual work decomposition and review axes. If one pair has become two different jobs, add or improve the replacements explicitly, then remove the old pair.
- **Finalizer body** — replace the default no-op only if your project needs cycle-end work at the target root.
- **Cycle request files** — each cycle starts from a user-authored request file, often named `goal.md`. The orchestrator preserves the full body in `.harness/cycle/user-request-snapshot.md` and passes that path through dispatch envelopes as `User request snapshot`; `Goal` remains a compact summary.

Most users do **not** need to edit these by hand:

- `harness-orchestrate`
- `harness-planning`
- `harness-context`
- `.harness/cycle/state.md`
- `.harness/cycle/events.md`

Treat those as runtime infrastructure unless you are intentionally changing the harness contract itself.

## Concepts

A few terms recur across commands, files, and state. Knowing these is enough to read the rest of this repo:

- **Harness** — the persistent layer around the assistant: state files, hooks, subagents, contracts. `harness-loom` shapes this layer to fit your repo.
- **Pair** — one **producer** plus one or more **reviewers**, sharing a single `SKILL.md`. The authoring unit of domain work.
- **Producer** — the subagent that performs work for a task (writes code, specs, analysis) and returns the task artifact. Its `Status` is self-report only; reviewers decide the Pair verdict.
- **Reviewer** — a subagent that grades the producer's output on a specific axis (code quality, spec fit, security, etc.). A pair can fan out to many reviewers, each graded independently; their `Verdict` values are the Pair turn's load-bearing verdict source.
- **EPIC / Task** — an EPIC is a unit of outcome emitted by the planner; a Task is a single producer-reviewer round inside that EPIC. Artifacts land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — the **orchestrator** owns `.harness/cycle/state.md` and runs as a four-state DFA (`Planner | Pair | Finalizer | Halt`), dispatching exactly one producer per response (Pair turns run a producer plus 1 or M reviewers in parallel; Finalizer turns run a single cycle-end agent with no reviewer). The **planner** runs inside that loop to decompose the goal into EPICs, choose each EPIC's applicable slice of the fixed global roster, and declare same-stage upstream gates across EPICs.
- **Finalizer** — the cycle-end hook. The runtime ships one singleton `harness-finalizer` agent that runs when every EPIC is terminal and no planner continuation remains. It has no paired reviewer; verdict is the finalizer's own `Status` plus mechanical `Self-verification` evidence. The default seeded `harness-finalizer` is a generic skeleton; the project replaces its body with the concrete cycle-end work it needs.

## Commands

| Command | Purpose |
|---------|---------|
| `/harness-init` | Scaffold the canonical `.harness/loom/` staging tree plus the `.harness/cycle/` runtime state into the current working directory. Writes runtime skills, the `harness-planner` agent, the generic `harness-finalizer` cycle-end skeleton, and the `hook.sh` + `sync.ts` self-contained copies under `.harness/loom/`. Seeds `state.md`, `events.md`, `epics/`, and `finalizer/tasks/`, but no goal or request snapshot placeholder. Rerunning install reseeds both namespaces. Touches no platform tree. |
| `/harness-auto-setup [--setup \| --migration] [--provider <list>]` | Safely set up, configure, or migrate the current working directory's harness. `--setup` (default) bootstraps fresh targets and requires assistant-side project analysis before authoring pair/finalizer files instead of creating stock docs/tests pairs; on existing targets it leaves foundation files untouched and performs only additive project-shaped authoring unless the user asks for improvements. `--migration` performs a minimal-delta upgrade for existing harnesses: snapshot first, refresh the foundation, restore custom loom entries, then preserve pair/finalizer guidance while rewriting only contract-owned runtime surfaces and emitting a migration plan. Both modes stop with an explicit sync command and touch no platform tree. |
| `node .harness/loom/sync.ts --provider <list>` | Deploy canonical `.harness/loom/` into platform trees (`.claude/`, `.codex/`, `.gemini/`). One-way; never writes back into `.harness/loom/`. Provider selection is explicit: a bare invocation with no provider flags is an error. Claude keeps agent `skills:` frontmatter; Codex and Gemini receive required skill-loading prompts in generated agent bodies. |
| `/harness-pair-dev --add <slug> "<purpose>" [--from <source>] [--reviewer <slug> ...] [--before <slug> \| --after <slug>]` | Author a new producer-reviewer pair anchored to the current codebase. `<purpose>` is required. `--from` accepts either a currently registered live pair slug or a target-local `snapshot:<ts>/<pair>` / `archive:<ts>/<pair>` locator as the template-first overlay source: current harness shape stays fixed while compatible source domain guidance is preserved. It is not an arbitrary filesystem path or provider-tree import. Default is 1:1; repeat `--reviewer` for 1:N reviewer topology. Authoring writes only into `.harness/loom/`; re-run `node .harness/loom/sync.ts --provider <list>` afterward. |
| `/harness-pair-dev --improve <slug> "<purpose>" [--before <slug> \| --after <slug>]` | Improve an existing registered pair with positional `<purpose>` as the primary revision axis, then fold in rubric hygiene and current repo evidence. If a pair has become two different jobs, use explicit add/improve/remove steps. Re-run sync afterward to refresh platform trees. |
| `/harness-pair-dev --remove <slug>` | Safely unregister a pair and delete only pair-owned `.harness/loom/` files. Removal refuses foundation/singleton targets and active-cycle references in `## Next` or live EPIC roster/current fields before mutating, preserves `.harness/cycle/` task/review history, and touches no provider tree; re-run sync afterward. |
| `/harness-orchestrate <file.md>` | Target-side runtime entry point. Reads the request file, preserves its full body in `.harness/cycle/user-request-snapshot.md`, and runs a four-state DFA (`Planner | Pair | Finalizer | Halt`) dispatching exactly one producer per response; hook re-entry advances the cycle from `state.md` and the existing snapshot path. When every EPIC reaches terminal and planner continuation is clear, the orchestrator enters the Finalizer state and dispatches the singleton `harness-finalizer` before halting. |

## Multi-platform

Platform pins applied by `sync.ts`:

| Platform | Model | Hook event | Notes |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` triggers `.harness/loom/hook.sh`. |
| Codex | `gpt-5.5`, `model_reasoning_effort: xhigh` | `Stop` | Agent TOMLs prepend required `$skill-name` mentions to `developer_instructions`; skills are mirrored under `.codex/skills/`. |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | Agent bodies name the required skills; skills are mirrored under `.gemini/skills/`. |

## When To Use It

Use `harness-loom` when:

- the base assistant environment is already capable enough to do real work in your repo
- the remaining gap is repeatability, review structure, state continuity, and domain fit
- you want harness rules to live in versioned files instead of being re-prompted ad hoc
- you want one canonical authoring surface with deterministic multi-platform derivation

Do not reach for it if you are still evaluating whether the underlying model stack can handle your work at all. This project assumes the generic harness is already useful and focuses on shaping it into a production-specific system.

## Contributing

Issues, bug fixes, and rubric refinements are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, smoke-test commands, and scope guidance (new user-invocable skills or orchestrator-rhythm changes start as a discussion). For security reports, see [SECURITY.md](./SECURITY.md). All participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Project Documents

- [CHANGELOG.md](./CHANGELOG.md) - release history
- [CONTRIBUTING.md](./CONTRIBUTING.md) - development setup and PR flow
- [SECURITY.md](./SECURITY.md) - responsible disclosure
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) - community expectations
- [LICENSE](./LICENSE) - Apache 2.0
- [NOTICE](./NOTICE) - attribution notice required by Apache 2.0
