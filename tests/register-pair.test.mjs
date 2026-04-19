import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
  REGISTER_PAIR_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
}

test("register-pair writes 1:1 entry with backticks and ↔ arrow", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "demo",
      "--producer", "demo-producer",
      "--reviewer", "demo-reviewer",
      "--skill", "demo",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const orchestrate = readFileSync(
      join(target, ".claude/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.match(
      orchestrate,
      /- demo: producer `demo-producer` ↔ reviewer `demo-reviewer`, skill `demo`/,
    );
  } finally {
    cleanupDir(target);
  }
});

test("register-pair writes 1:M entry as bracketed reviewer list", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "api",
      "--producer", "api-producer",
      "--reviewer", "api-reviewer",
      "--reviewer", "security-reviewer",
      "--skill", "api",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const orchestrate = readFileSync(
      join(target, ".claude/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.match(
      orchestrate,
      /- api: producer `api-producer` ↔ reviewers \[`api-reviewer`, `security-reviewer`\], skill `api`/,
    );
  } finally {
    cleanupDir(target);
  }
});

test("register-pair mirrors the line into harness-planning Available departments", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(
      runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "demo",
        "--producer", "demo-producer",
        "--reviewer", "demo-reviewer",
        "--skill", "demo",
      ]).status,
      0,
    );

    const planning = readFileSync(
      join(target, ".claude/skills/harness-planning/SKILL.md"),
      "utf8",
    );
    assert.match(planning, /## Available departments/);
    assert.match(
      planning,
      /- demo: producer `demo-producer` ↔ reviewer `demo-reviewer`, skill `demo`/,
    );
  } finally {
    cleanupDir(target);
  }
});
