<img src="./plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](README.md) | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [Español](docs/README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.2-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#multi-platform)

**Tune a production-specific harness on top of the generic harness shipped by modern coding assistants.**

<br clear="left" />

`harness-loom` is a factory plugin that installs a runtime harness into a target repository and grows it pair by pair.

Modern assistant products are no longer just "a model plus a prompt". They ship a general-purpose harness — planners, hooks, subagents, skills, tool routing, control flow — that decides how work gets planned, delegated, reviewed, and resumed. That layer is valuable, but it does not know your production system: which reviews matter, which artifacts should persist, how your work decomposes, where your authority boundaries sit.

Once your chosen model stack is already capable enough to produce production-quality work, the main leverage shifts from model choice to **harness engineering** — encoding your repo's review standards, task shapes, and definition of done into versioned infrastructure instead of re-prompting it every session. This is harness fine-tuning, not model fine-tuning.

`harness-loom` is for teams that already see production-quality potential in their assistant stack and now want it to behave like a system rather than a session.

This repo is the factory. It seeds a target-side runtime harness made of:

- a planner and orchestrator
- a shared control plane under `.harness/`
- a common runtime context for all subagents
- project-specific producer-reviewer pairs that you add over time

A target's `.harness/` is split into two sibling namespaces — `loom/` is the canonical staging tree owned by install and sync, and `cycle/` holds runtime state owned by the orchestrator. Out-of-cycle artifacts (target-root `*.md`, `docs/`, release notes, audit output) are written directly at the target root by the cycle-end **Finalizer** turn, not inside `.harness/`. Platform trees (`.claude/`, `.codex/`, `.gemini/`) are derived from `.harness/loom/` on demand.

## Why This Shape

- **Skill-first, agent-second.** Shared methodology lives in one `SKILL.md` per pair, so production rules and review rules stay aligned.
- **Producer plus reviewers.** A pair can fan out to one or many reviewers, each grading on a separate axis.
- **Canonical once, derive outward.** Author the harness in `.harness/loom/`; derive `.claude/`, `.codex/`, and `.gemini/` only when you want them.
- **Hook-driven execution.** The orchestrator writes the next dispatch into `.harness/cycle/state.md`, and hooks re-enter the cycle without manual bookkeeping.
- **Repo-anchored authoring.** Pair generation reads the actual target codebase so it can cite real files and patterns instead of generating abstract boilerplate.

## What Gets Installed

When you run `/harness-init` inside a target repository, `harness-loom` installs a runtime harness rather than a one-off prompt template.

```text
target project
└── .harness/
    ├── loom/                    # canonical staging (install + sync own)
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
    │   └── epics/
    └── _archive/                # past cycles, created on goal-different reset
```

Project documentation (target-root `*.md` files, `docs/`) is authored **directly in the target**, not inside `.harness/`. You then derive at least one platform tree with `node .harness/loom/sync.ts --provider claude` (and add `codex,gemini` for multi-platform), then add domain-specific pairs with `/harness-pair-dev`. The orchestrator runs as a four-state DFA — `Planner | Pair | Finalizer | Halt`. When every EPIC reaches terminal and the planner is done, it enters the **Finalizer state** and dispatches the singleton `harness-finalizer` agent before halting. The seeded `harness-finalizer` agent is a generic skeleton; you replace its body with the concrete cycle-end work this project needs — documentation refresh (`CLAUDE.md`, `AGENTS.md`, `docs/`), goal-coverage inspection against `events.md`, release prep, audit output, etc. You do not invoke the finalizer directly; the orchestrator dispatches it as the cycle-end turn before halting.

## Requirements

