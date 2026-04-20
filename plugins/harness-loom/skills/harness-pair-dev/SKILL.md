---
name: harness-pair-dev
description: "Use when `/harness-pair-dev --add|--improve|--split <pair-slug>` is invoked to author, refine, or split a producer-reviewer pair for a target project's harness. `--add <pair-slug> \"<purpose>\"` takes purpose as a positional argument and may repeat `--reviewer <slug>` for 1:M reviewer pairs; pass `--reviewer none` to register a reviewer-less producer-only group (opt-in escape hatch — pair is still the default). `--improve` accepts `--hint \"<free-form>\"`; without a hint it applies rubric hygiene plus codebase-drift fixes."
argument-hint: "--add <pair-slug> \"<purpose>\" [--reviewer <slug>|none ...] | --improve <pair-slug> [--hint \"<text>\"] | --split <pair-slug>"
user-invocable: true
---

# harness-pair-dev

## Design Thinking

`harness-pair-dev` is the **project-specific pair-authoring layer of the harness**. `harness-init` stamps in the shared foundation, so projects diverge only at the producer-reviewer pair layer. Claude reads this skill's references (`example-agents` + `example-skills`) directly in the main turn, authors the pair set, and delegates deterministic work such as registration and provider sync to scripts. Only `register-pair.ts` edits the roster sections of the orchestrate/planning skills; manual edits break the diff-based updater and can make the runtime lose track of pairs. **Canonical source = `.claude/`**: every mode writes only under `<target>/.claude/`. `.codex/` and `.gemini/` are deterministically derived from canonical by `sync.ts`, so provider-specific authoring branches are unnecessary.

## Methodology

### 1. Modes

| Mode | Input | Output |
|------|-------|--------|
| `--add <pair-slug> "<purpose>" [--reviewer <slug>\|none ...]` | new pair slug + required positional purpose text + optional reviewer slugs (or the special `none`) | after codebase analysis, authors one domain-specific producer, M reviewers (or zero when `--reviewer none`), and one shared pair skill under `.claude/`, then runs registration + sync |
| `--improve <pair-slug> [--hint "<text>"]` | existing pair slug, optionally user intent | performs codebase re-analysis, rubric diagnosis, and optional hint-driven refinement, then edits the `.claude/` files and re-syncs; if a split is required, it recommends that split and stops |
| `--split <pair-slug>` | overloaded pair slug | creates two sub-pairs under `.claude/`, removes the original pair, then runs registration + sync |

Target is always the current working directory; no `--target` flag is exposed at this entry. Provider sync is delegated to `sync.ts`'s on-disk detection (claude is always present; codex/gemini only when their derived trees already exist). To enable a new provider for the first time, the user runs `/harness-sync --provider <list>` separately.

### 2. `--add <pair-slug> "<purpose>" [--reviewer <slug>|none ...]`

1. **Parse args and verify preconditions** — `<purpose>` is the second positional argument and is required; if it is missing, stop immediately and ask for it. A slug alone cannot fill identity, principles, or the skill body. Verify that `<cwd>/.claude/skills/{harness-orchestrate, harness-planning, harness-context}/SKILL.md` exist. If any are missing, require `/harness-init` first and stop.
   - **Normalize every slug with the `harness-` prefix.** Apply `s.startsWith("harness-") ? s : "harness-" + s` to the pair slug, each `--reviewer` value (except the literal `none`), and the derived producer and skill slugs. The rule is idempotent, so `--add foo` and `--add harness-foo` both yield `harness-foo`. From step 1 onward, every slug referenced in this skill is the already-normalized form. The downstream `register-pair.ts` hard-rejects any unprefixed slug, so authoring with the normalized form is the only valid path.
