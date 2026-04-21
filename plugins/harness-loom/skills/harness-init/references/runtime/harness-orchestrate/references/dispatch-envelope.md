# Dispatch envelope

Quick reference for the runtime payload the orchestrator sends to subagents. This file is a supporting reference; the canonical orchestrator law stays in `../SKILL.template.md`, and the subagent-side read contract stays in `../../harness-context/SKILL.template.md`.

## Shared fields

Every turn receives these fields:

- `Goal` — the `Goal (from X):` paragraph from `state.md`
- `Focus EPIC` — the selected `EP-N--slug` plus one-line outcome, or `(none)` / existing EPIC list for planner turns
- `Task path` — copied from `Next.Task path`; planner turns use `(none)`
- `Scope` — one sentence defining writable surfaces for the turn
- `Current phase` — copied from `Next.Intent`
- `Prior tasks` — prior task artifact paths attached for context
- `Prior reviews` — prior review artifact paths attached for context

## Pair envelope

Pair producers and reviewers receive:

- all shared fields
- `rubric: skills/<slug>/SKILL.md`
- reviewer-only `Axis` when the pair is 1:M

The orchestrator resolves the reviewer set from `.harness/loom/registry.md`.

## Planner envelope

The planner receives:

- all shared fields, with `Focus EPIC: (none)` when dispatch is not EPIC-local
- `Existing EPICs` — the full `## EPIC summaries` block from `state.md`
- `Recent events` — the last five lines of `events.md`
- `Registered roster` — the full `## Registered pairs` block from `.harness/loom/registry.md`

Planner turns never receive a task artifact path and never write task or review files.

## Finalizer envelope

The finalizer receives:

- all shared fields
- no reviewer-only fields
- no pair rubric line

Its verdict is read from the finalizer artifact's `Status` plus `Self-verification`.
