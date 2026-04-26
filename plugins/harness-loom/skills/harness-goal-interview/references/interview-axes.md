# Interview axes

Structured prompts for each axis of the goal interview. Use these as starting points; adapt the phrasing to the conversation. Stop an axis as soon as the user gives a citable answer — do not keep asking for polish.

The axes below are ordered by typical dependency. Earlier answers often make later axes faster or unnecessary.

## 1. Topic and motivation

**Goal:** surface the concrete trigger, not a generic ambition.

Starter prompts:
- "What do you want this cycle to accomplish?"
- "What happened recently that made this feel worth doing now?"
- "Who or what is currently blocked or frustrated?"

Push back when the answer is:
- a generic verb phrase ("improve X", "clean up Y") → ask for the specific pain or complaint behind it
- a solution in disguise ("rewrite the auth layer") → ask what problem the rewrite solves
- a future-proofing story with no present pain → name it explicitly and confirm the user still wants to proceed

## 2. Users and consumers

**Goal:** identify who benefits and what they currently experience.

Starter prompts:
- "Who is going to notice this change? End users, developers on this team, an external integrator, an on-call rotation?"
- "What does their current workflow look like? Where does it hurt?"

Skip this axis when the answer is trivially "the developer working in this repo" and nothing else. Do not pad the goal file with imagined stakeholders.

## 3. Expected behavior or outcome

**Goal:** elicit the externally visible change in user-observable verbs.

Starter prompts:
- "When this cycle finishes, what is someone doing that they couldn't do before?"
- "What artifact, endpoint, or behavior exists after the cycle that doesn't exist now?"

Push back when the answer is:
- implementation-flavored ("we'll add a service that...") → ask what the service lets the user *do*
- aspirational ("make it faster") → ask for the threshold or observable signal
- framed as work rather than outcome ("write tests for X") → ask what those tests prove to the consumer

## 4. Boundaries: constraints and non-goals

**Goal:** surface hard rules the cycle must honor and work it must not drift into.

Starter prompts (constraints):
- "Are there compatibility, performance, cost, or compliance requirements I should bake in?"
- "Is there a deadline or external event tied to this?"
- "Any platform, library, or integration that must keep working untouched?"

Starter prompts (non-goals):
- "What are we explicitly *not* doing this cycle?"
- "Is there adjacent work you considered and chose to defer?"
- "Where could the planner wander that you want to rule out now?"

Non-goals are almost always under-supplied. Probe at least twice before moving on. If the user declines to name any, record that decision explicitly rather than leaving the section empty.

**Probe for genuine non-goals, not for narrowing the user's stated scope.** A non-goal is something the user has *deliberately excluded* (out of frame, out of timing, out of authority). It is not "everything that would make the cycle feel smaller." If the user names a multi-surface goal, the breadth itself is not a non-goal — the planner decomposes breadth into EPICs. Push back on scope only when (a) the surfaces share no motivation, (b) the user explicitly signals a smaller goal, or (c) a hard external constraint forces narrowing (deadline, freeze, capacity). "This feels like a lot" is a planner cost concern, not an interview filter; treat it as evidence the planner will need a strong decomposition, not as a reason to drop surfaces from the goal file.

## 5. User-side technical decisions

**Goal:** resolve choices only the user can make, before the planner has to guess.

A user-side decision has these properties:
- multiple viable options exist and repo evidence alone cannot pick between them
- the choice changes the shape of the outcome, not just the implementation route
- reversing it later would cost a significant re-do

Typical surfaces:
- **build vs. integrate** (write it ourselves vs. adopt an existing tool or service)
- **sync vs. async**, **push vs. pull**, **server-side vs. client-side** when both are viable
- **strict vs. permissive** (reject edge cases vs. tolerate them)
- **scope depth** — *only when* an external constraint genuinely forces a slice (deadline, capacity, dependency on a still-unresolved upstream). Cycle breadth itself is the user's intent, not a trade-off — when the user has named a wider scope, do not present "MVP slice vs. full coverage" as a surface. The planner is responsible for decomposing breadth into EPICs.
- **coupling** (shared module vs. duplicated per-consumer)

Frame each surface as a short choice with named options and one-line trade-offs. Do **not** invent decision surfaces to look thorough. If no genuine user-side axis exists, skip this entirely.

Anti-patterns — do not ask:
- "Should this live in `src/lib/` or `src/utils/`?" (planner's call from repo convention)
- "Use library A or library B?" when the repo already standardizes on one
- "What should the function be called?"
- "Which tests should we write?"

## 6. Completion signals

**Goal:** name the observable signals that prove the cycle is done.

Starter prompts:
- "How will you know this cycle is done — what will you check or demonstrate?"
- "Is there a metric, threshold, or user demo that has to work?"
- "What artifact must exist at the end?"

Prefer observable signals. Reject or rewrite:
- "PR merged" → implied by the harness finishing; strip it
- "all tests green" → implied; strip it unless a specific suite or new coverage is a completion gate
- "finalizer passes" → implied
- "code looks clean" → subjective; rewrite as the underlying behavior being clean

Good signals:
- "A user can perform <action> in the deployed environment."
- "The `<name>` dashboard panel shows <metric> within <threshold> under load test <scenario>."
- "Running `<command>` against <input> produces <output>."
- "Before/after comparison on <dataset> shows <specific change>."

## Flow control

- Ask one axis per turn unless several are tightly coupled.
- Summarize captured answers back to the user at natural stopping points, especially before axis 5 and axis 6, so the user can correct early misunderstandings cheaply.
- When enough material exists to write all five output sections honestly, stop interviewing even if there are axes you did not touch. Over-interviewing costs user trust and does not improve EPIC quality.