2. **Decide reviewer roster** — if no `--reviewer` flag is present, default to one reviewer slug derived from the normalized pair slug, which is therefore `<pair-slug>-reviewer` (already carrying the `harness-` prefix via its pair base) — this is the **default pair authoring path**. If one or more `--reviewer <slug>` flags are provided, each value is normalized per step 1 and becomes a reviewer slug, making the pair 1:M. The single special value `--reviewer none` (and only that, never mixed with real slugs) selects the **reviewer-less producer-only path**: no reviewer agent file is created and the registration line carries `(no reviewer)`. Use it only for deterministic / auxiliary work that is genuinely "not subject to review" (sync, format, mirror, mechanical translation), not as a shortcut to skip review on creative or judgment work. Reviewer slugs must be kebab-case role names such as `harness-sql-reviewer` or `harness-server-reviewer`. Numeric suffixes are forbidden.
3. **Read references** — Claude reads the following references in order:
   - `references/example-agents/` (8 files) for tone and structural examples.
   - `references/example-skills/agent-authoring.md` for strict rules on agent frontmatter, five principles, Task, and Output Format.
   - `references/example-skills/skill-authoring.md` for strict rules on skill frontmatter, description-as-trigger, section order, the 200-line cap, and oversized-split thresholds.
4. **Codebase analysis (required)** — read the code the pair will actually work on first. Do not create a generic or abstract producer. Absorb the **real patterns used by this codebase** into the pair body. Collect at least:
   - `README.md`, root docs, and if present `CLAUDE.md` or `AGENTS.md`, to see how the project explains itself.
   - grep/glob results keyed off `--purpose` to find the real files, directories, functions, and tests in the domain the purpose points at. If the purpose is "snake game UI", find the actual UI code, input handling, and render loop.
   - active language/framework/build-system signals (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) and naming conventions such as snake_case vs camelCase and directory layout.
   - existing test patterns, if present, to ground how the producer should self-verify.
   If the signal is insufficient, stop and ask the user for more information. **Do not author a generic pair without enough evidence.**
5. **Design the domain contract** — use `--purpose` plus collected codebase evidence as the primary axis for the producer identity, five principles, task steps, and the shared pair skill's Design Thinking / Methodology / Evaluation Criteria / Taboos. **Every section must cite domain evidence at least once** using real file paths, function names, or pattern names. In 1:M cases, derive each reviewer axis from purpose plus codebase structure, then split and tag the pair skill Evaluation Criteria by reviewer axis.
6. **Author agents** — replace `templates/producer-agent.md` into `<cwd>/.claude/agents/<pair-slug>-producer.md`. For each reviewer, replace `templates/reviewer-agent.md` into `<cwd>/.claude/agents/<reviewer-slug>.md`. For a single-reviewer pair, that file is `<pair-slug>-reviewer.md`; for 1:M pairs, use the user-provided slugs exactly. **For the reviewer-less path (`--reviewer none`), do not create any reviewer agent file at all.** Slugs here are already normalized with the `harness-` prefix from step 1, so expected file names look like `harness-<pair>-producer.md` and `harness-<reviewer>.md`, and frontmatter `name:` fields match. The identity paragraph must be codebase-specific: not "writes code" but something like "adds a new input handler following the game-loop pattern in `src/engine/snake.py`."
7. **Author the pair skill** — replace `templates/pair-skill.md` into `<target>/.claude/skills/<pair-slug>/SKILL.md`. Design Thinking must answer, with code evidence, why this domain is hard in this codebase and what must be protected. Evaluation Criteria must be tagged by reviewer axis where applicable, such as `- [sql-reviewer] ...` and `- [server-reviewer] ...`, and every item must remain gradeable by citing codebase patterns/files rather than vague rubric language.
8. **Attach extra skills when needed** — if the producer or a reviewer needs domain knowledge beyond the shared pair skill, append extra slugs to that agent's frontmatter `skills:` list. For example, add `data-schema` to the producer or `sql-conventions` to `sql-reviewer`. **Always keep the required two entries `<pair-slug>` and `harness-context` first**, then append extras. Extra slugs must point to real on-disk `skills/<slug>/SKILL.md`.
9. **Run registration**:

   ```bash
   # Default pair (1:1) or 1:M:
   node ${CLAUDE_SKILL_DIR}/scripts/register-pair.ts \
     --target <cwd> --pair <slug> \
     --producer <slug>-producer \
     --reviewer <reviewer-slug-1> [--reviewer <reviewer-slug-2> ...] \
     --skill <slug>

   # Reviewer-less producer-only group:
   node ${CLAUDE_SKILL_DIR}/scripts/register-pair.ts \
     --target <cwd> --pair <slug> \
     --producer <slug>-producer \
     --reviewer none \
     --skill <slug>
   ```

   The script updates the "Registered pairs" and "Available departments" sections inside the target's `harness-orchestrate` and `harness-planning` skills idempotently. In 1:M cases, it records the reviewer set as `reviewers [<r1>, <r2>, ...]`. In the reviewer-less case it records `(no reviewer)` and omits the `↔` arrow so the runtime can recognize the producer-only group as "not subject to review". `register-pair.ts` is still invoked with an internal `--target` flag here (the user-facing `/harness-pair-dev` CLI no longer exposes it; target is always `cwd`).
