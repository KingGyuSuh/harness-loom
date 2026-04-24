import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const AUTO_SETUP_SKILL = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-auto-setup/SKILL.md",
);
const SNAPSHOT_REFERENCE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-auto-setup/references/snapshot-provenance.md",
);
const FINALIZER_OVERLAY_REFERENCE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-auto-setup/references/finalizer-overlay.md",
);

test("harness-auto-setup skill points schema details to snapshot provenance reference", () => {
  const body = readFileSync(AUTO_SETUP_SKILL, "utf8");
  assert.ok(existsSync(SNAPSHOT_REFERENCE), "snapshot provenance reference must exist");
  assert.ok(existsSync(FINALIZER_OVERLAY_REFERENCE), "finalizer overlay reference must exist");
  assert.match(body, /references\/snapshot-provenance\.md/);
  assert.match(body, /references\/finalizer-overlay\.md/);
  assert.match(body, /If snapshot creation fails, stop before running install or deleting anything\./);
  assert.match(body, /must continue with LLM project analysis/);
  assert.match(body, /Ask the user at most three concise questions/);
  assert.match(body, /Author the actual additional pair\/finalizer configuration rather than stopping at recommendations/);
  assert.match(body, /Run the auto-setup script; on fresh `--setup` targets it invokes the foundation installer/);
  assert.match(body, /convergence\.setupAuthoring/);
});

test("snapshot provenance reference preserves manifest and namespace contract", () => {
  const body = readFileSync(SNAPSHOT_REFERENCE, "utf8");
  for (const key of [
    "schemaVersion",
    "tool",
    "targetPath",
    "createdAt",
    "snapshotPath",
    "copiedNamespaces",
    "activeCycle",
    "registrySummary",
    "finalizerSummary",
    "nextAction",
  ]) {
    assert.match(body, new RegExp(`\`${key}\``), `missing manifest key ${key}`);
  }
  assert.match(body, /copiedNamespaces` must be sorted/);
  assert.match(body, /Do not copy derived platform trees by default/);
});
