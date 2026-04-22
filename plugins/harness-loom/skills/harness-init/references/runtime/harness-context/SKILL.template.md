---
name: harness-context
description: "Use whenever a harness subagent is dispatched. Defines the shared boundary for the current turn: which envelope fields are authoritative, what output shape your role must return, and which surfaces you must not write directly. Applies to pair producers, pair reviewers, the planner, and the finalizer. Routing and state transitions remain orchestrator-owned."
user-invocable: false
---

# harness-context

## Design Thinking

This document is written for the currently dispatched subagent. Your agent body defines who you are for this turn; this skill defines the shared runtime boundary: which envelope fields control the turn, what your role must return, and which surfaces you must leave alone. Read it as an execution contract, not as a project overview. The orchestrator decides routing, state updates, and re-dispatch. You decide only the artifact your role is responsible for in this turn.

## Methodology

### 1. Start from this orientation

- You are acting in one of four role types for this turn: a pair producer, a pair reviewer, the planner, or the finalizer. Your agent body defines the concrete role.
- Return content for your role; do not write control-plane files yourself. The orchestrator owns `.harness/cycle/`, and subagents never edit `.harness/loom/`.
- Routing belongs to the orchestrator. Do not decide `Next`, `current`, `loop`, or the next dispatch for yourself.
- Your effective rubric is `agent body + pair skill + harness-context + envelope` for pair roles, `agent body + harness-planning + harness-context + envelope` for the planner, and `agent body + harness-context + envelope` for the finalizer.

### 2. Read the envelope

At dispatch time the orchestrator supplies a role-specific envelope. Use it as the authority for this turn's scope, artifact, and immediate objective. Do not read `state.md` to infer routing for yourself, and do not invent omitted placeholder fields.

- **Common fields** — `Goal`, `User request snapshot`, `Turn intent`, and `Scope`. `Goal` is a compact summary; `User request snapshot` is the full request path; `Turn intent` is what this turn must do now.
- **Pair additions** — `Focus EPIC`, `Task path`, `Prior tasks`, `Prior reviews`, pair `rubric`, and reviewer-only `Axis` when supplied.
- **Planner additions** — `Existing EPICs`, `Recent events`, `Registered roster`, and prior artifacts only when the recall needs them. Planner envelopes do not need a task-path placeholder.
- **Finalizer additions** — `Task path`, `Prior tasks`, and `Prior reviews`. Finalizer envelopes do not need an EPIC placeholder, pair rubric, or reviewer axis.

### 3. If you are a pair producer

- Produce the task artifact by following the pair skill's rubric.
- Your artifact is the content that will be written to `Task path`. Include the role's reduced producer output block (`Status`, `Summary`, `Files created`, `Files modified`, `Diff summary`, `Self-verification`, `Remaining items`) plus any evidence/body required by the pair skill. A paired reviewer decides the verdict; your own `Status` is self-report only.
- Read `User request snapshot` before narrowing the work if it contains constraints beyond `Turn intent`.
- Do not modify files outside `Scope`.
- Task ids and task-file history are orchestrator-owned. Return the artifact content; the orchestrator records it on disk.
- If you detect an upstream contract failure you cannot resolve inside this turn, report it with `## Structural Issue` instead of flattening it into a generic FAIL. The paired reviewer will restate and judge it in the review.

### 4. If you are the reviewer

- Anchor the review on **exactly one** task artifact at `Task path`.
- Apply the pair skill's Evaluation Criteria and return PASS or FAIL.
- If `Axis` is present, focus on criteria tagged for that axis. Untagged shared criteria still apply.
- Use the task artifact and concrete disk evidence from the files it changed or cited. Do not use producer transcript, tool trace, or another reviewer's decision as evidence.
- Use `User request snapshot` and `Prior reviews` as grading context. A producer can fail even when the local task is implemented if it ignores required original-request constraints or unresolved prior-review findings.
- End with the reduced reviewer output block: `Verdict`, `Criteria`, `FAIL items`, and `Feedback`. Put domain-specific regression notes in the body or `Feedback` when useful; do not add advisory routing fields.
- Do not pull FAIL items from another axis into your own verdict. Cross-review synthesis belongs to the orchestrator.

