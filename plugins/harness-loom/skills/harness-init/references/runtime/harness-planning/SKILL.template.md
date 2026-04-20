---
name: harness-planning
description: "Use when authoring or reviewing the planner subagent output for this project. Defines how to read the goal markdown, decompose it into outcome EPICs (cap 3-4 per turn), and emit the per-EPIC executing-department sequence (roster). Invoke whenever the `harness-planner` agent is dispatched or its output is audited."
user-invocable: false
---

# Harness Planning

Read the codebase domain first so the producer roles required by the work can emerge. Do not force a fixed team shape. One planner turn must emit **both the EPIC list and the execution roster for each EPIC** in the **same artifact**. The planner returns content in the shape of the `## EPIC summaries` block in `state.md`, but it does not leave task files; the actual state write belongs to the orchestrator. EPIC mutation is **append-only**: add a new EPIC or mark an existing one as `superseded`, but never edit an EPIC's `outcome`, `roster`, or `upstream` fields in place. A single turn stops at 3-4 EPICs; overflow moves to the next turn. This cap protects how many EPICs the planner can think about carefully in one pass.

## Design Thinking

Good team design starts from the domain of the codebase. A priori templates such as "the harness always looks like this" are useless. Even under the same waterfall, pair, and cycle model, a backend-heavy codebase, a docs-heavy codebase, and an ML pipeline all require different producers. The planner reads codebase files and the goal markdown to answer **what kinds of artifacts will be produced repeatedly**, then derives departments from that. An EPIC is not a task bundle; it is **one outcome**. The departments required to reach that outcome run in waterfall order inside that EPIC.

The planner is just another producer, and its artifact is the downstream EPIC list itself. The orchestrator copies that list into `state.md` `## EPIC summaries`. Even if the planner role is revised later, this document remains the primary runtime planning contract.

## Methodology

### 1. Read the codebase

Collect domain signals:

- codebase structure: language, major directories, build/runtime boundaries
- `README.md` and root docs: how the codebase explains itself
- `.harness/events.md`, if present: success/failure patterns from earlier cycles
- the full goal markdown body passed through `/harness-orchestrate <file.md>`

The goal is the entire markdown body. Do not require marker headers such as `# Goal`. Every line in the body may be cited as a goal-source line.

### 2. Emit EPICs directly

On the first planner call, emit downstream EPICs immediately, numbering them from `EP-1--{kebab-outcome}`. On a re-plan turn, keep the result append-only by marking superseded EPICs and appending new EPICs after the existing list.

### 3. Generate EPICs

Each EPIC has five fields:

- `slug` — `EP-N--{kebab-outcome}` such as `EP-2--auth-skill-authoring`
- `outcome` — a one-sentence completion condition in verb-plus-object form; what has to be built or fixed for this EPIC to be done
- `upstream` — the list of EPIC slugs that must finish first, or `none`
- `why` — a citation showing which line in the goal markdown generated this EPIC, such as `goal.md:L12`
- `roster` — the producer-reviewer execution order within the EPIC, described in §4

The upstream graph must be acyclic.

The planner's output fields are exactly `outcome / upstream / why / roster`. The `## EPIC summaries` block in `state.md` uses `outcome / roster / current / note`, but **`current` and `note` are runtime fields owned by the orchestrator**. Do not emit them from the planner. The orchestrator folds `upstream` and `why` into `note`.

### 4. Waterfall roster within an EPIC

Each EPIC's `roster` is the sequence of producers that must run to complete that EPIC. The shape is:

```
roster: <pair1-producer> → <pair2-producer> → <pair3-producer>
```

- Every slug must be a registered pair producer in this cycle. Unregistered slugs cannot appear in the roster.
- Reviewers do not appear separately in the roster. One producer name stands for the whole group, and the orchestrator automatically dispatches the paired reviewer(s) — or zero reviewers, if the registered line for that producer is the reviewer-less shape (`(no reviewer)`, no `↔` arrow). The planner does not need to know which kind a producer is; the orchestrator looks it up at dispatch time.
- The planner itself never appears as a roster producer. It is re-dispatched only through the orchestrator's escalation path.
- If an EPIC cannot be filled with registered pairs, **do not include it in `EPICs (this turn)`**. Instead, list the needed pair slug + purpose under `Additional pairs required`, and leave a one-line summary of the blocked outcome under `Remaining`. The state should contain only **executable EPICs**, meaning EPICs whose rosters are fully fillable by registered pairs.

