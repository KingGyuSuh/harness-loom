import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
} from "./helpers.mjs";

test("install.ts scaffolds .harness/cycle/ + .harness/loom/ and skips .claude/", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.verification.ok, true, JSON.stringify(summary.verification));

    for (const p of [
      ".harness/cycle/state.md",
      ".harness/cycle/events.md",
      ".harness/cycle/epics",
      ".harness/cycle/finalizer/tasks",
      ".harness/loom/hook.sh",
      ".harness/loom/sync.ts",
      ".harness/loom/registry.md",
      ".harness/loom/skills/harness-orchestrate/SKILL.md",
      ".harness/loom/skills/harness-planning/SKILL.md",
      ".harness/loom/skills/harness-context/SKILL.md",
      ".harness/loom/agents/harness-planner.md",
      ".harness/loom/agents/harness-finalizer.md",
    ]) {
      assert.ok(existsSync(join(target, p)), `expected ${p} to exist`);
    }

    // install must not write any platform tree. Hook wiring belongs to sync.ts
    // and only fires on explicit `--provider` opt-in. On a fresh temp target
    // there is no prior platform tree, so absence proves install did not
    // create one. (On a real project an existing `.claude/` is unrelated to
    // install and is intentionally not treated as a failure.)
    for (const platformDir of [".claude", ".codex", ".gemini"]) {
      assert.ok(
        !existsSync(join(target, platformDir)),
        `install must not create ${platformDir}/ — sync.ts owns platform deploy`,
      );
    }
  } finally {
    cleanupDir(target);
  }
});

test("install.ts produces events.md without absolute-path leak", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const events = readFileSync(join(target, ".harness/cycle/events.md"), "utf8");
    assert.match(events, /T0 orchestrator bootstrap — runtime seeded\s*$/);
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
    const state = readFileSync(join(target, ".harness/cycle/state.md"), "utf8");
    assert.match(state, /Goal \(from <none yet>\):/);
    assert.match(state, /Phase: planner/);
    assert.match(state, /^loop: false$/m);
    assert.match(state, /^planner-continuation: none$/m);
    assert.match(state, /## Next/);
    assert.match(state, /## EPIC summaries/);
    assert.doesNotMatch(state, /\{\{[A-Z_]+\}\}/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts rerun wipes both .harness/loom/ and .harness/cycle/ before reseed", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);

    // Mutate cycle/state.md to a recognizable sentinel and add an EPIC dir so we
    // can confirm the rerun wipes and reseeds the cycle namespace.
    const statePath = join(target, ".harness/cycle/state.md");
    const sentinelLine = "<!-- wiped-sentinel -->";
    writeFileSync(statePath, sentinelLine + "\n" + readFileSync(statePath, "utf8"));
    mkdirSync(join(target, ".harness/cycle/epics/EP-X--keepme"), { recursive: true });

    // Mutate loom/hook.sh to a non-canonical body — rerun must overwrite.
    const hookPath = join(target, ".harness/loom/hook.sh");
    writeFileSync(hookPath, "#!/usr/bin/env bash\necho stale\n");

    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.cycleAction, "wiped");

    // cycle/ assets must be reseeded fresh.
    assert.doesNotMatch(readFileSync(statePath, "utf8"), /wiped-sentinel/);
    assert.ok(!existsSync(join(target, ".harness/cycle/epics/EP-X--keepme")));
    assert.ok(existsSync(join(target, ".harness/cycle/finalizer/tasks")));

    // loom/hook.sh must be the canonical body again (not the stale stub).
    assert.doesNotMatch(readFileSync(hookPath, "utf8"), /echo stale/);
    assert.match(readFileSync(hookPath, "utf8"), /loop:/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts rerun succeeds against an older cycle layout missing finalizer/tasks", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    rmSync(join(target, ".harness/cycle/finalizer"), { recursive: true, force: true });

    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.verification.ok, true);
    assert.equal(summary.cycleAction, "wiped");
    assert.ok(existsSync(join(target, ".harness/cycle/finalizer/tasks")));
  } finally {
    cleanupDir(target);
  }
});

test("install.ts rejects removed --force flag", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [target, "--force"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown flag: --force/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts rerun warns about non-foundation loom entries before wiping them", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);

    // Simulate pair-dev having authored a pair into loom/.
    const pairSkillDir = join(target, ".harness/loom/skills/harness-demo");
    mkdirSync(pairSkillDir, { recursive: true });
    writeFileSync(join(pairSkillDir, "SKILL.md"), "# demo pair\n");
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      "---\nname: harness-demo-producer\n---\nbody\n",
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      "## Registered pairs\n\n- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`\n",
    );

    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);

    // Non-foundation entries are surfaced in the summary and the warning.
    assert.deepEqual(
      summary.wipedPairs.sort(),
      ["agents/harness-demo-producer.md", "skills/harness-demo"],
    );
    assert.match(r.stderr, /rerun is about to wipe/);
    assert.match(r.stderr, /skills\/harness-demo/);
    assert.match(r.stderr, /agents\/harness-demo-producer\.md/);

    // And the wipe actually happened, including registry reset.
    assert.ok(!existsSync(pairSkillDir));
    assert.ok(!existsSync(join(target, ".harness/loom/agents/harness-demo-producer.md")));
    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    assert.doesNotMatch(registry, /harness-demo/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts fresh install reports empty wipedPairs", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.deepEqual(summary.wipedPairs, []);
    assert.equal(summary.cycleAction, "seeded");
    assert.doesNotMatch(r.stderr, /about to wipe/);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts seeds a self-contained sync.ts copy under .harness/loom/", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const syncBody = readFileSync(join(target, ".harness/loom/sync.ts"), "utf8");
    // Marker assertions that pin the installed copy as the loom-aware sync.ts
    // with all three platform deploy targets.
    assert.match(syncBody, /\.harness", "loom"/);
    assert.match(syncBody, /export type Platform = "claude" \| "codex" \| "gemini"/);
  } finally {
    cleanupDir(target);
  }
});
