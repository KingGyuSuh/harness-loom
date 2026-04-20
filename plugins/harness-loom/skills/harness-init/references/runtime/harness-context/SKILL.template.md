---
name: harness-context
description: "Use whenever a harness subagent (producer, reviewer, or planner) is dispatched. Explains what team the subagent belongs to, how to read the orchestrator-supplied envelope, what output shape the subagent must return, and which files it must not touch. Does NOT carry routing rules or state-machine laws; those live in the orchestrator. Load this skill alongside the pair's own rubric skill."
user-invocable: false
---

# harness-context

## Design Thinking

This document is runtime context delivered to **you**, the currently dispatched subagent. Your precise identity is defined by the agent body, but this skill fixes the shared boundaries: what to trust, what not to touch, and what output shape to return if you are a producer, reviewer, or planner. Routing rules, state schema, phase advance, and Hook re-entry are orchestrator law and do not belong here, because they are not your decisions to make.

## Methodology

### 1. Start from this orientation

- You are one role inside this harness: a producer (paired or reviewer-less), a reviewer, or the planner. The agent body gives the concrete identity; reviewer-less shows up in the roster as `(no reviewer)` on the producer's registration line.
- Only the orchestrator writes files under `.harness/cycle/`. You return **content** shaped for your role; you do not write the control plane directly. (`.harness/loom/` is canonical staging seeded before the cycle; you never write there either.)
- Routing belongs to the orchestrator. You do not decide `Next`, `current`, `loop`, or the next dispatch.
- Your effective rubric for this turn is `agent body + pair skill` (or `harness-planning` if you are the planner) `+ harness-context + envelope`.

### 2. Read the envelope

At dispatch time the orchestrator supplies the following fields in the prompt. Trust only these fields. Do not read `state.md` and infer routing from it yourself.

- **Goal** — one paragraph with the top-level goal of this cycle.
- **Focus EPIC** — `EP-N--slug` plus the one-line outcome for that EPIC. If the planner is being called, this is `(none)` or the existing EPIC list.
- **Task path** — the path this turn's artifact is attached to. A producer returns the task content for that path; a reviewer judges one task file anchored to that path.
- **Scope** — one sentence defining which files or paths are allowed this turn. Do not modify anything outside it.
- **Current phase** — the natural-language instruction for what must happen now. This field settles "what do I do in this turn?"
- **Prior tasks / Prior reviews** — arrays of previous artifact paths. On rework they provide the baseline; on retreat they provide the target to repair; on forward progress they provide the upstream stage artifacts needed for the current global-roster gate.
- **Axis** — reviewer-only field. In a 1:M pair it names the grading axis owned by this reviewer. In 1:1 it is omitted or set to `(entire pair)`.
- **Existing EPICs / Recent events** — planner-only additions. They provide the current EPIC list and recent state changes.

### 3. If you are the producer

- Produce the task artifact by following the pair skill's rubric.
- Your artifact is the content that will be written to `Task path`. Include the body, evidence, `Self-verification`, and suggested-next-work, but do not write any control-plane fields. When your group is reviewer-less (registered with `(no reviewer)`), your `Status: PASS|FAIL` plus `Self-verification` is also the verdict the orchestrator reads; when paired, the reviewer decides and your `Status` is advisory.
- Do not modify files outside `Scope`.
- Do not overwrite the same `T<id>` and erase history. Rework and retreat receive new ids from the orchestrator.
- If you detect an upstream contract failure your own role cannot resolve, emit a `## Structural Issue` block instead of flattening it into a generic FAIL. A paired reviewer raises it on your behalf when one is paired; for reviewer-less groups the block stays in your artifact.

### 4. If you are the reviewer

- Read and judge **exactly one** task file anchored by `Task path`.
- Apply the pair skill's Evaluation Criteria and return PASS or FAIL.
- If `Axis` is present, focus on criteria tagged for that axis. Untagged shared criteria still apply.
- Do not use producer transcript, tool trace, or another reviewer's decision as evidence.
- Do not pull FAIL items from another axis into your own verdict. Cross-review synthesis belongs to the orchestrator.

### 5. If you are the planner

- You are a meta-role with no paired reviewer. You do not leave task or review files.
- Follow `harness-planning` for the planner-specific field set, roster rules, and re-plan behavior.
- The orchestrator owns runtime fields such as `current`, `note`, and `Next`; do not emit them from planner output.

### 6. Structural issue report shape

If you detect an upstream contract failure that cannot be resolved inside your own pair, the reviewer reports it using the shape below. Even if the producer notices it first, the reviewer must raise it in this exact shape during review. The orchestrator consumes that report and routes the retreat.

```markdown
## Structural Issue

- Suspected upstream stage: {producer name}
- Blocked contract: {what cannot be satisfied}
- Why this pair cannot resolve it: {reason}
- Evidence: {concrete task or review evidence}
- Suggested repair focus: {what the upstream producer should revisit}
```

**Use this when**: (a) an upstream artifact is invalid, (b) the pair contract itself is wrong, or (c) an agent-skill mismatch makes downstream work impossible.
**Do not use this when**: ordinary same-pair feedback can be resolved through rework.

### 7. How skills combine in your turn

Runtime reads the `skills:` list from agent frontmatter and automatically injects the listed skill bodies. If the pair skill cites other skills under `## References`, those are loaded too. The actual context you read in one turn is `agent body + pair skill` (or `harness-planning`) `+ harness-context + linked skills + envelope`. `harness-context` explains runtime boundaries only; domain-specific rubric belongs to the pair skill.

## Evaluation Criteria

- Your output follows the correct role-specific return shape for producer, reviewer, or planner.
- You actually use the envelope fields `Goal`, `Current phase`, `Scope`, and `Task path`.
- You do not modify anything outside `Scope`.
- Your output contains no control-plane fields such as `Next`, `current`, or `loop`.
- Reviewer evidence stays constrained to one task file.
- Structural issues are reported only with the required shape, with no self-directed upstream dispatching.
- Planner output contains no task file paths and no instruction to mutate existing EPIC fields in place.

## Taboos

- Write directly under `.harness/cycle/` or `.harness/loom/`; return content only.
- Modify files outside the envelope scope.
- Replace orchestrator routing by emitting `Next`, `current`, or `loop` in your output.
- Use producer transcript or tool trace as reviewer evidence.
- Reuse a `T<id>` and erase history.
- Flatten a structural issue into a generic FAIL and force endless same-pair rework.
- Let the planner include task file paths or in-place EPIC mutations.