10. **Sync pointer docs** — run `node ${CLAUDE_SKILL_DIR}/scripts/docs-sync.ts`. If the target has `CLAUDE.md` or `AGENTS.md`, re-render the `## Harness Pairs` section from the registration lines while preserving 1:M formatting. If either file is absent, skip it.
11. **Run provider sync** — run `node ${CLAUDE_SKILL_DIR}/scripts/sync.ts`. If the user explicitly passed `--provider`, forward it unchanged. Otherwise `sync.ts` auto-detects derived providers already on disk and derives only those trees. This is safe for single-platform projects because it becomes a no-op. To add codex/gemini for the first time, the user must explicitly call `/harness-sync --provider codex`. **Sync must never write back into `.claude/`**.

### 3. `--improve <pair-slug> [--hint "<text>"]`

1. **Discover the roster** — read the target's `harness-orchestrate/SKILL.md` "Registered pairs" section to identify the producer slug and reviewer slug list (M >= 1) for the pair. Then read all corresponding files: `<target>/.claude/agents/<producer-slug>.md`, `<target>/.claude/agents/<reviewer-slug>.md` for every reviewer, and `<target>/.claude/skills/<pair-slug>/SKILL.md`.
2. **Re-check evidence fit** — verify one by one that the file paths, function names, and pattern names cited in the pair body still match the current codebase. Method: (a) check that cited files still exist, (b) grep cited functions/symbols, (c) confirm the cited patterns still live in those directories. Any mismatch caused by moved files, renamed functions, or retired patterns becomes a repair axis. Also scan for **new patterns** in the intended domain so the pair can absorb what the current codebase now expects from it.
3. **Process the hint** — if `--hint` is present, treat the user's intent as the primary diagnosis axis, such as "make reviewer criteria tighter" or "force the producer to cite test evidence". Without a hint, do rubric diagnosis plus codebase-drift alignment only.
4. **Diagnose against the rubric** — use `references/example-skills/agent-authoring.md` and `skill-authoring.md` to identify weaknesses: description-as-trigger issues, wrong principle count, wrong section order, Output Format drift, exceeding the 200-line cap, insufficient domain evidence, and so on. If a hint exists, design the fix to satisfy both the hint and the rubric. **Replacing vague text with codebase-specific citations is the highest-priority fix.**
5. **Check for split escalation** — if the pair skill body hits any threshold from `oversized-split.md:6-11` (>=300 lines, >=3 authority-citation blocks, or >=2 example blocks), or if the hint explicitly requests a scope split, **stop here** and recommend a split to the user. If the user approves, tell them to re-run with `--split <pair-slug>`. Do not split automatically; a split is destructive because it changes multiple registration points and can orphan the `Phase:` field.
6. Apply only in-place edits to the three canonical files. **Do not change names or slugs**; otherwise registration lines and the `Phase:` field in `state.md` become orphaned.
7. Run `sync.ts`. Since names and slugs did not change, skip registration edits.

### 4. `--split <pair-slug>`

1. **Analyze the scope** — inspect the registration line for producer and reviewer slugs, then read the producer agent, all reviewer agents, and the pair skill to see whether they naturally divide into two sub-concerns. If they do not, stop and present the split rationale to the user instead of forcing it.
2. **Choose new slugs** — create meaningful domain slugs such as `<pair>-<concern-a>` and `<pair>-<concern-b>`. Numeric suffixes like `pair-1` are forbidden.
3. Repeat the `--add` procedure twice to author the two new pairs, including purpose text and any reviewer subsets needed for each new concern. In 1:M cases, the reviewer set should split naturally by concern.
4. **Remove the original** — run `register-pair.ts --unregister <pair-slug>` to remove registration, then delete all original pair files: `agents/<producer-slug>.md`, every `agents/<reviewer-slug>.md`, and `skills/<pair-slug>/SKILL.md`. **History stays in git; do not move anything into `.harness/_archive/`**. Runtime cruft makes it harder for the orchestrator to determine which pairs are live, while recovery is already handled by `git checkout`.
5. Run sync once for the two new pairs.

