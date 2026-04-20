import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
  REGISTER_PAIR_SCRIPT,
  DOCS_SYNC_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
}

test("docs-sync preserves registered pair order instead of sorting alphabetically", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    writeFileSync(join(target, "CLAUDE.md"), "# Temp\n", "utf8");

    for (const args of [
      [
        "--target", target,
        "--pair", "harness-alpha",
        "--producer", "harness-alpha-producer",
        "--reviewer", "harness-alpha-reviewer",
        "--skill", "harness-alpha",
      ],
      [
        "--target", target,
        "--pair", "harness-gamma",
        "--producer", "harness-gamma-producer",
        "--reviewer", "harness-gamma-reviewer",
        "--skill", "harness-gamma",
      ],
      [
        "--target", target,
        "--pair", "harness-beta",
        "--producer", "harness-beta-producer",
        "--reviewer", "harness-beta-reviewer",
        "--skill", "harness-beta",
        "--before", "harness-gamma",
      ],
    ]) {
      const r = runNode(REGISTER_PAIR_SCRIPT, args);
      assert.equal(r.status, 0, r.stderr);
    }

    const sync = runNode(DOCS_SYNC_SCRIPT, [], { cwd: target });
    assert.equal(sync.status, 0, sync.stderr);

    const claude = readFileSync(join(target, "CLAUDE.md"), "utf8");
    const alpha = claude.indexOf("`harness-alpha`");
    const beta = claude.indexOf("`harness-beta`");
    const gamma = claude.indexOf("`harness-gamma`");
    assert.ok(alpha !== -1 && beta !== -1 && gamma !== -1, "expected synced pair section in CLAUDE.md");
    assert.ok(alpha < beta, "docs-sync should preserve alpha before beta");
    assert.ok(beta < gamma, "docs-sync should preserve beta before gamma");
  } finally {
    cleanupDir(target);
  }
});
