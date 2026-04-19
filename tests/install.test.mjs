import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
} from "./helpers.mjs";

test("install.ts scaffolds .harness/ and canonical .claude/", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.verification.ok, true, JSON.stringify(summary.verification));

    for (const p of [
      ".harness/state.md",
      ".harness/events.md",
      ".harness/hook.sh",
      ".harness/epics",
      ".claude/skills/harness-orchestrate/SKILL.md",
      ".claude/skills/harness-planning/SKILL.md",
      ".claude/skills/harness-context/SKILL.md",
      ".claude/agents/harness-planner.md",
      ".claude/settings.json",
    ]) {
      assert.ok(existsSync(join(target, p)), `expected ${p} to exist`);
    }
  } finally {
    cleanupDir(target);
  }
});

test("install.ts wires .claude/settings.json Stop hook with 'claude' argument", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const settings = JSON.parse(readFileSync(join(target, ".claude/settings.json"), "utf8"));
    const command = settings.hooks.Stop[0].hooks[0].command;
    assert.equal(command, "bash .harness/hook.sh claude");
    assert.equal(settings.hooks.Stop[0].hooks[0].type, "command");
  } finally {
    cleanupDir(target);
  }
});

test("install.ts produces events.md without absolute-path leak", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const events = readFileSync(join(target, ".harness/events.md"), "utf8");
    assert.match(events, /T0 orchestrator install — harness seeded\s*$/);
    assert.doesNotMatch(events, /\/Users\/|\/home\/|\\Users\\/);
    assert.doesNotMatch(events, /\{\{[A-Z_]+\}\}/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts produces state.md matching the new schema", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const state = readFileSync(join(target, ".harness/state.md"), "utf8");
    assert.match(state, /Goal \(from <none yet>\):/);
    assert.match(state, /Phase: planner/);
    assert.match(state, /^loop: false$/m);
    assert.match(state, /## Next/);
    assert.match(state, /## EPIC summaries/);
    assert.doesNotMatch(state, /\{\{[A-Z_]+\}\}/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts refuses non-empty .harness/ without --force", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.notEqual(r.status, 0, "expected non-zero on re-run without --force");
  } finally {
    cleanupDir(target);
  }
});

test("install.ts --force reseeds .harness/ deterministically", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const r = runNode(INSTALL_SCRIPT, [target, "--force"]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.verification.ok, true);
  } finally {
    cleanupDir(target);
  }
});
