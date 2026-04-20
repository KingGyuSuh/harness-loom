---
name: harness-doc-keeper
description: "Use when authoring or grading the `harness-doc-keeper-producer`'s cycle-end documentation refresh. Defines how to derive durable module docs from this project's current filesystem and source files, how to keep `.harness/docs/<module>.md` anchored to source at `file:line`, and how to rewrite only the `## Modules` block in `CLAUDE.md` / `AGENTS.md`. Invoke whenever the orchestrator's halt-prep step dispatches the doc-keeper, or whenever its self-verified output is audited."
user-invocable: false
---

# harness-doc-keeper

## Design Thinking

The doc-keeper turns one cycle's ephemeral task and review artifacts into durable project documentation. Its job is not to narrate the cycle; it is to leave this project with a readable snapshot of what the codebase currently contains. Because this skill runs in many different kinds of projects, it must derive modules from the current codebase's own filesystem and source files rather than from hardcoded harness-shaped vocabulary.

This producer is reviewer-less because the work is mostly mechanical: inspect this project's current structure, refresh `.harness/docs/<module>.md`, and replace only the `## Modules` block in `CLAUDE.md` / `AGENTS.md`. The output is still graded, but it is graded from the producer's own `Status` and `Self-verification` evidence, so the work remains `not subject to review`, never "passed without review".

## Methodology

### 1. Derive modules from this project's current shape

Start from what exists on disk now.

- Inspect the project root and its primary manifests or entry files.
- Ignore generated, vendored, cache, and runtime-owned directories such as `.git`, build outputs, `node_modules`, and `.harness/`.
- Prefer stable project nouns that match how the codebase already decomposes itself: package names, workspace names, service directories, app directories, library directories, or other clear top-level ownership boundaries.
- Split a broad area one level deeper only when that makes the docs easier to navigate. Keep the structure shallow when the codebase is still small.
- Keep existing `.harness/docs/<module>.md` files only when they still describe something real or when they must be retained temporarily to avoid dropping useful context during an in-flight refactor.

The goal is a module set that matches this project's current codebase, not a perfect universal taxonomy. When two plausible decompositions exist, choose the one that would help a future maintainer find code faster.

### 2. Write concise module docs anchored to source

Each `.harness/docs/<module>.md` file should be a compact orientation document.

- Use one `# <Module>` heading.
- Open with a short summary of what the module owns.
- Organize the rest into a few `##` sections for the module's real concerns, interfaces, or subsystems.
- Anchor the summary and every `##` section to source at `file:line`.
- Mention cycle artifacts only as optional "recent work" context after the source-anchored explanation; they are never the primary evidence.
- Keep each file concise. If a module becomes crowded, split the material into clearer sibling docs instead of stretching one file into an unreadable dump.

These files are project documentation. Do not turn them into methodology guides, audit logs, or explanations of harness internals.

### 3. Rewrite only the `## Modules` block in pointer docs

`CLAUDE.md` and `AGENTS.md` are pointer documents. The doc-keeper owns only their `## Modules` block.

- If a file does not exist, create a minimal pointer document with a short prelude and a `## Modules` section.
- If a file exists and already contains `## Modules`, replace only that block.
- If a file exists without `## Modules`, append a new `## Modules` block at the end.
- Preserve every other section as-is. Do not rewrite titles, intros, platform notes, or other hand-authored sections.

The block itself should stay lightweight: one link per module plus a one-line purpose summary.

### 4. Reviewer-less verdict path

The producer emits `Status: PASS|FAIL` and a `Self-verification` block. That is the verdict source for this turn. No reviewer is dispatched, no review file is written, and the registration line keeps the `(no reviewer)` marker. Structural defects still use the shared `## Structural Issue` block.

## Evaluation Criteria

- Module boundaries come from the project's current on-disk structure and source files, not from hardcoded harness-shaped vocabulary or a universal taxonomy.
- Every `.harness/docs/<module>.md` file is anchored to source at `file:line` in the summary and in each `##` section.
- Cycle artifacts, if mentioned, are supplementary context rather than the primary evidence.
- Module docs stay concise and navigable; crowded material is split instead of accumulated into one oversized file.
- `CLAUDE.md` and `AGENTS.md` are modified only inside the `## Modules` block.
- The `## Modules` block stays a pointer surface rather than a second copy of methodology or review history.
- The producer response ends with `Status: PASS|FAIL` and `Self-verification` that makes coverage and update scope auditable.
- Structural defects are surfaced with the shared `## Structural Issue` block instead of being flattened into a generic FAIL.

## Taboos

- Invent module names from generic intuition instead of reading the project's actual structure.
- Hardcode harness-shaped vocabulary such as `skills`, `agents`, or `plugins` as if every codebase this skill runs in had the harness's own shape.
- Cite only `.harness/cycle/` artifacts as evidence while skipping the project source itself.
- Rewrite `CLAUDE.md` or `AGENTS.md` wholesale instead of limiting edits to `## Modules`.
- Fill module docs with methodology, workflow rules, or harness background that belongs elsewhere.
- Keep stale module docs indefinitely when they no longer describe anything real and no longer help navigation.
- Create generic filenames such as `notes`, `misc`, or `details` that do not map back to real ownership boundaries.
- Reframe reviewer-less work as "passed without review" rather than `not subject to review`.

## References

- `../harness-orchestrate/SKILL.md` — cycle halt behavior and reviewer-less verdict handling
- `../harness-context/SKILL.md` — envelope reading, output shape, and structural-issue reporting