The orchestrator maintains each EPIC's `current` field as the current producer slug from the roster. Every reviewer PASS advances it to the next roster slug. Passing the last roster element changes `current` to `done`. If the planner replaces an EPIC, the orchestrator marks its `current` as `superseded`.

### 5. 3-4 EPICs per planner turn

One planner turn may handle **at most 4 EPICs**. If more EPICs are needed, finish the current turn's EPICs and leave continuation language under `next-action`, such as "Continue emitting EPICs from EP-{N+1} onward". The orchestrator will call the planner again in a later cycle.

### 6. Escalation path

If a downstream producer finds a structural defect that it cannot solve within its authority, the orchestrator rewinds that EPIC's `current` field to `harness-planner` and re-dispatches the planner. The recalled planner reads the escalation note from `.harness/events.md` plus the envelope's `Recent events` and `Existing EPICs`, then emits an **append-only** adjustment to the EPIC list. If replacement, split, merge, or upstream re-wiring is needed, mark the old EPIC as `superseded` and append new numbered EPICs. Completed task/review artifacts inside superseded EPIC folders remain on disk and may be reused as upstream evidence.

## EPIC summary shape (for state.md)

The orchestrator absorbs planner output into `state.md` `## EPIC summaries` as a **heading-based list of short fields with no tables**. One EPIC = one `### EP-N--slug` heading plus four fields: `outcome`, `roster`, `current`, and `note`.

Example:

```
### EP-2--auth-skill-authoring
outcome: Author the skill set for the OAuth login flow.
roster: skill-dev-producer → test-writer-producer.
current: skill-dev-producer.
note: upstream EP-1--domain-agent-design completed. Derived from goal.md:L18 "Login must use a third-party OAuth2 flow."
```

`current` is never numeric. It is either a producer name or a terminal state (`done` or `superseded`). The summary list is ordered by EPIC number ascending.

## Evaluation Criteria

Use these checks when grading planner output or the planning rubric itself:

- Domain evidence appears through codebase file + line-range citations rather than abstract summaries.
- Each EPIC `outcome` is verb-plus-object and objectively completable.
- Each EPIC `why` cites a specific line in the goal markdown.
- `roster` uses only registered pair producer slugs.
- The output is itself the downstream EPIC list, beginning at `EP-1--...`.
- The turn emits 4 EPICs or fewer.
- Any overflow remains in `next-action` as a continuation rather than getting truncated.
- The upstream graph is acyclic and every referenced slug exists.
- If escalation triggered the re-plan, the planner explicitly used the envelope's `Recent events`.
- `current` in EPIC summary examples is a producer name or terminal state, not a numeric phase.
- Re-plan output stays append-only: only new EPICs plus `superseded` marks, never in-place field mutation.
- Planner output contains no task file paths.

## Taboos

- Use a fixed "always 7 EPICs" template. The domain determines the count.
- Use a numeric or hybrid current slug. `current` is a producer name.
- Put pipe tables into `state.md`. EPICs are listed as one heading plus four fields each.
- Insert arbitrary producer slugs that are not registered into the roster.
- Introduce temporary or dual-run state flags. Current phase means current producer, nothing more.
- Emit 5 or more EPICs in one planner turn.
- Use producer transcript or reviewer inner conversation as EPIC evidence. Only disk evidence counts.
- Write EPIC outcomes as task lists or checklists. They must be one-sentence outcomes.
- Split the EPIC list and roster across separate turns. They must be emitted together in one artifact.
- Output an in-place edit to an existing EPIC's `outcome`, `roster`, or `upstream`. Mark it `superseded` and append a new EPIC instead.
- Include task file paths in planner output. The planner returns EPIC summaries only.

## Example (GOOD)

```
EPIC list (this turn: EP-1, EP-2, EP-3):

EP-1--domain-agent-design
- outcome: Define a dedicated auth-gatekeeper agent for the OAuth domain.
- upstream: none.
- why: goal.md:L11 "A dedicated role is needed for third-party OAuth flows."
- roster: agent-dev-producer.

EP-2--auth-skill-authoring
- outcome: Author the skill set referenced by auth-gatekeeper.
- upstream: EP-1--domain-agent-design.
- why: goal.md:L18 "Login must rely on third-party OAuth2."
- roster: skill-dev-producer → test-writer-producer.

EP-3--runtime-wiring
- outcome: Wire auth EPICs into the orchestrator and verify the full pipeline.
- upstream: EP-1--domain-agent-design, EP-2--auth-skill-authoring.
- why: goal.md:L22 "If login fails, retry once and then notify the user."
- roster: wiring-producer.

next-action: "If domain EPICs remain after EP-4, continue emitting them in the next turn."
```
