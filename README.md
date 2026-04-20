<img src="./plugins/harness-loom/assets/harness-loom-small.png" alt="harness-loom logo" width="96" align="left" style="margin-right:16px" />

# harness-loom

[English](README.md) | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [Español](docs/README.es.md)

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](./CHANGELOG.md)
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

A target's `.harness/` is split into three sibling namespaces — `loom/` is the canonical staging tree owned by install and sync, `cycle/` holds runtime state owned by the orchestrator, and `docs/` is the documentation snapshot owned by the new built-in `harness-doc-keeper` producer. Platform trees (`.claude/`, `.codex/`, `.gemini/`) are derived from `.harness/loom/` on demand.

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
    │   │   ├── harness-context/
    │   │   └── harness-doc-keeper/
    │   ├── agents/
    │   │   ├── harness-planner.md
    │   │   └── harness-doc-keeper-producer.md
    │   ├── hook.sh
    │   └── sync.ts
    ├── cycle/                   # runtime state (orchestrator owns)
    │   ├── state.md
    │   ├── events.md
    │   └── epics/
    └── _archive/                # past cycles, created on goal-different reset
```

Project documentation (target-root `*.md` files, `docs/`) is authored **directly in the target**, not inside `.harness/`. You then derive at least one platform tree with `node .harness/loom/sync.ts --provider claude` (and add `codex,gemini` for multi-platform), then add domain-specific pairs with `/harness-pair-dev`. The built-in `harness-doc-keeper` is a reviewer-less producer that auto-fires at every cycle's halt; it reads the project + goal + cycle activity and authors or evolves the documentation this project actually needs (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/design-docs/`, `docs/product-specs/`, `docs/exec-plans/`, etc. — only the subset your project's evidence supports). You do not invoke it directly; the orchestrator dispatches it as the final reviewer-less turn before halting.

## Requirements