### 5. Reference usage

- `references/example-agents/` — use these as tone and structure references when designing a new pair.
- `references/example-skills/agent-authoring.md` — strict rules: frontmatter (`name`, `description`, `skills`), 2-4 line identity paragraph, exactly five Why-first principles, 5-10 numbered Task steps, and Producer/Reviewer Output Format. Forbidden fields: `path`, `effort`, `allow-tools`, `allowed-tools`, `tools`.
- `references/example-skills/skill-authoring.md` — strict rules: fixed section order Design Thinking -> Methodology -> Evaluation Criteria -> Taboos, 200-line cap, description-as-trigger, oversized-split threshold.
- `references/example-skills/oversized-split.md` — split guidance when the pair skill body exceeds the line budget.

Claude must read those references before it starts authoring.

### 6. skill -> subagent -> skill flow

The producer and reviewer templates always declare **two required entries** in frontmatter `skills:`: the pair-specific `{{SKILL_SLUG}}` and the shared `harness-context`. At dispatch time Claude Code injects both skills automatically, so the subagent reads its own rubric together with the shared law covering pair/cycle rhythm, authority, the reviewed-work contract, and structural-issue shape in the same turn. Any other skill referenced from the pair skill's `## References` section, such as `../rest-conventions/SKILL.md`, is also brought in. **One subagent turn's context = agent body + pair skill + harness-context + linked skills**. The two templates generated by `--add` already include `harness-context`, so users do not need to add it manually.

### 7. When reviewer-less is appropriate

`--reviewer none` is a **narrow opt-in escape hatch**, not a productivity shortcut. Pair authoring is the default, and every produced agent/skill body must read as pair-first; reviewer-less is the named exception. The choice is justified only when the work is genuinely **"not subject to review"** in the reviewed-work contract sense (goals.md:L21), never as "passed without review".

- **Use `--reviewer none` when** the producer's job is deterministic, auxiliary, and mechanically verifiable: sync (e.g., a `harness-mirror` producer that just rewrites canonical artifacts into a derived tree), format (a `harness-format` producer that runs a formatter and reports the diff), mirror (a `harness-translate-mirror` producer that copies one source-of-truth file into a sibling), or other single-function script wrappers whose output a reviewer could only rubber-stamp. In these cases the producer's own `Status: PASS|FAIL` plus `Self-verification` evidence (script exit code, byte-equivalence check, lint output) is the verdict source.
- **Do not use `--reviewer none` when** the producer's job involves judgment, generation, or creative composition: code authoring, doc writing, marketing copy, planning, schema design, anything that could be rubber-stamped in form but wrong in substance. Those domains exist precisely because a paired reviewer adds signal that the producer cannot self-detect; defaulting to reviewer-less in those domains hollows out the reviewed-work contract (goals.md:L21, L39).
- **The opt-in must be self-evident at every layer**: the user types the literal string `none` on the command line (goals.md:L23, L34), the registration line carries the load-bearing `(no reviewer)` token without `↔` (see §8 below), and the produced pair-skill Design Thinking explicitly names which deterministic axis makes review unnecessary. If you cannot write that one-sentence justification, the work probably is not reviewer-less — fall back to a paired reviewer.

### 8. Registration contract

`register-pair.ts` edits two target skill bodies:

- It appends one line into `<target>/.claude/skills/harness-orchestrate/SKILL.md` under `## Registered pairs`, matching the exact output shape produced by `register-pair.ts` `main()`:
  - 1:1 example: `` - harness-sql: producer `harness-sql-producer` ↔ reviewer `harness-sql-reviewer`, skill `harness-sql` ``
  - 1:M example: `` - harness-api: producer `harness-api-producer` ↔ reviewers [`harness-api-reviewer`, `harness-security-reviewer`], skill `harness-api` ``
  - reviewer-less example: `` - harness-mirror: producer `harness-mirror-producer` (no reviewer), skill `harness-mirror` `` — the missing `↔` is the load-bearing token that distinguishes producer-only registration from a pair.
