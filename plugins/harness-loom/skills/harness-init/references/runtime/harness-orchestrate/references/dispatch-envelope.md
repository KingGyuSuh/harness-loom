# Dispatch envelope

Quick reference for the runtime payload the orchestrator sends to subagents. This file is a supporting reference; the canonical orchestrator law stays in `../SKILL.template.md`, and the subagent-side read contract stays in `../../harness-context/SKILL.template.md`.

## Common fields

Every executable turn receives these fields:

- `Goal` — the compact `Goal (from X):` summary from `state.md`; this is a cycle-level quality bar, not the full original request
- `User request snapshot` — the cycle-local full original request path, normally `.harness/cycle/user-request-snapshot.md`; planner, pair producers/reviewers, and the finalizer read it for original request detail
- `Turn intent` — the subagent-facing copy of `Next.Intent`
- `Scope` — one sentence defining writable surfaces for the turn

Omit placeholder fields that do not apply to the role. The state `## Next` block may still carry `Task path: (none)` or `EPIC: (none)` for orchestrator bookkeeping; those placeholders do not need to be forwarded to subagents.

## Pair envelope

Pair producers and reviewers receive:

- all common fields
- `Focus EPIC` — the selected `EP-N--slug` plus one-line outcome/note context
- `Task path` — copied from `Next.Task path`
- `Prior tasks` — prior task artifact paths attached for rework, retreat, or upstream evidence
- `Prior reviews` — prior review artifact paths attached for rework, retreat, or upstream evidence
- `rubric: skills/<slug>/SKILL.md`
- reviewer-only `Axis` when the pair is 1:M
- `User request snapshot` is read-only request evidence. It does not authorize routing or state mutation, but reviewers may fail work that ignores required original-request constraints.

The orchestrator resolves the reviewer set from `.harness/loom/registry.md`.

## Planner envelope

The planner receives:

- all common fields
- `Existing EPICs` — the full `## EPIC summaries` block from `state.md`
- `Recent events` — the last five lines of `events.md`
- `Registered roster` — the full `## Registered pairs` block from `.harness/loom/registry.md`
- `Prior tasks` / `Prior reviews` only on structural recall, finalizer recall, or another recall where prior artifacts are evidence

Planner envelopes do not include `Task path: (none)` or `Focus EPIC: (none)` placeholders. Planner turns never write task or review files. On initial planning, `User request snapshot` is the best source for line-cited request evidence.

## Finalizer envelope

The finalizer receives:

- all common fields
- `Task path` — copied from `Next.Task path`
- `Prior tasks` — completed task artifacts available for cycle-end work
- `Prior reviews` — completed review artifacts available for cycle-end work

Finalizer envelopes do not include `Focus EPIC: (none)`, a pair rubric line, or reviewer-only `Axis`.

Its verdict is read from the finalizer artifact's `Status` plus `Self-verification`.
