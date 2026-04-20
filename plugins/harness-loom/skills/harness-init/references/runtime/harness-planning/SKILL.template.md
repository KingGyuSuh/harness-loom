---
name: harness-planning
description: "Use when authoring or reviewing the planner subagent output for this project. Defines how to read the goal markdown, decompose it into outcome EPICs, and emit the per-EPIC stage flow as a subsequence of the project's fixed global roster. Invoke whenever the `harness-planner` agent is dispatched or its output is audited."
user-invocable: false
---

# Harness Planning

One planner turn emits a small batch of EPICs together with the stage slice each EPIC uses. The project owns one **global roster order**, and each EPIC chooses a **subsequence** of that order rather than inventing a local workflow. The planner returns content in the shape that the orchestrator will fold into `state.md` `## EPIC summaries`, but it does not write task files or control-plane state itself.

## Design Thinking

The planner decides outcomes, not implementation trivia. Each EPIC should describe one meaningful result, then name the stages needed to reach it. The planner does not redesign the runtime on every turn: the runtime already has a fixed stage order, and the planner's job is simply to choose which stages each EPIC uses, which stages can be skipped, and which upstream EPICs must stay ahead at the same stage gate.

This means the planner is not selecting between arbitrary DAG nodes. It is mapping domain outcomes onto a fixed project pipeline.

## Methodology

### 1. Read the project and the goal

Collect only the signals needed to name good EPICs:

- the goal markdown body passed through `/harness-orchestrate <file.md>`
- this project's README, root docs, and major directories
- `.harness/cycle/events.md` when earlier turns matter for re-planning

Treat the goal as plain markdown text. Do not depend on special headers such as `# Goal`.

### 2. Emit EPICs directly

On an initial plan, emit downstream EPICs immediately starting at `EP-1--{kebab-outcome}`. On a re-plan, keep the result append-only by marking replaced EPICs as `superseded` and appending new EPICs after the existing list.

Keep one turn focused. A planner turn should usually emit only a few EPICs. If more remain, leave continuation language under `next-action` and let the orchestrator call the planner again later.

### 3. Generate EPIC fields

Each EPIC has four planner-owned fields:

- `outcome` — one sentence describing what will be true when the EPIC is done
- `upstream` — EPIC slugs that must stay ahead of this EPIC at the same stage gate, or `none`
- `why` — a citation showing which goal line justified this EPIC, such as `goal.md:L12`
- `roster` — the stage slice for this EPIC

`current` and `note` are runtime fields owned by the orchestrator. Do not emit them from the planner.

### 4. Use the fixed roster correctly

The project owns one **global roster order** derived from `harness-orchestrate/SKILL.md` `## Registered pairs`. Each EPIC's `roster` is a **subsequence** of that order:

```text
roster: <pair1-producer> → <pair3-producer> → <pair5-producer>
```

- Every slug must be a registered producer for this cycle.
- Stages may be skipped, but their relative order never changes.
- Reviewers do not appear separately in the roster. One producer name stands for the whole registered group, including the reviewer-less shape marked with `(no reviewer)`.
- `upstream` is a same-stage gate. It does not mean "wait until the whole upstream EPIC is done."

If an EPIC cannot be expressed with currently registered pairs, do not emit it as executable work. Put the needed `slug + purpose` under `Additional pairs required` and summarize the blocked outcome under `Remaining`.

### 5. Re-plan append-only

When the planner is recalled after a structural issue, append new EPICs or mark old ones `superseded`. Do not mutate an existing EPIC's `outcome`, `roster`, or `upstream` in place.

## EPIC summary shape

The orchestrator absorbs planner output into `state.md` `## EPIC summaries` as one heading plus four runtime fields per EPIC.

Example:

```text
### EP-2--auth-skill-authoring
outcome: Author the skill set for the OAuth login flow.
roster: skill-dev-producer → test-writer-producer
current: skill-dev-producer
note: upstream EP-1--domain-agent-design must stay ahead at the same stage gates. Derived from goal.md:L18 "Login must use a third-party OAuth2 flow."
```

`current` is shown here only to illustrate how the orchestrator stores the summary. The planner itself emits `outcome / upstream / why / roster`.

## Evaluation Criteria

- Each EPIC describes one objective outcome rather than a task checklist.
- `why` points to a concrete goal line.
- `roster` uses only registered producers.
- Every EPIC `roster` is a subsequence of the project's fixed global roster.
- `upstream` is treated as a same-stage gate.
- Blocked work goes to `Additional pairs required` instead of being emitted as fake executable EPICs.
- Re-planning is append-only.
- Planner output contains no task file paths and no control-plane fields.

## Taboos

- Invent a local roster order for one EPIC.
- Put reviewers directly into `roster`.
- Treat `upstream` as a whole-EPIC completion dependency.
- Emit blocked work as if the missing pair already exists.
- Mutate an existing EPIC in place instead of appending a replacement.
- Overfill one planning turn with a rushed batch of EPICs instead of leaving continuation work for later.
- Include task file paths or `current` in planner output.

## Example (GOOD)

```text
EPICs (this turn):

EP-1--domain-agent-design
- outcome: Define a dedicated auth-gatekeeper agent for the OAuth domain.
- upstream: none
- why: goal.md:L11 "A dedicated role is needed for third-party OAuth flows."
- roster: agent-dev-producer

EP-2--auth-skill-authoring
- outcome: Author the skill set referenced by auth-gatekeeper.
- upstream: EP-1--domain-agent-design
- why: goal.md:L18 "Login must rely on third-party OAuth2."
- roster: skill-dev-producer → test-writer-producer

Remaining: none
Next-action: no further planning required
Additional pairs required: none
```
