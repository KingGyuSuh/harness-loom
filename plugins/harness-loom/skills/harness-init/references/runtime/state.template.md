# Runtime State

Goal (from {{GOAL_SOURCE}}): {{GOAL_BODY}}
Phase: planner
loop: false
planner-continuation: none

## Next
To: planner
EPIC: (none)
Task path: (none)
Intent: Read the user request snapshot, emit an initial EPIC batch, and provide the applicable global-roster slice for each EPIC.
Prior tasks:
Prior reviews:

## EPIC summaries

There are no EPICs yet. After the first planner turn emits the EPIC list, the orchestrator appends entries to this block in the form **one EPIC = one heading + five fields**. Do not use tables or row-based formatting.

Example:

### EP-1--<kebab-outcome>
outcome: <one-sentence completion condition>.
upstream: <EP-M--slug, ...> | none.
roster: <producer1> → <producer3> → <producer5>.
current: <producer-slug | done | superseded>.
note: <brief progress summary, blocker, or evidence citation such as .harness/cycle/user-request-snapshot.md:Lxx or a quoted goal phrase>.
