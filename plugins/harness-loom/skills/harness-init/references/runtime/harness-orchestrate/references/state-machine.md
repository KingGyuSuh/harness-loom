# Runtime DFA

Quick orientation for `harness-orchestrate`. This file is a scan-first aid only; the canonical law still lives in `../SKILL.template.md`.

## States

- `Planner` — decompose or re-plan EPICs; leaves no task or review files
- `Pair` — run one producer plus one or more reviewers for the selected EPIC stage
- `Finalizer` — run the cycle-end singleton turn
- `Halt` — no `Next`; `loop: false`

## Diagram

```text
Cold start / goal reset -> Planner

Planner   -> Pair       (ready set non-empty)
Planner   -> Planner    (planner recall)
Planner   -> Finalizer  (all live EPICs terminal + `planner-continuation: none`)
Planner   -> Halt       (blocked halt)

Pair      -> Pair       (rework / rewind / next ready stage)
Pair      -> Planner    (planner recall)
Pair      -> Finalizer  (all live EPICs terminal + `planner-continuation: none`)

Finalizer -> Planner    (FAIL / RETREAT)
Finalizer -> Halt       (PASS)
```

## Transition table

| From | Condition | To |
| --- | --- | --- |
| `Planner` | ready set non-empty | `Pair` |
| `Planner` | planner recall needed (`ready set empty` with live EPICs, or terminal continuation recall) | `Planner` |
| `Planner` | blocked halt (`Additional pairs required` only, or unrecoverable finalizer-driven zero-emit recall) | `Halt` |
| `Planner` | all live EPICs terminal + `planner-continuation: none` | `Finalizer` |
| `Pair` | another pair turn (`FAIL` rework, structural rewind to producer, or PASS to the next ready stage) | `Pair` |
| `Pair` | planner recall (`structural retreat to planner`, `ready set empty` with live EPICs, or terminal continuation recall) | `Planner` |
| `Pair` | all live EPICs terminal + `planner-continuation: none` | `Finalizer` |
| `Finalizer` | PASS | `Halt` |
| `Finalizer` | FAIL or RETREAT | `Planner` |

## Notes

- This table is intentionally compressed by destination state. The canonical orchestrator law in `../SKILL.template.md` keeps the subcases separate where they affect `Intent`, `Prior`, or blocked-halt behavior.
- `upstream` is a same-stage gate, not a whole-EPIC completion gate.
- `Phase` always echoes `Next.To`.
- Planner turns always use `Task path: (none)`.
- Finalizer turns always use `.harness/cycle/finalizer/tasks/T{id}--cycle-end.md`.
