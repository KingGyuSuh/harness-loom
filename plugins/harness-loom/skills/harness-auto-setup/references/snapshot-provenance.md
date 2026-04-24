---
name: auto-setup-snapshot-provenance
description: "Use when changing or reviewing `/harness-auto-setup` snapshot directory allocation, manifest shape, copied namespaces, active-cycle provenance, or snapshot failure behavior."
---

# Snapshot Provenance Contract

This reference owns the schema-level snapshot details for `harness-auto-setup`. `SKILL.md` owns the workflow sequence and authority boundaries.

## Snapshot Directory

Before any destructive refresh on a target with existing `.harness/loom/` or `.harness/cycle/`, create:

```text
.harness/_snapshots/auto-setup/<YYYYMMDDTHHMMSSZ>/
```

Use the UTC run-start timestamp for the id. If a directory already exists for the same second, append `-NN` with a zero-padded monotonic counter.

## Snapshot Contents

- `manifest.json` — deterministic JSON summary with stable key order.
- `loom/` — copy of pre-refresh `.harness/loom/` when present.
- `cycle/` — copy of pre-refresh `.harness/cycle/` when present.

Do not copy derived platform trees by default. `.claude/`, `.codex/`, and `.gemini/` are deployment outputs refreshed only by explicit sync.

## Manifest Shape

`manifest.json` must include at least these top-level keys in stable order:

1. `schemaVersion`
2. `tool`
3. `targetPath`
4. `createdAt`
5. `snapshotPath`
6. `copiedNamespaces`
7. `activeCycle`
8. `registrySummary`
9. `finalizerSummary`
10. `nextAction`

Mode-aware runs may append additional keys such as `runMode` and `targetState` after the ten load-bearing fields above.

`copiedNamespaces` must be sorted and use target-relative namespace names such as `.harness/loom` and `.harness/cycle`.

`activeCycle` must record both the classification and the parse reason so a later reviewer can tell whether the refresh discarded pristine, halted, active, or unknown cycle state.

## Failure Contract

If snapshot creation fails, stop before running install or deleting anything. Snapshot failure is a setup blocker, not a warning.
