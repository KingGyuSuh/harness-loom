---
name: from-overlay
description: "Use when `/harness-pair-dev --add <pair> \"<purpose>\" --from <existing-pair>` authors a new pair from a currently registered source pair. Defines template-first overlay, mandatory runtime shape, and source material preservation rules."
user-invocable: false
---

# From Overlay

`--from` means "start from the current pair templates, then overlay compatible source-pair knowledge." It is not a blind copy, snapshot import, filesystem import, or provider-tree import.

The source pair must already be registered in the target's current `.harness/loom/registry.md`. A current registered pair is trusted more than an auto-setup snapshot, so preserve useful domain shape aggressively, but never let source text override current harness runtime contracts.

## Methodology

### 1. Template-first sequence

1. Run `scripts/pair-dev.ts --add <new-pair> "<purpose>" --from <source-pair>` and confirm it returns preparation JSON.
2. Read the source pair skill and source producer/reviewer agents from `.harness/loom/`.
3. Create the new pair from the current templates:
   - `templates/pair-skill.md`
   - `templates/producer-agent.md`
   - `templates/reviewer-agent.md`
4. Fill every mandatory runtime field for the new pair first.
5. Overlay source-pair material only after the new template shape is valid.
6. Register the new pair with `register-pair.ts`.
7. Tell the user to run `node .harness/loom/sync.ts --provider <list>`.

### 2. Mandatory new shape

These fields come from the current templates and authoring rubrics, not from the source pair:

- Frontmatter `name` must match the new filename slug.
- Frontmatter `description` must be a one-line active trigger for the new role.
- Pair agent `skills:` must list the new pair skill first and `harness-context` second.
- Pair skill frontmatter `name` must be the new pair skill slug.
- Producer and reviewer output formats must match the current `agent-authoring.md` Producer/Reviewer variants.
- Structural Issue shape must match `harness-context`.
- Agent bodies must not claim authority to write `.harness/cycle/` or derived provider trees.
- `<purpose>` is the primary intent for the new pair and wins over conflicting source intent.

### 3. Preserve by default

Preserve or adapt these source-pair elements when they still fit `<purpose>` and the target repo:

- Domain identity and vocabulary.
- Why-first principle ideas, rewritten into the current five-principle shape when needed.
- Methodology steps that describe real domain work.
- Evaluation criteria that a reviewer can still verify with files, diffs, tests, or source evidence.
- Taboos that encode real project risks.
- Reviewer-specific axes, especially when the source pair has multiple reviewers.
- File paths, subsystem names, or repo conventions that are still present.
- Examples or terminology that make the new pair easier to use.
- Extra domain skills from source agent frontmatter, when they are still relevant and available.

### 4. Skill preservation rule

Do not preserve the source `skills:` list wholesale.

- Always use the new pair skill slug as the first skill.
- Always include `harness-context` as the second skill.
- Treat source extra/domain skills as preservation candidates only after those two required entries.
- Do not carry over the source pair skill slug.
- Do not duplicate `harness-context`.
- Do not add unavailable or irrelevant domain skills just because the source used them.

### 5. Rename and conflict rules

- Replace old pair, producer, reviewer, and skill slugs with the new slugs unless the old slug is intentionally cited as historical source evidence.
- If the source reviewer count differs from the requested reviewer count, map source reviewer guidance by closest responsibility and report any dropped axis.
- If source text conflicts with current `harness-context`, current agent/skill authoring rubrics, or `<purpose>`, keep the current contract and summarize the dropped source idea.
- If source material is too broad for the new purpose, preserve the narrower relevant part and leave the rest out.
- If the source pair appears stale or internally inconsistent, use it as evidence only and say what was not preserved.

## Evaluation Criteria

- The new pair starts from current templates and passes the current agent/skill authoring rubrics.
- The new agents list the new pair skill plus `harness-context`; only relevant extra domain skills are carried over.
- Source domain material is preserved where compatible instead of being flattened into a generic template.
- `<purpose>` remains visible as the new pair's primary intent.
- No source slug, output format, or authority claim leaks into the new pair by accident.
- The author reports important preserved, adapted, and dropped source elements.

## Taboos

- Blind-copy source pair files into the new pair.
- Treat `--from` as a snapshot path, filesystem path, or derived provider-tree import.
- Preserve an old Output Format because the source used it.
- Preserve source `skills:` wholesale.
- Drop all source domain guidance and produce a generic pair despite `--from`.
- Let source text override `harness-context`, current templates, or `<purpose>`.
