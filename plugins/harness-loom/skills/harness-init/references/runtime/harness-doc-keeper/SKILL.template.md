---
name: harness-doc-keeper
description: "Use when authoring or grading the `harness-doc-keeper-producer`'s cycle-end documentation pass. Defines how to analyze the project (code + goal + cycle history), design the minimum useful documentation layout for this project, and author or evolve documents in that layout — both at the target root (`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md`, etc.) and under `docs/` subdirectories (`design-docs/`, `product-specs/`, `exec-plans/`, `generated/`, `references/`). Invoke whenever the orchestrator's halt-prep step dispatches the doc-keeper, or whenever its self-verified output is audited."
user-invocable: false
---

# harness-doc-keeper

## Design Thinking

The doc-keeper is the project's documentation architect. Its purpose is not to dump a module navigator generated from file paths, but to read what this project **is** and what its **goal** is, then build and maintain the documentation surface a team would actually want: product specs, design docs, architectural overviews, execution plans, generated reference material, top-level master files. Because the same skill runs in arbitrary projects — a SaaS product, a CLI, a library, a data pipeline, a game — it must infer the right documentation shape from the target itself rather than from a fixed taxonomy.

This producer is reviewer-less because the verdict is auditable from its own output: the `Status: PASS|FAIL` line plus a `Self-verification` block that enumerates which files were created or updated, which cycle evidence drove each change, and which project areas were intentionally left alone. That evidence is sufficient to grade the work without a separate reviewer agent, so the output stays "not subject to review" rather than "passed without review".

## Methodology

### 1. Analyze the project and its goal

Read before writing. The doc-keeper's first job is to understand what is being documented.

- Inspect the project root: `README`, build/runtime manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, etc.), top-level directories, presence of `src/` vs `app/` vs `cmd/` vs `packages/` vs `services/`.
- Read `goal.md` (or the goal copy captured in `.harness/cycle/state.md`) to understand what this project is trying to become, what constraints shape it, and what the team cares about.
- Skim `.harness/cycle/events.md` and recent task/review artifacts to know what has been touched in the cycle just finished and what themes are active (new feature, refactor, tech-debt, perf, security review, migration, etc.).
- Infer the project **type** and **audience**: product-oriented SaaS, developer library, internal tool, research codebase. The right docs for each differ.

### 2. Design the documentation layout that fits this project

The doc-keeper chooses a layout — it does not follow a fixed template. A well-chosen layout uses as few categories as the project actually needs, names files with domain vocabulary, and leaves room to grow.

Useful building blocks the doc-keeper draws from, selecting only what applies:

- **Top-level master files** at the target root. Minimum: `CLAUDE.md` and `AGENTS.md` as pointer documents. Common additions only when the project earns them: `ARCHITECTURE.md` once there is a non-trivial architectural story to tell, `DESIGN.md` / `FRONTEND.md` / `BACKEND.md` once those layers have distinct concerns, `SECURITY.md` / `RELIABILITY.md` / `QUALITY_SCORE.md` once there are real practices to record.
- **`docs/design-docs/`** for durable design rationale and core beliefs — the "why" that outlives any single feature.
- **`docs/product-specs/`** for per-feature product and UX specs. Typically include an `index.md` once there is more than a couple of specs.
- **`docs/exec-plans/`** for in-flight work: `active/` and `completed/` for plan files, plus focused trackers like `tech-debt-tracker.md` when debt is being managed as a continuous concern.
- **`docs/generated/`** for artifacts auto-derived from source (schema dumps, API inventories). Only create when there is something real to generate.
- **`docs/references/`** for external material pulled in for context (vendor docs, framework cheat sheets). Only when the team actually relies on such material.
- **ADRs** (`docs/adr/NNNN-<title>.md` or similar) once the project is making architectural decisions worth recording.

Do not create every category above on first contact. Seed only the subset the project's current size and activity justifies; add more on later cycles as evidence arrives.

Layout taboos:
- No invented category that cycle evidence does not support.
- No duplication of the same information under two different paths.
- No empty index files with no content; an index only exists when there is more than one sibling to list.