- It appends the same line as a department registration under `## Available departments` in `<target>/.claude/skills/harness-planning/SKILL.md`.

The pair slug becomes the **phase name** in the target runtime. That means the `Phase:` field in `state.md` and the phase reference in `Next` use that slug directly. Therefore slugs must start with `harness-`, remain kebab-case English role nouns after the prefix, and must avoid numeric suffixes such as `pair-1`. `register-pair.ts` enforces this with a hard-reject regex.

`--unregister` removes those lines idempotently. If the target line is absent, it is a no-op.

## Evaluation Criteria

- `--add` always receives a required positional `<purpose>` second argument (the legacy `--purpose "<text>"` flag is gone), and that text is used as the primary axis for the producer identity, five principles, and pair skill Design Thinking.
- `--add` no longer accepts the user-facing `--target` or `--provider` flags (target is fixed to `cwd`; provider is delegated to `sync.ts` disk detection). First-time multi-platform support is opted into via `/harness-sync --provider <list>`.
- `--reviewer none` is treated as the **only** reviewer-less opt-in syntax (no separate `--reviewerless` flag), it is mutually exclusive with any real `--reviewer <slug>` value, and the choice is justified for deterministic / auxiliary work only — sync, format, mirror, mechanical translation — never for creative / judgment / generative work (goals.md:L21, L39).
- The reviewer-less path produces **no reviewer agent file**, and the produced pair-skill Design Thinking explicitly names the deterministic axis that makes review unnecessary, so the registration line's `(no reviewer)` token reads as "not subject to review" rather than "passed without review" (goals.md:L21).
- Pair-first identity is preserved across produced agents and skills even when reviewer-less is chosen: the rubric still describes pair authoring as the default path, the Modes table still lists `--reviewer none` as an opt-in branch (not a sibling default), and produced bodies do not weaken pair-centric narrative (goals.md:L18, L34).
- Both `--add` and `--improve` start with codebase analysis, and the resulting producer identity plus pair skill Design Thinking and Evaluation Criteria all cite **project-specific evidence** at least once: real file paths, function names, pattern names, or test locations. The body must anchor into the domain, not say abstract things like "writes code".
- New producer/reviewer agent files satisfy every rule in `references/example-skills/agent-authoring.md`: correct frontmatter, five principles, 5-10 task steps, and the correct Output Format shape.
- Each agent frontmatter `skills` list includes the **two required entries** `<pair-slug>` and `harness-context` in that order, followed by zero or more optional extra domain skills that resolve to real on-disk `skills/<slug>/SKILL.md`.
- The shared pair skill satisfies section order, the 200-line cap, and description-as-trigger as defined in `references/example-skills/skill-authoring.md`.
- In 1:M pairs, the shared pair skill tags Evaluation Criteria by reviewer axis, such as `[sql-reviewer] ...` or `[server-reviewer] ...`, so each reviewer can focus on its own grading surface.
- File naming stays consistent with the `harness-` namespace: producer -> `<pair-slug>-producer.md`, reviewer -> user-provided reviewer slug or the default `<pair-slug>-reviewer.md`, skill -> `<pair-slug>/SKILL.md`. All `<pair-slug>` and `<reviewer-slug>` values here are the already-normalized form starting with `harness-`.
- After `register-pair.ts`, the target `harness-orchestrate` and `harness-planning` SKILL.md files each contain exactly one registration line for the pair slug, with no duplicates. In 1:M cases, the line includes the full `reviewers [<r1>, <r2>, ...]` array.
- All authoring happens only in canonical `.claude/`, and `sync.ts` derives only the providers explicitly requested by the user or already detected on disk. First-time codex/gemini support still requires explicit `/harness-sync --provider codex,gemini`. Derived trees remain semantically equivalent to canonical, except for provider-specific model/frontmatter pins.
- One `--add` call creates **exactly one pair** even if that pair has multiple reviewers.
- `--improve` treats a hint as the primary diagnosis axis and rubric hygiene as the secondary constraint. Without a hint, it is rubric-only plus codebase drift.
- If `--improve` detects a split threshold, it stops with a recommendation instead of auto-splitting.
- `--split` deletes the original three files and does not move them into `.harness/_archive/`; history remains in git.
- Final authored files contain no leftover placeholders such as `{{PAIR_SLUG}}` or `{{IDENTITY_PARAGRAPH}}`.

