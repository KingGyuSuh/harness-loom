---
name: oversized-split
description: "Use when deciding whether a canonical `SKILL.md` body has grown past the split thresholds and how to move the overflow into `references/`. Invoke whenever a producer drafts a split or a reviewer grades whether a large skill body should remain one file or fan out into kebab-named references."
user-invocable: false
---

# Oversized SKILL.md Split Spec

This file is the authoritative spec for deciding **when** a canonical `SKILL.md` must be split and **how** that split must be carried out once references become necessary. Producers and reviewers read it as the shared basis for split decisions. `skill-authoring.md` §3 cites this file as canonical.

## 1. Split trigger thresholds

If **any one** of the following three quantitative thresholds is true, that `SKILL.md` is a split candidate. The producer should propose the split in the same pair turn and cite this spec. If multiple conditions are true at once, move the largest block into references first.

- **>= 300 lines** — if the canonical `SKILL.md` body exceeds 300 lines, it must be split. Claude plugin best practice treats `SKILL.md` as "on-trigger context loaded only when needed"; once it goes beyond 300 lines, both producer and reviewer start losing the thread and rereading the same sections. This protects the lower bound of a body that can still be read at a glance. The authoring rubric also uses 200 lines as a separate soft-cap control line (see `skill-authoring.md` §3); 200 is the "should split" signal, 300 is this hard ceiling.
- **>= 3 authority-citation blocks** — if one file contains three or more contract-defining blocks such as "State.md Contract", "Pair/Cycle Law", or "Ledger-Driven Routing Synthesis" that upstream docs cite by line range, move those blocks into references. Authority blocks are external anchors; crowding them into one file means editing one contract can shift unrelated line ranges. This threshold protects line-range stability.
- **>= 2 example blocks** — if one `SKILL.md` contains two or more GOOD/BAD pairs, templates, or long concrete samples, move the examples into references. Examples are supporting material, so the more they accumulate in the main body, the weaker the "why" signal becomes. This threshold protects an insight-first main body.

## 2. `references/` directory naming convention

Only the pattern `references/{kebab-topic}.md` is allowed. `{kebab-topic}` is the name of **one contract or one pattern** owned by that file.

- Allowed: `references/state-md-contract.md`, `references/pair-cycle-law.md`, `references/ledger-routing.md`, `references/scripted-bootstrap.md`
- Forbidden: `references/notes.md`, `references/details.md`, `references/misc.md`, `references/extra.md` (too generic), `references/v2.md`, `references/state-md-contract-v2.md` (version suffixes), `references/state_md_contract.md` (snake_case)

One file owns one topic only. If one file starts owning multiple contracts, it re-enters the `>= 3 authority-citation blocks` threshold from §1.

## 3. Cross-file citation format

When a `SKILL.md` body points to material moved into references, the citation shape is fixed:

- Within the same skill: `references/{kebab-topic}.md:{line-range}` such as `references/oversized-split.md:12-40`
- Into another skill's references: `../{skill-name}/references/{kebab-topic}.md:{line-range}` such as `../api-design/references/rest-conventions.md:18-44`
- Repo-root anchored absolute paths are allowed only in top-level docs such as `CLAUDE.md` and `AGENTS.md`. `SKILL.md` files and reference files must use **relative paths** only, because absolute repo anchors are brittle under repo moves and sync trees.

Line ranges must resolve against files actually read from disk in the current turn. A producer must not cite line ranges from a file it did not read.

## 4. What stays in `SKILL.md`

Do **not** move these out into references:

- **Design Thinking** — the insight for "what good looks like" must remain in the body. If it moves out, the "why" becomes detached from the trigger and the model loses rationale immediately after load.
- **Methodology skeleton** — step names and one-to-two line navigation stay in the body. If a single step contains 300 lines of contract prose, keep a summary plus link in the body and move the full contract into references.
- **Evaluation Criteria** — the reviewer needs the grading checklist in the main body. If it is hidden in references, the skill can no longer be graded from the isolated loaded context.
- **Taboos** — "why this must not happen" is still part of insight and must remain in the main body.
- **Description frontmatter** — it is a load-bearing trigger contract and cannot be split away from the body.

References are for full contract prose, templates, and example collections. They are not for the skill's why or grading rubric.

## 5. Quality-preservation invariants

Immediately after a split, all four conditions below must be true **at the same time**. If any one breaks, the reviewer must fail the phase.

1. **No information loss** — compared to the pre-split body, no information disappears. Proof may be a byte-level `diff` match, or if text was rearranged/recombined, the reviewer must explicitly justify semantic equivalence in the verdict.
2. **Every citation resolves on disk** — every `references/...:{line-range}` citation inside `SKILL.md` points to a real file and a real range of lines. Broken citations break the discovery path.
3. **Individually browsable** — each reference file still reads coherently when opened without the main `SKILL.md`. The first one or two paragraphs must explain what contract it owns and who reads it and why.
4. **Readability hard floor** — no reference file exceeds 300 lines. This is the recursive application of trigger 1 from §1; if it breaks, that reference file itself becomes a new split candidate.

## 6. Coexistence with existing `references/`

When split work lands next to existing sibling reference assets, follow these rules:

- Do not rename, rearrange, or absorb existing files.
- If the new topic partially overlaps an existing file, the new file owns only net-new material and cites the existing file using `references/{existing-topic}.md:{line-range}`.
- Do not create content duplication across reference files inside the same skill. Duplication makes it unclear which file a reviewer should treat as the grading basis.

## 7. Non-goals

This spec does **not** define:

- **Platform sync contracts** — how references are deployed into `.claude/skills/`, `.codex/skills/`, or `.gemini/skills/` belongs to the runtime-control layer (orchestrator + sync script). This spec governs only split decisions for skill-file bodies.
- **Agent-file split policy** — agent files follow a different size cap and are covered by `agent-authoring.md`.
- **Automatic split tooling** — this spec fixes the judgment criteria for a manual producer-reviewer split workflow. Scripted auto-splitting is a separate concern.