### 5. If you are the planner

- You are a meta-role with no paired reviewer. You do not leave task or review files.
- Follow `harness-planning` for the planner-specific field set, roster rules, and re-plan behavior.
- Prefer `User request snapshot` over the short `Goal` summary when extracting line-cited request evidence.
- The orchestrator owns runtime fields such as `current`, `note`, and `Next`; do not emit them from planner output, and do not include task file paths.

### 6. If you are a finalizer

- You run only in a cycle-end finalizer turn. There is no paired reviewer, and the concrete rubric for the turn lives inside your agent body.
- Your reduced finalizer output block keeps `Status`, `Summary`, `Files created`, `Files modified`, `Self-verification`, and `Remaining items`; an optional `Files left alone (intentionally)` line is allowed only when useful. `Status: PASS | FAIL` plus `Self-verification` is the verdict source. Cite concrete mechanical evidence — file paths, diff summaries, exit codes, coverage tallies — not narrative.
- Read `User request snapshot` when cycle-end work checks request coverage or release readiness.
- Do not request reviewer dispatch and do not emit reviewer-shape fields. Finalizer turns leave 0 review files.
- If an upstream contract is invalid (for example, the cycle claims to have shipped a result with no source evidence), emit the `## Structural Issue` block inside your artifact with `Suspected upstream stage: planner`. The orchestrator will recall the planner rather than redispatching the finalizer in place.

### 7. Structural issue report shape

If you detect an upstream contract failure that cannot be resolved inside your own turn, report it using the shape below.

For a pair turn the reviewer raises the block in the review file, even if the producer noticed the issue first. For a finalizer turn the block lives inside the finalizer artifact. The orchestrator consumes that report and routes the retreat.

```markdown
## Structural Issue

- Suspected upstream stage: {producer name | planner}
- Blocked contract: {what cannot be satisfied}
- Why this role cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream stage should revisit}
```

**Use this when**: (a) an upstream artifact is invalid, (b) the pair contract itself is wrong, (c) an agent-skill mismatch makes downstream work impossible, or (d) a finalizer's cycle-end check fails against the planned outcome.
**Do not use this when**: ordinary rework inside the current role is enough.

### 8. How skills combine in your turn

Assume only the skills explicitly attached to your role plus the dispatch envelope. Do not rely on hidden side references or unstated runtime context being present. `harness-context` defines shared runtime boundaries; domain-specific rubric belongs to the pair skill (pair roles), `harness-planning` (planner), or the finalizer agent body.

## Evaluation Criteria

- Your output follows the correct role-specific return shape for pair producer, pair reviewer, planner, or finalizer.
- You actually use the envelope fields `Goal`, `Turn intent`, `Scope`, and `Task path` when your role has one.
- When supplied, `User request snapshot` is read or explicitly judged irrelevant to the current narrow task.
- You do not modify anything outside `Scope`.
- Your output contains no control-plane fields such as `Next`, `current`, or `loop`.
- Reviewer evidence stays anchored to one task artifact.
- Structural issues are reported only with the required shape, with no self-directed upstream dispatching.
- Planner output contains no task file paths and no instruction to mutate existing EPIC fields in place.
- Finalizer output contains `Status` plus mechanical `Self-verification` evidence, and never requests reviewer dispatch.

## Taboos

- Write directly under `.harness/cycle/` or `.harness/loom/`; return content only.
- Modify files outside the envelope scope.
- Replace orchestrator routing by emitting `Next`, `current`, or `loop` in your output.
- Add advisory or escalation routing fields; use `Remaining items`, `Feedback`, or `## Structural Issue` according to role.
- Treat `Turn intent` as permission to ignore the full user request snapshot.
- Use producer transcript or tool trace as reviewer evidence.
- Try to manage task ids or on-disk history yourself.
- Flatten a structural issue into a generic FAIL and force endless same-pair rework.
- Include task file paths or in-place EPIC mutations in planner output.
