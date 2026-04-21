# Registry

Runtime dispatch registry for this target. This file is the **sole source of truth** for the pair roster. The orchestrator reads it at turn start, and pair authoring updates it when the roster changes. It lives at loom root because it is not owned by any single skill.

- `## Registered pairs` contains only executable pair stages, always with at least one reviewer (1:1 or 1:M).
- Pair line shape: `` - <pair>: producer `<p>` ↔ reviewer `<r>`, skill `<s>` `` (1:1) or `` - <pair>: producer `<p>` ↔ reviewers [`<r1>`, `<r2>`], skill `<s>` `` (1:M).
- The planner and the finalizer are singleton runtime roles, not list entries. Their agents live at `.harness/loom/agents/harness-planner.md` and `.harness/loom/agents/harness-finalizer.md`. Cycle-end duties belong inside the finalizer body, not as extra registry entries.
- Runtime law — state-machine transitions, turn rhythm, phase advance, envelope contract — lives in `.harness/loom/skills/harness-orchestrate/SKILL.md`.

See that SKILL's § Registry contract and § One-turn algorithm for how this registry is consumed.

## Registered pairs