## Taboos

- Running `--add` before `harness-init`; without target `harness-orchestrate`, `harness-planning`, and `harness-context`, registration breaks and new pair agents cannot read the shared law.
- Running `--add` without the positional `<purpose>` argument; a slug alone cannot justify identity, principles, or skill-body content and leads either to placeholder residue or hallucinated filler. The legacy `--purpose "<text>"` flag form is no longer accepted.
- Reaching for `--reviewer none` to skip review on creative, judgment, or generative work (code authoring, doc writing, marketing copy, planning, schema design); that hollows out the reviewed-work contract by treating "no reviewer dispatched" as "passed", which is exactly the framing goals.md:L21 forbids.
- Reframing reviewer-less in produced agent/skill bodies as "passed without review" or "auto-approved"; the only legitimate framing is "not subject to review" anchored to a deterministic axis (sync, format, mirror, mechanical translation), per goals.md:L21 and §7 of this skill.
- Letting the reviewer-less branch weaken pair-first identity in produced bodies (e.g., demoting pair authoring to a "legacy mode" or describing reviewer-less as the default); pair stays the default, reviewer-less is the named exception, per goals.md:L18 and L34.
- Skipping codebase analysis and improvising generic producer/reviewer/skill bodies; a pair that ignores the real patterns, files, and tests of the project will not work anywhere. Grepping the purpose keywords and listing related directories is the minimum baseline.
- Leaving producer identity or pair skill body with zero codebase evidence citations; without domain anchors the reviewer cannot grade reliably.
- Removing either `harness-context` or the pair-specific skill from an agent's `skills`; the subagent would lose either the shared law or the pair rubric.
- Mixing reviewer axes together in a 1:M shared pair skill without reviewer tags; reviewers lose their grading boundary and criteria become duplicated or omitted.
- Editing `.codex/` or `.gemini/` directly; canonical source is `.claude/`, and derived provider trees are overwritten by the next sync.
- Manually editing `harness-orchestrate` or `harness-planning` registration sections; anything outside `register-pair.ts` can break later registration/unregistration diffs.
- Creating more than one pair in a single `--add` call; that breaks scope boundaries and user-intent traceability.
- Using numeric suffixes or spaces in pair slugs; that damages readability in `state.md` `Phase:` fields.
- Authoring pair, producer, reviewer, or skill slugs without the `harness-` prefix; the plugin's naming convention is that every generated subagent and skill lives under the `harness-` namespace inside `.claude/` so harness artifacts are unambiguous against ambient repo files.
- Passing unprefixed slugs to `register-pair.ts` or `register-pair.ts --unregister`; the script hard-rejects them by design, so the normalization in step 1 of `--add` is mandatory, not cosmetic.
- Embedding reviewer criteria inside the producer agent body, or the reverse; that is role leakage and violates `references/example-skills/agent-authoring.md`.
- Authoring agent or skill files from scratch without the templates; that invites shape drift and unstable rubric grading.
- Letting `--improve` auto-run `--split` without user approval after a split threshold is detected; registration fan-out and `Phase:` orphaning are destructive side effects.
- Letting `--improve` rename slugs or roles; that orphans registration lines and `state.md` phase routing.
- Moving split originals into `.harness/_archive/` or another runtime directory; the orchestrator needs clean live-pair boundaries, and git already owns history.

## References

- `references/example-agents/` — eight pair examples for tone and structure.
- `references/example-skills/agent-authoring.md` — strict agent-authoring rules.
- `references/example-skills/skill-authoring.md` — strict skill-authoring rules.
- `references/example-skills/oversized-split.md` — split guidance when the 200-line cap is exceeded.
- `templates/producer-agent.md`, `templates/reviewer-agent.md`, `templates/pair-skill.md` — replacement templates used for authoring.
- `scripts/register-pair.ts`, `scripts/sync.ts`, `scripts/docs-sync.ts` — canonical script entry points. `sync.ts` exports both the CLI and `runSync()`.