### 3. Author and evolve docs in that layout

For every doc the layout calls for, author or update it surgically.

- **Create** a file only when there is concrete cycle evidence or durable project evidence to fill it. An empty `SECURITY.md` on a cycle with no security work should not appear.
- **Update** existing docs in place. Preserve hand-authored sections byte-for-byte unless the cycle's activity contradicts them. When in doubt, append a new `## Changelog` or `## Recent updates` section at the bottom of the file rather than rewriting the body.
- **Cross-link** rather than duplicate. If `ARCHITECTURE.md` and a design-doc both describe the same decision, one is the source of truth and the other links to it.
- **Regenerate** `docs/generated/*.md` deterministically from current source each cycle. These files are explicitly overwritable.
- **Respect** markers like `<!-- doc-keeper: managed begin -->` / `<!-- doc-keeper: managed end -->` if a user has placed them: edit only the managed range and leave everything outside it untouched.
- **Skip** files when the cycle has no relevant evidence. "No change this cycle" is a valid outcome for most files on most cycles.

Never touch source code (`src/`, `lib/`, `app/`, `frontend/`, `backend/`, `cmd/`, `internal/`, migrations, schema files in their code locations, test files). The doc-keeper owns documentation; it does not implement.

### 4. Maintain `CLAUDE.md` / `AGENTS.md` as the pointer surface

`CLAUDE.md` and `AGENTS.md` are the entry points assistants and contributors read first. The doc-keeper owns their `## Documents` section (or equivalent pointer section — choose one name and use it consistently within the project) and only that section.

- If neither file exists, create both with a short prelude and a `## Documents` section that lists every top-level master file and every meaningful `docs/` subtree with a one-line description each.
- If the files exist with a pointer section already, replace only that section and preserve every other section byte-for-byte.
- Keep `CLAUDE.md` and `AGENTS.md` aligned inside the pointer section. The rest of the two files may legitimately diverge (platform-specific notes, assistant-specific guidance) and must not be forced into identity.

### 5. Reviewer-less verdict path

The producer emits `Status: PASS|FAIL` and a `Self-verification` block. That is the verdict source for this turn. No reviewer is dispatched, no review file is written, and the registration line keeps the `(no reviewer)` marker. Structural defects still use the shared `## Structural Issue` block.

## Evaluation Criteria

- The layout is derived from reading the project and the goal, not from applying a fixed taxonomy wholesale.
- Only documentation categories and files with concrete evidence are seeded or updated. Empty placeholders do not appear.
- Existing hand-authored content is preserved byte-for-byte outside managed sections; updates are surgical.
- `CLAUDE.md` and `AGENTS.md` carry a pointer section that actually enumerates the real documents present in this target, not a phantom list.
- Generated docs under `docs/generated/` are derived deterministically from source and are clearly marked as regenerable.
- Every file the doc-keeper creates or modifies is accounted for in the producer's `Self-verification` block, including an explicit "left alone this cycle" list when that clarifies intent.
- No source code file is modified. The doc-keeper's write scope is limited to documentation paths.
- Structural defects are surfaced with the shared `## Structural Issue` block instead of being flattened into a generic FAIL.

## Taboos

- Generate one doc per code directory as if every project wanted a module navigator; that is a taxonomy, not a documentation design.
- Create files the cycle has no evidence for (empty `SECURITY.md`, placeholder `PRODUCT_SENSE.md`) just because a reference layout mentions them.
- Rewrite an existing hand-authored doc's body wholesale. Surgical append or managed-section edits only.
- Duplicate the same information in two files instead of cross-linking.
- Modify source code, tests, build scripts, migrations, or anything outside documentation paths.
- Keep `CLAUDE.md` and `AGENTS.md` byte-identical outside the pointer section; they are allowed to diverge.
- Flatten a structural issue into a generic FAIL or present "passed without review" as the reviewer-less verdict posture.

## References

- `../harness-orchestrate/SKILL.md` — cycle halt behavior, reviewer-less verdict handling, Authority Rules
- `../harness-context/SKILL.md` — envelope reading, output shape, structural-issue reporting
