---
name: {{PAIR_SLUG}}-reviewer
description: "Use when the target's `/harness-orchestrate` dispatches the `{{PAIR_SLUG}}` reviewer phase. Grades the paired producer's task against the shared skill rubric. Returns Reviewer-shape Output Format with PASS/FAIL verdict and evidence-cited criteria."
skills:
  - {{SKILL_SLUG}}
  - harness-context
  # 이하 optional — 이 reviewer 만 참조할 부가 도메인 skill 을 필요하면 append
  # - {{EXTRA_SKILL_SLUG}}
model: opus
---

# {{REVIEWER_ROLE_NAME}}

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
Verdict: PASS / FAIL
Criteria: [{criterion, result, evidence-citation (file:line)}]
FAIL items: [{item, level (technical/creative/structural), reason}]
Regression gate: {clean / regression / N/A, details}
Feedback: {short free-form rationale}
Advisory-next: "{advisory suggestion, orchestrator synthesizes actual Next-action}"
```