- **Node.js ≥ 22.6** — scripts run via native TypeScript stripping; no build step, no `package.json`.
- **git** — pair authoring relies on git history for rollback on `--split`.
- **At least one supported assistant CLI**, authenticated:
  - [Claude Code](https://code.claude.com/docs) — primary target; canonical staging in `.harness/loom/` is derived into `.claude/` via `node .harness/loom/sync.ts --provider claude`.
  - [Codex CLI](https://developers.openai.com/codex/cli) — derived into `.codex/` via `node .harness/loom/sync.ts --provider codex`.
  - [Gemini CLI](https://geminicli.com/docs/) — derived into `.gemini/` via `node .harness/loom/sync.ts --provider gemini`.

## Install The Factory

There are two installs in practice:

1. Install the **factory plugin** into Claude Code or Codex CLI.
2. Inside each target repository, run `/harness-init` to seed `.harness/`, then `node .harness/loom/sync.ts --provider <list>` to deploy the assistant-specific runtime trees you actually want to use.

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
codex marketplace add /path/to/harness-loom

# public git repo
codex marketplace add KingGyuSuh/harness-loom

# pin a tag if needed
codex marketplace add KingGyuSuh/harness-loom@<tag>
```

Then, inside the Codex TUI, run `/plugins`, open the `Harness Loom` marketplace entry, and install the plugin.

### Gemini Runtime

Use Claude Code or Codex CLI to install the factory, then derive `.gemini/` inside the target project:

1. From Claude Code or Codex CLI, install the factory and run `/harness-init` + `node .harness/loom/sync.ts --provider gemini` inside your target project. This deploys the target-side runtime (`.harness/loom/`, `.harness/cycle/`, `.gemini/agents/`, `.gemini/skills/`, `.gemini/settings.json` with `AfterAgent` hook).
2. `cd` into that target project and run `gemini`. The CLI auto-loads workspace-scope `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, and the `AfterAgent` hook from `.gemini/settings.json`.
3. Your orchestrator cycle runs on Gemini end-to-end — factory authoring remains on Claude/Codex, execution can be any of the three.

## Start A Target Project

Once the factory is installed in your assistant, the usual target-repo flow is:

1. Seed `.harness/` with `/harness-init`.
2. Deploy at least one assistant runtime tree with `sync.ts`.
3. Add the first producer-reviewer pairs for your repo.
4. Optionally customize the cycle-end finalizer.
5. Run `/harness-orchestrate <goal.md>`.

### 1. Initialize The Target Repository

Open the target repository in Claude Code or Codex CLI and run:

```text
/harness-init
```

This writes the canonical staging tree under `.harness/loom/` and the runtime state scaffold under `.harness/cycle/`. It does not create `.claude/`, `.codex/`, or `.gemini/` yet.

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

Create pairs that match how work actually decomposes in your repo. Every pair slug must start with the `harness-` prefix, and every pair must include at least one reviewer.

```text
/harness-pair-dev --add harness-game-design "Spec snake.py features and edge cases"
/harness-pair-dev --add harness-impl "Implement snake.py against the spec" --reviewer harness-code-reviewer --reviewer harness-playtest-reviewer
```

After authoring or improving pairs, run `sync.ts` again so the platform trees pick up the new agents and skills.

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

Create a goal file and start the orchestrator:

```bash
cat > goal.md <<'EOF'
Ship a lightweight terminal Snake game with curses
EOF

/harness-orchestrate goal.md
```

Artifacts land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`. Runtime state lives in `.harness/cycle/state.md`, and the append-only event log lives in `.harness/cycle/events.md`. When every live EPIC reaches terminal, the orchestrator enters the **Finalizer state**, runs the singleton `harness-finalizer`, and halts.

## What You Usually Customize

Most users only need to customize three things:

- **Pairs** — add, improve, and split producer-reviewer pairs until they reflect your repo's actual work decomposition and review axes.
- **Finalizer body** — replace the default no-op only if your project needs cycle-end work at the target root.
- **Goal files** — each cycle starts from a user-authored goal, usually `goal.md`.

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
- **Producer** — the subagent that performs work for a task (writes code, specs, analysis) and proposes the next action.
- **Reviewer** — a subagent that grades the producer's output on a specific axis (code quality, spec fit, security, etc.). A pair can fan out to many reviewers, each graded independently.
- **EPIC / Task** — an EPIC is a unit of outcome emitted by the planner; a Task is a single producer-reviewer round inside that EPIC. Artifacts land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — the **orchestrator** owns `.harness/cycle/state.md` and runs as a four-state DFA (`Planner | Pair | Finalizer | Halt`), dispatching exactly one producer per response (Pair turns run a producer plus 1 or M reviewers in parallel; Finalizer turns run a single cycle-end agent with no reviewer). The **planner** runs inside that loop to decompose the goal into EPICs, choose each EPIC's applicable slice of the fixed global roster, and declare same-stage upstream gates across EPICs.
- **Finalizer** — the cycle-end hook. The runtime ships one singleton `harness-finalizer` agent that runs when every EPIC is terminal. It has no paired reviewer; verdict is the finalizer's own `Status` plus mechanical `Self-verification` evidence. The default seeded `harness-finalizer` is a generic skeleton; the project replaces its body with the concrete cycle-end work it needs.

## Commands

| Command | Purpose |
|---------|---------|
| `/harness-init [<target>]` | Scaffold the canonical `.harness/loom/` staging tree plus the `.harness/cycle/` runtime state into a target project. Writes runtime skills, the `harness-planner` agent, the generic `harness-finalizer` cycle-end skeleton, and the `hook.sh` + `sync.ts` self-contained copies under `.harness/loom/`. Rerunning install reseeds both namespaces. Touches no platform tree. |
| `node .harness/loom/sync.ts --provider <list>` | Deploy canonical `.harness/loom/` into platform trees (`.claude/`, `.codex/`, `.gemini/`). One-way; never writes back into `.harness/loom/`. Without `--provider` it falls back to disk detection of already-existing platform trees. |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug> ...]` | Author a new producer-reviewer pair anchored to the current codebase. `<purpose>` is a positional second argument. Default is 1:1; repeat `--reviewer` for 1:N reviewer topology. Every pair carries at least one reviewer — cycle-end reviewer-less work belongs in the singleton `harness-finalizer`, not in the pair roster. Authoring writes only into `.harness/loom/`; re-run `node .harness/loom/sync.ts --provider <list>` afterward. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | Re-audit an existing pair against the rubric and current codebase, then improve it. Re-run sync afterward to refresh platform trees. |
| `/harness-pair-dev --split <slug>` | Split an overloaded pair into two narrower pairs. Re-run sync afterward. |
| `/harness-orchestrate <goal.md>` | Target-side runtime entry point. Reads the goal and runs a four-state DFA (`Planner | Pair | Finalizer | Halt`) dispatching exactly one producer per response; hook re-entry advances the cycle. When every EPIC reaches terminal, the orchestrator enters the Finalizer state and dispatches the singleton `harness-finalizer` before halting. |

## Factory And Runtime

```text
factory (this repo)                            target project
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
                                                     +-- Finalizer state auto-fires at cycle halt
                                                         -> .harness/loom/agents/harness-finalizer.md
                                                         -> whatever that finalizer body writes
```

This split is intentional:

- the factory stays small and user-invocable
- the target runtime holds the project-specific working state
- the cycle-end hook stays singleton and project-customizable
- provider-specific trees are derived artifacts, not authoring surfaces

## Multi-platform

Platform pins applied by `sync.ts`:

| Platform | Model | Hook event | Notes |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` triggers `.harness/loom/hook.sh`. |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | Subagents do not use mini models. |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | Skills are mirrored into the platform tree. |

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
- [NOTICE](./NOTICE) - required attribution notice per Apache 2.0
