---
name: {{PAIR_SLUG}}-producer
description: "Use when the target's `/harness-orchestrate` dispatches the `{{PAIR_SLUG}}` producer phase. Produces the task specified in the pair's shared skill rubric. Returns Producer-shape Output Format for paired reviewer to judge."
skills:
  - {{SKILL_SLUG}}
  - harness-context
  # 이하 optional — 이 producer 만 참조할 부가 도메인 skill 을 필요하면 append
  # - {{EXTRA_SKILL_SLUG}}
model: opus
---

# {{PRODUCER_ROLE_NAME}}

{{IDENTITY_PARAGRAPH}}

## Principles

1. {{PRINCIPLE_1}}
2. {{PRINCIPLE_2}}
3. {{PRINCIPLE_3}}
4. {{PRINCIPLE_4}}
5. {{PRINCIPLE_5}}

## Task

{{TASK_STEPS}}

## Output Format

End your response with this structured block:

```
Status: PASS / FAIL
Summary: {what was produced in one line}
Files created: [{file path}]
Files modified: [{file path}]
Diff summary: {sections changed vs baseline, or "N/A"}
Self-verification: {issues found and resolved during this cycle}
Suggested next-work: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
Remaining items: [{items not yet done}]
Escalation: {none | structural-retreat-to-<stage>, reason}
```
