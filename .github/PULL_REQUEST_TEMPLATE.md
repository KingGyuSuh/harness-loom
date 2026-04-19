## Summary

<!-- 1–3 bullets: what changed and why. -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Documentation / polish
- [ ] Chore (tooling, metadata)

## Verification

- [ ] Install smoke test passes:
      `rm -rf /tmp/harness-ci && mkdir /tmp/harness-ci && node skills/harness-init/scripts/install.ts /tmp/harness-ci`
- [ ] Sync smoke test passes (if `scripts/*.ts` touched):
      `cd /tmp/harness-ci && node <repo>/skills/harness-pair-dev/scripts/sync.ts --provider codex,gemini`
- [ ] Editor TS diagnostics clean on edited `scripts/*.ts`
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` (skip for docs-only)
- [ ] No `{{PLACEHOLDER}}` residue in generated templates

## Notes for reviewer

<!-- Anything non-obvious: design tradeoffs, follow-ups, areas to look at closely. -->
