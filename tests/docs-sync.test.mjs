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

test("docs-sync finds Registered pairs and rewrites pointer docs when files use CRLF", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    // Register one pair so the roster is non-empty.
    assert.equal(
      runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "harness-crlf",
        "--producer", "harness-crlf-producer",
        "--reviewer", "harness-crlf-reviewer",
        "--skill", "harness-crlf",
      ]).status,
      0,
    );

    // Force CRLF on the orchestrator SKILL and on a pre-existing CLAUDE.md so
    // both the read-source and the write-target exercise CRLF handling.
    const orchestratePath = join(
      target,
      ".harness/loom/skills/harness-orchestrate/SKILL.md",
    );
    writeFileSync(
      orchestratePath,
      readFileSync(orchestratePath, "utf8").replace(/\n/g, "\r\n"),
    );
    const claudeMdPath = join(target, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# CLAUDE.md\r\n\r\nInitial prelude.\r\n", "utf8");

    const r = runNode(DOCS_SYNC_SCRIPT, [], { cwd: target });
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    // Must not silently fall back to zero pairs on CRLF — the real roster
    // count is the non-zero signal the test keys on.
    assert.ok(summary.pairs > 0, `expected pairs > 0, got ${summary.pairs}`);

    const after = readFileSync(claudeMdPath, "utf8");
    // The synced section contains the registered slug.
    assert.match(after, /`harness-crlf`/);
    // Must not contain the "No pairs are registered yet" fallback, which is
    // the exact silent-desync symptom the LF-only heading probe produced.
    assert.doesNotMatch(after, /No pairs are registered yet/);
    // CRLF preserved on write back.
    assert.ok(after.includes("\r\n"), "CRLF line endings must survive the round-trip");
  } finally {
    cleanupDir(target);
  }
});
