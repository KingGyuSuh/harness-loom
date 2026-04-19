import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
  SYNC_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  const r = runNode(INSTALL_SCRIPT, [target]);
  assert.equal(r.status, 0, r.stderr);
}

test("sync --provider codex writes nested hooks.json shape", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target });
    assert.equal(r.status, 0, r.stderr);

    const hooks = JSON.parse(readFileSync(join(target, ".codex/hooks.json"), "utf8"));
    assert.ok(hooks.hooks, "top-level 'hooks' key required by codex-rs");
    assert.ok(Array.isArray(hooks.hooks.Stop), "hooks.Stop must be array");
    const group = hooks.hooks.Stop[0];
    assert.ok(Array.isArray(group.hooks), "nested group.hooks[] required");
    const item = group.hooks[0];
    assert.equal(item.type, "command");
    assert.equal(item.command, "bash .harness/hook.sh codex");
    assert.equal(item.timeout, 30);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider codex writes [features] codex_hooks = true", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target }).status, 0);

    const toml = readFileSync(join(target, ".codex/config.toml"), "utf8");
    assert.match(toml, /\[features\]/);
    assert.match(toml, /codex_hooks\s*=\s*true/);
  } finally {
    cleanupDir(target);
  }
});

test("sync preserves existing [features] section when writing codex_hooks", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".codex"), { recursive: true });
    writeFileSync(
      join(target, ".codex/config.toml"),
      "[features]\nsome_other_flag = true\n",
    );
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target }).status, 0);

    const toml = readFileSync(join(target, ".codex/config.toml"), "utf8");
    assert.match(toml, /some_other_flag\s*=\s*true/);
    assert.match(toml, /codex_hooks\s*=\s*true/);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider gemini writes AfterAgent settings.json with gemini argument", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "gemini"], { cwd: target }).status, 0);

    const settings = JSON.parse(readFileSync(join(target, ".gemini/settings.json"), "utf8"));
    assert.ok(Array.isArray(settings.hooks.AfterAgent), "hooks.AfterAgent must be array");
    const group = settings.hooks.AfterAgent[0];
    assert.ok(Array.isArray(group.hooks), "nested group.hooks[] required by Gemini spec");
    const item = group.hooks[0];
    assert.equal(item.type, "command");
    assert.equal(item.command, "bash .harness/hook.sh gemini");
    assert.equal(item.timeout, 60000);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider codex,gemini produces both derived trees in one run", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex,gemini"], { cwd: target }).status, 0);

    assert.ok(existsSync(join(target, ".codex/hooks.json")));
    assert.ok(existsSync(join(target, ".codex/config.toml")));
    assert.ok(existsSync(join(target, ".gemini/settings.json")));
  } finally {
    cleanupDir(target);
  }
});

test("sync never writes into .claude/", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const before = readFileSync(join(target, ".claude/settings.json"), "utf8");
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex,gemini"], { cwd: target }).status, 0);
    const after = readFileSync(join(target, ".claude/settings.json"), "utf8");
    assert.equal(before, after, "sync.ts must not mutate .claude/settings.json");
  } finally {
    cleanupDir(target);
  }
});
