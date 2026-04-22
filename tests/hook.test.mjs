import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  runBash,
  INSTALL_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  assert.equal(runNode(INSTALL_SCRIPT, [], { cwd: target }).status, 0);
}

function setLoop(target, value) {
  const path = join(target, ".harness/cycle/state.md");
  const content = readFileSync(path, "utf8").replace(/loop:\s*\w+/, `loop: ${value}`);
  writeFileSync(path, content);
}

test("hook.sh exits silently when loop: false", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["claude"], { cwd: target });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh emits /harness-orchestrate when platform=claude and loop: true", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["claude"], { cwd: target });
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.decision, "block");
    assert.equal(payload.reason, "/harness-orchestrate");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh emits $harness-orchestrate when platform=codex", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["codex"], { cwd: target });
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.reason, "$harness-orchestrate");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh emits /harness-orchestrate for gemini (slash-command platform)", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["gemini"], { cwd: target });
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.reason, "/harness-orchestrate");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh errors when platform argument is missing", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), [], { cwd: target });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /platform argument required/);
    assert.equal(r.stdout, "");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh errors on unknown platform argument", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["cursor"], { cwd: target });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown platform/);
    assert.equal(r.stdout, "");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh filters subagent Stop events (non-null agent_id on stdin)", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["claude"], {
      cwd: target,
      input: JSON.stringify({ agent_id: "subagent-xyz" }),
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    cleanupDir(target);
  }
});

test("hook.sh does not filter when agent_id is null or absent", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    setLoop(target, "true");
    const r = runBash(join(target, ".harness/loom/hook.sh"), ["claude"], {
      cwd: target,
      input: JSON.stringify({ agent_id: null }),
    });
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.decision, "block");
  } finally {
    cleanupDir(target);
  }
});
