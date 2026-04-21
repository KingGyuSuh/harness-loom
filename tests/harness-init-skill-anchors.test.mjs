import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const HARNESS_INIT_SKILL = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/SKILL.md",
);

test("harness-init skill exists at the canonical factory path", () => {
  assert.ok(existsSync(HARNESS_INIT_SKILL), `expected ${HARNESS_INIT_SKILL} to exist`);
});

test("harness-init skill describes install in terms of .harness/loom and .harness/cycle", () => {
  const body = readFileSync(HARNESS_INIT_SKILL, "utf8");
  assert.ok(body.includes(".harness/loom/"), "skill must describe `.harness/loom/`");
  assert.ok(body.includes(".harness/cycle/"), "skill must describe `.harness/cycle/`");
  assert.ok(
    body.includes("node .harness/loom/sync.ts --provider"),
    "skill must point to target-local sync after install",
  );
});

test("harness-init skill describes canonical state in .harness/, not in platform trees", () => {
  const body = readFileSync(HARNESS_INIT_SKILL, "utf8");
  const forbidden = [
    "canonical `.claude/`",
    "touches only `.claude/`",
  ];
  for (const token of forbidden) {
    assert.ok(!body.includes(token), `skill must not describe ${token} as canonical`);
  }
});
