---
name: harness-sync
description: "Use when `/harness-sync [--provider <list>]` is invoked to derive the canonical `.claude/` tree into `.codex/` and `.gemini/`. Strictly one-way canonical-to-derived; sync never writes to `.claude/`. When `--provider` is omitted, it auto-detects only already-existing derived directories (`.codex/`, `.gemini/`). To start multi-platform support for the first time, opt in with `--provider codex,gemini`."
argument-hint: "[--provider codex,gemini]"
user-invocable: true
---

# harness-sync

## Design Thinking

`harness-sync` is the **deterministic one-way path from canonical `.claude/` to derived provider trees**. `harness-init` installs only the canonical tree, and `harness-pair-dev` edits only the canonical tree. Multi-platform deployment must happen only when the user explicitly wants it. This skill is a thin wrapper that invokes `sync.ts` once and reports the result. It does not re-explain the sync algorithm; the script source is canonical.

Sync **never touches `.claude/`**. If `--provider claude` is passed, it must hard-fail and direct the user to `/harness-init --force`. When `--provider` is omitted, detection looks only at derived platforms already on disk: `.codex/` means codex, `.gemini/` means gemini. To add codex/gemini for the first time, the user must opt in explicitly with `--provider codex,gemini`.

## Methodology

### 1. Arguments

`/harness-sync [--provider <list>]`

- `--provider <list>` — a comma-separated subset of `codex`, `gemini` such as `--provider codex,gemini`. If omitted, only already-existing derived directories on disk are auto-detected. Including `claude` is a hard error because canonical normalization belongs to `/harness-init --force`.

### 2. Execution

`$ARGUMENTS` is the full string passed after `/harness-sync`. Claude reads this skill and then runs **exactly one Bash call** in the current working directory:

```bash
node ${CLAUDE_SKILL_DIR}/../harness-pair-dev/scripts/sync.ts $ARGUMENTS
```

The script prints a JSON summary to stdout in the shape `{providers, codex?, gemini?}`, where each provider block looks like `{copied: [...], deleted: [...]}`. If no derived provider is detected, it returns a no-op summary such as `{providers: [], note: "..."}`. Claude parses that JSON and reports it to the user as a short readable paragraph.

This skill's jurisdiction stops at the **invocation contract**. Agent conversion (Codex TOML, Gemini frontmatter), hook file generation (`.codex/hooks.json` Stop, `.gemini/settings.json` AfterAgent), and stale-agent cleanup are deterministic logic owned by `sync.ts`.

### 3. When to call

- **First multi-platform opt-in**: right after `/harness-init`, call `/harness-sync --provider codex,gemini` to create `.codex/` and `.gemini/`, deploy converted agents/skills, and write provider hook settings.
- **Add just one platform later**: call `/harness-sync --provider gemini`, or the equivalent single provider, when only one new tree is needed.
- **Re-derive after canonical changes**: `/harness-pair-dev --add` auto-syncs, but manual sync is appropriate if the user edited `.claude/` directly or templates changed.
- **Clean stale outputs**: when an agent is deleted from canonical, running sync also cleans the corresponding derived agent through `cleanStaleAgents`.
- **Do not use this to normalize canonical**: if `.claude/` itself needs to be rebuilt, the correct path is `/harness-init --force`.

### 4. What it does NOT do

- It does not modify anything under `.claude/`. `settings.json`, `agents/`, and `skills/` are all canonical and sync treats them as read-only. Rebuilding `.claude/` belongs to `/harness-init --force`.
- It does not touch the control plane under `.harness/`.

## Evaluation Criteria

- The `description` includes trigger keywords (`/harness-sync`, `--provider`) and explains canonical-read-only behavior plus opt-in detection in one sentence.
- The body delegates the sync algorithm to `sync.ts` instead of re-stating it in prose.
- The output JSON includes a `providers` field so the user can see immediately which derived providers were actually processed.
- The body explicitly states the canonical-read-only rule for `.claude/` and the exception path that points to `/harness-init --force`.
- Invocation is a **single Bash call**, and Claude only interprets the result rather than improvising sync logic in the prompt.

## Taboos

- Re-explaining the internals of `sync.ts` such as deployCodex/deployGemini conversion or exact hook JSON shape in this skill body; that violates the script/prompt boundary.
- Claiming sync writes anything under `.claude/`; canonical read-only is absolute here, and rebuilds belong to `/harness-init --force`.
- Trying to allow `--provider claude`; the script already blocks it and the skill must not override that rule.
- Auto-creating codex/gemini directories when `--provider` is omitted; omission means detect only derived directories already on disk.
- Mixing canonical edits and sync in the same call; sync is read-canonical/write-derived, so canonical edits belong to `harness-pair-dev`.
- Letting Claude derive provider trees with its own file-copy loop instead of `sync.ts`; deterministic transformation belongs to the script.

## References

- `../harness-pair-dev/scripts/sync.ts` — canonical invocation target. Exports `runSync({targetRoot, providers})` and `detectDeployedProviders(targetRoot)`.
- `../harness-init/SKILL.md` — canonical scaffold ownership boundary.
- `../harness-pair-dev/SKILL.md` — flow for auto-sync after pair edits.