- **Node.js ≥ 22.6** — scripts run via native TypeScript stripping; no build step, no `package.json`.
- **git** — pair authoring relies on git history for rollback on `--split`.
- **At least one supported assistant CLI**, authenticated:
  - [Claude Code](https://code.claude.com/docs) — primary target; canonical staging in `.harness/loom/` is derived into `.claude/` via `node .harness/loom/sync.ts --provider claude`.
  - [Codex CLI](https://developers.openai.com/codex/cli) — derived into `.codex/` via `node .harness/loom/sync.ts --provider codex`.
  - [Gemini CLI](https://geminicli.com/docs/) — derived into `.gemini/` via `node .harness/loom/sync.ts --provider gemini`.

## Install

The factory ships in the standard `plugins/<name>/` monorepo layout — the repo root holds `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`, and the actual plugin tree lives under `plugins/harness-loom/`. Author the factory from Claude Code or Codex CLI, then derive runtime trees for whichever assistants you want to use inside the target project.

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

## Quickstart

```bash
cd your-project
claude

# 1) install the canonical foundation (.harness/loom/ + .harness/cycle/)
/harness-init

# 2) deploy at least one platform tree from canonical staging.
node .harness/loom/sync.ts --provider claude
#    For multi-platform, list every provider you want derived:
# node .harness/loom/sync.ts --provider claude,codex,gemini

# 3) define the goal for this cycle
echo "Ship a lightweight terminal Snake game with curses" > goal.md

# 4) add project-specific pairs (unprefixed slugs are auto-prepended with `harness-`).
#    `<purpose>` is a positional second argument. After authoring, re-run the
#    sync command above to refresh the derived platform trees.
/harness-pair-dev --add harness-game-design "Spec snake.py features and edge cases"
/harness-pair-dev --add harness-impl "Implement snake.py against the spec" \
  --reviewer harness-code-reviewer --reviewer harness-playtest-reviewer

# 4a) reviewer-less opt-in for deterministic / auxiliary work
#     (sync, format, mirror); pair is still the default.
/harness-pair-dev --add harness-asset-mirror "Copy canonical assets into the derived tree" \
  --reviewer none

# 4b) re-run sync to deploy the new pairs into platform trees
node .harness/loom/sync.ts --provider claude

# 5) run the runtime harness
/harness-orchestrate goal.md
```

Outputs land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`. Runtime state lives in `.harness/cycle/state.md`, and the event log lives in `.harness/cycle/events.md`. At every cycle's halt the orchestrator auto-dispatches the built-in `harness-doc-keeper` reviewer-less producer, which reads the project + goal + cycle activity and authors or evolves project documentation surgically — target-root master files (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, etc.) and a `docs/` subtree (`design-docs/`, `product-specs/`, `exec-plans/`, `generated/`, as the project's evidence warrants). Existing hand-authored content outside the pointer section is preserved byte-for-byte.

## Concepts

A few terms recur across commands, files, and state. Knowing these six is enough to read the rest of this repo:

- **Harness** — the persistent layer around the assistant: state files, hooks, subagents, contracts. `harness-loom` shapes this layer to fit your repo.
- **Pair** — one **producer** plus one or more **reviewers**, sharing a single `SKILL.md`. The authoring unit of domain work.
- **Producer** — the subagent that performs work for a task (writes code, specs, analysis) and proposes the next action.
- **Reviewer** — a subagent that grades the producer's output on a specific axis (code quality, spec fit, security, etc.). A pair can fan out to many reviewers, each graded independently.
- **EPIC / Task** — an EPIC is a unit of outcome emitted by the planner; a Task is a single producer-reviewer round inside that EPIC. Artifacts land under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`.
- **Orchestrator vs Planner** — the **orchestrator** owns `.harness/cycle/state.md` and dispatches exactly one producer per response (with 0, 1, or M reviewers in parallel). The **planner** runs inside that loop to decompose the goal into EPICs, choose each EPIC's applicable slice of the fixed global roster, and declare same-stage upstream gates across EPICs.

## Commands

| Command | Purpose |
|---------|---------|
| `/harness-init [<target>] [--force]` | Scaffold the canonical `.harness/loom/` staging tree plus the `.harness/cycle/` runtime state into a target project. Writes runtime skills, the `harness-planner` agent, the built-in `harness-doc-keeper` producer, and the `hook.sh` + `sync.ts` self-contained copies under `.harness/loom/`. Touches no platform tree. |
| `node .harness/loom/sync.ts --provider <list>` | Deploy canonical `.harness/loom/` into platform trees (`.claude/`, `.codex/`, `.gemini/`). One-way; never writes back into `.harness/loom/`. Without `--provider` it falls back to disk detection of already-existing platform trees. |
| `/harness-pair-dev --add <slug> "<purpose>" [--reviewer <slug>\|none ...]` | Author a new producer-reviewer pair anchored to the current codebase. `<purpose>` is a positional second argument. Repeat `--reviewer` for 1:N reviewer topology, or pass `--reviewer none` for a reviewer-less producer-only group (deterministic / auxiliary work; pair is still the default). Authoring writes only into `.harness/loom/`; re-run `node .harness/loom/sync.ts --provider <list>` afterward. |
| `/harness-pair-dev --improve <slug> [--hint "<text>"]` | Re-audit an existing pair against the rubric and current codebase, then improve it. Re-run sync afterward to refresh platform trees. |
| `/harness-pair-dev --split <slug>` | Split an overloaded pair into two narrower pairs. Re-run sync afterward. |
| `/harness-orchestrate <goal.md>` | Target-side runtime entry point. Reads the goal, dispatches one producer per response (with its paired reviewer set when applicable), and advances the cycle through hook re-entry. At halt prep, auto-dispatches the built-in `harness-doc-keeper` reviewer-less producer before clearing `Next`. |

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
                                                     +-- harness-doc-keeper auto-fires at cycle halt
                                                         -> CLAUDE.md / AGENTS.md (pointer section)
                                                         -> ARCHITECTURE.md / DESIGN.md / ...
                                                         -> docs/{design-docs,product-specs,exec-plans,generated,...}/
```

This split is intentional:

- the factory stays small and user-invocable
- the target runtime holds the project-specific working state
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
