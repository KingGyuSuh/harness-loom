<img src="./plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](README.md) | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [Español](docs/README.es.md)

[![Version](https://img.shields.io/badge/version-0.1.3-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20Gemini-purple.svg)](#multi-platform)

**Tune a production-specific harness on top of the generic harness shipped by modern coding assistants.**

<br clear="left" />

> **Status:** 0.1.3 — early release. The public surface may iterate before 1.0; see [CHANGELOG](./CHANGELOG.md) for breaking changes.

`harness-loom` is a factory plugin that installs a runtime harness into a target repository and grows it pair by pair.

Modern assistant products are no longer just "a model plus a prompt". They ship a general-purpose harness — planners, hooks, subagents, skills, tool routing, control flow — that decides how work gets planned, delegated, reviewed, and resumed. That layer is valuable, but it does not know your production system: which reviews matter, which artifacts should persist, how your work decomposes, where your authority boundaries sit.

Once your chosen model stack is already capable enough to produce production-quality work, the main leverage shifts from model choice to **harness engineering** — encoding your repo's review standards, task shapes, and definition of done into versioned infrastructure instead of re-prompting it every session. This is harness fine-tuning, not model fine-tuning.

`harness-loom` is for teams that already see production-quality potential in their assistant stack and now want it to behave like a system rather than a session.

This repo is the factory. It seeds a target-side runtime harness made of:

- a planner and orchestrator
- a shared control plane under `.harness/`
- a common runtime context for all subagents
- project-specific producer-reviewer pairs that you add over time

`.claude/` is the canonical source. `.codex/` and `.gemini/` are derived from it on demand.

## Why This Shape

- **Skill-first, agent-second.** Shared methodology lives in one `SKILL.md` per pair, so production rules and review rules stay aligned.
- **Producer plus reviewers.** A pair can fan out to one or many reviewers, each grading on a separate axis.
- **Canonical once, derive outward.** Author the harness in `.claude/`; derive `.codex/` and `.gemini/` only when you want them.
- **Hook-driven execution.** The orchestrator writes the next dispatch into `.harness/state.md`, and hooks re-enter the cycle without manual bookkeeping.
- **Repo-anchored authoring.** Pair generation reads the actual target codebase so it can cite real files and patterns instead of generating abstract boilerplate.

## What Gets Installed

When you run `/harness-init` inside a target repository, `harness-loom` installs a runtime harness rather than a one-off prompt template.

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
└── project-specific producer/reviewer pairs
```

You then add domain-specific pairs with `/harness-pair-dev`, and optionally derive Codex or Gemini-specific trees with `/harness-sync`.

## Requirements

- **Node.js ≥ 22.6** — scripts run via native TypeScript stripping; no build step, no `package.json`.
- **git** — pair authoring relies on git history for rollback on `--split`.
- **At least one supported assistant CLI**, authenticated:
  - [Claude Code](https://code.claude.com/docs) — primary target; `.claude/` is the canonical source.
  - [Codex CLI](https://developers.openai.com/codex/cli) — derived tree via `/harness-sync --provider codex`.
  - [Gemini CLI](https://geminicli.com/docs/) — derived tree via `/harness-sync --provider gemini`.

## Install

The factory ships in the standard `plugins/<name>/` monorepo layout — the repo root holds `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`, and the actual plugin tree lives under `plugins/harness-loom/`. **Factory itself runs on Claude Code or Codex CLI.** Gemini CLI is supported as a *runtime* consumer of harnesses you install into target projects; see the "Gemini CLI (runtime only)" section below.

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

Pin a specific tag:

```text
/plugin marketplace add KingGyuSuh/harness-loom@v0.1.3
/plugin install harness-loom@harness-loom-marketplace
```

### Codex CLI

Add the marketplace source — the argument points at the repo root (which contains `.agents/plugins/marketplace.json`):

```bash
# local checkout
codex marketplace add /path/to/harness-loom

# public git repo
codex marketplace add KingGyuSuh/harness-loom

# pin a tag
codex marketplace add KingGyuSuh/harness-loom@v0.1.3
```

Then, inside the Codex TUI, run `/plugins`, open the `Harness Loom` marketplace entry, and install the plugin.

### Gemini CLI (runtime only)

harness-loom's **factory** cannot be installed as a Gemini extension — Gemini's extension loader hardcodes the repo root as the extension root, which conflicts with the Codex/Claude `plugins/<name>/` monorepo convention that the factory now follows. Instead, Gemini CLI is supported as a **runtime consumer** of the harness you deploy into a target project:

1. From Claude Code or Codex CLI, install the factory and run `/harness-init` + `/harness-sync --provider gemini` inside your target project. This deploys the target-side runtime (`.harness/`, `.gemini/agents/`, `.gemini/skills/`, `.gemini/settings.json` with `AfterAgent` hook).
2. `cd` into that target project and run `gemini`. The CLI auto-loads workspace-scope `.gemini/agents/*.md`, `.gemini/skills/<slug>/SKILL.md`, and the `AfterAgent` hook from `.gemini/settings.json`.
3. Your orchestrator cycle runs on Gemini end-to-end — factory authoring remains on Claude/Codex, execution can be any of the three.

## Quickstart

```bash
cd your-project
claude

# 1) install the canonical foundation
/harness-init

# 2) define the goal for this cycle
echo "Ship a lightweight terminal Snake game with curses" > goal.md

# 3) add project-specific pairs (unprefixed slugs are auto-prepended with `harness-`)
/harness-pair-dev --add harness-game-design --purpose "Spec snake.py features and edge cases"
/harness-pair-dev --add harness-impl --purpose "Implement snake.py against the spec" \
  --reviewer harness-code-reviewer --reviewer harness-playtest-reviewer

# 4) optionally derive Codex / Gemini from canonical .claude/
/harness-sync --provider codex,gemini

# 5) run the runtime harness
/harness-orchestrate goal.md
```

Outputs land under `.harness/epics/EP-N--<slug>/{tasks,reviews}/`. Runtime state lives in `.harness/state.md`, and the event log lives in `.harness/events.md`.

## Concepts

A few terms recur across commands, files, and state. Knowing these six is enough to read the rest of this repo:

- **Harness** — the persistent layer around the assistant: state files, hooks, subagents, contracts. `harness-loom` shapes this layer to fit your repo.
- **Pair** — one **producer** plus one or more **reviewers**, sharing a single `SKILL.md`. The authoring unit of domain work.
- **Producer** — the subagent that performs work for a task (writes code, specs, analysis) and proposes the next action.
- **Reviewer** — a subagent that grades the producer's output on a specific axis (code quality, spec fit, security, etc.). A pair can fan out to many reviewers, each graded independently.
- **EPIC / Task** — an EPIC is a unit of outcome emitted by the planner; a Task is a single producer-reviewer round inside that EPIC. Artifacts land under `.harness/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — the **orchestrator** owns `.harness/state.md` and dispatches exactly one pair per response. The **planner** runs inside the orchestrator's cycle to decompose the goal into EPICs with rosters.

## Commands

| Command | Purpose |
|---------|---------|
| `/harness-init [<target>] [--force]` | Scaffold the canonical `.claude/` foundation into a target project. Writes `.harness/`, runtime skills, the `harness-planner` agent, and hook wiring. |
| `/harness-sync [--provider <list>]` | Derive `.codex/` and `.gemini/` from canonical `.claude/`. This is one-way sync; it never writes back into `.claude/`. |
| `/harness-pair-dev --add <slug> --purpose "<text>" [--reviewer <slug> ...]` | Author a new producer-reviewer pair anchored to the current codebase. Repeat `--reviewer` for 1:N reviewer topology. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | Re-audit an existing pair against the rubric and current codebase, then improve it. |
| `/harness-pair-dev --split <slug>` | Split an overloaded pair into two narrower pairs. |
| `/harness-orchestrate <goal.md>` | Target-side runtime entry point. Reads the goal, dispatches one pair per response, and advances the cycle through hook re-entry. |

## Factory And Runtime

```text
factory (this repo)                            target project
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

This split is intentional:

- the factory stays small and user-invocable
- the target runtime holds the project-specific working state
- provider-specific trees are derived artifacts, not authoring surfaces

## Multi-platform

Platform pins applied by `sync.ts`:

| Platform | Model | Hook event | Notes |
|----------|-------|------------|-------|
| Claude | `inherit` | `Stop` | `.claude/settings.json` triggers `.harness/hook.sh`. |
| Codex | `gpt-5.4`, `model_reasoning_effort: xhigh` | `Stop` | Subagents do not use mini models. |
| Gemini | `gemini-3.1-pro-preview` | `AfterAgent` | Skills are mirrored into the platform tree. |

## When To Use It

Use `harness-loom` when:

- the base assistant environment is already capable enough to do real work in your repo
- the remaining gap is repeatability, review structure, state continuity, and domain fit
- you want harness rules to live in versioned files instead of being re-prompted ad hoc
- you want one canonical authoring surface with deterministic multi-platform derivation

Do not reach for it if you are still evaluating whether the underlying model stack can handle your work at all. This project assumes the generic harness is already useful and focuses on shaping it into a production-specific system.

## Roadmap

Live plan is tracked in [GitHub Milestones](https://github.com/KingGyuSuh/harness-loom/milestones). In short:

- **[v0.2.0](https://github.com/KingGyuSuh/harness-loom/milestone/1)** — break out of the "mirror `.claude/` verbatim" constraint for more authoring flexibility, and add automated docs management.
- **[v0.3.0](https://github.com/KingGyuSuh/harness-loom/milestone/2)** — auto-recommend and generate producer-reviewer agent sets from goal + repo analysis.
- **[v0.4.0](https://github.com/KingGyuSuh/harness-loom/milestone/3)** — execution logging and feedback-loop-driven self-improvement suggestions.
- **[v0.5.0](https://github.com/KingGyuSuh/harness-loom/milestone/4)** — parallel execution mode and a token-efficient mode.

Surface may still iterate pre-1.0; see [CHANGELOG](./CHANGELOG.md) for breaking changes.

## Contributing

Issues, bug fixes, and rubric refinements are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, smoke-test commands, and scope guidance (new user-invocable skills or orchestrator-rhythm changes start as a discussion). For security reports, see [SECURITY.md](./SECURITY.md). All participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Project Documents

- [CHANGELOG.md](./CHANGELOG.md) - release history
- [CONTRIBUTING.md](./CONTRIBUTING.md) - development setup and PR flow
- [SECURITY.md](./SECURITY.md) - responsible disclosure
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) - community expectations
- [LICENSE](./LICENSE) - Apache 2.0
- [NOTICE](./NOTICE) - required attribution notice per Apache 2.0
