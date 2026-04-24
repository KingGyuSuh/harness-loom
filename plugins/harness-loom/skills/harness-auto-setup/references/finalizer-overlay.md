---
name: auto-setup-finalizer-overlay
description: "Use when `/harness-auto-setup --migration` refreshes a customized singleton `harness-finalizer` from snapshot evidence while preserving compatible user-authored cycle-end guidance."
user-invocable: false
---

# Finalizer Overlay

This reference owns migration preservation rules for the singleton `harness-finalizer`. Pair overlay remains owned by `harness-pair-dev/references/authoring/from-overlay.md`; the finalizer is not a pair and has no reviewer or pair skill.

## Methodology

1. Start from the current `harness-finalizer.template.md` contract.
2. Preserve compatible source intro text, `## Principles`, `## Task`, and custom H2 sections as user intent.
3. Refresh contract-owned frontmatter: `name: harness-finalizer`, `skills: [harness-context]`, and any preserved `model`.
4. Replace stale `## Output Format` content with the current finalizer Output Format contract.
5. Preserve no old reviewer-style fields such as `Verdict`, `Criteria`, or `FAIL items`.
6. Keep the Structural Issue contract current so finalizer FAIL/RETREAT routes back to the planner.

## Evaluation Criteria

- User-authored finalizer duties survive when they do not conflict with the current runtime contract.
- Frontmatter and Output Format always match the current finalizer contract.
- Custom H2 sections are not dropped silently.
- Snapshot text is treated as migration evidence, not as a second source of truth.

## Taboos

- Do not register the finalizer as a pair.
- Do not add a reviewer to finalizer work.
- Do not blind-copy the snapshot finalizer over the current skeleton.
- Do not preserve stale Output Format or reviewer verdict fields.
