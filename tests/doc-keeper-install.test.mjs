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

test("install.ts seeds harness-doc-keeper skill + producer agent under .harness/loom/", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [target]);
    assert.equal(r.status, 0, r.stderr);

    const skill = join(target, ".harness/loom/skills/harness-doc-keeper/SKILL.md");
    const producer = join(target, ".harness/loom/agents/harness-doc-keeper-producer.md");
    assert.ok(existsSync(skill), "harness-doc-keeper SKILL.md must be installed");
    assert.ok(existsSync(producer), "harness-doc-keeper-producer.md must be installed");

    const skillBody = readFileSync(skill, "utf8");
    assert.doesNotMatch(skillBody, /\{\{[A-Z_]+\}\}/, "no placeholder residue");
    assert.doesNotMatch(skillBody, /\.template\.md$/m);

    const producerBody = readFileSync(producer, "utf8");
    assert.doesNotMatch(producerBody, /\{\{[A-Z_]+\}\}/);
    assert.doesNotMatch(
      producerBody,
      /^model:/m,
      "producer frontmatter must not pin a model — sync.ts injects per-platform pin",
    );
    assert.match(producerBody, /^name: harness-doc-keeper-producer$/m);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts preserves the pre-seeded harness-doc-keeper registered-pairs line", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const orchestrate = readFileSync(
      join(target, ".harness/loom/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.match(
      orchestrate,
      /^- harness-doc-keeper: producer `harness-doc-keeper-producer` \(no reviewer\), skill `harness-doc-keeper`$/m,
      "pre-seeded registered-pairs line must render verbatim",
    );
  } finally {
    cleanupDir(target);
  }
});

test("installed harness-doc-keeper skill uses generic target-agnostic vocabulary", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const skill = readFileSync(
      join(target, ".harness/loom/skills/harness-doc-keeper/SKILL.md"),
      "utf8",
    );

    assert.match(
      skill,
      /derive modules from this project's current shape/i,
      "skill must derive modules from the current project's own structure",
    );
    assert.match(
      skill,
      /Ignore generated, vendored, cache, and runtime-owned directories/i,
      "skill must ignore generated and runtime-owned directories",
    );
    for (const forbidden of [
      "plugins/harness-loom",
      "skill-authoring.md",
      "oversized-split.md",
      "Pass 1",
      "Pass 2",
      "Pass 3",
      "Pass 4",
      "Pass 5",
    ]) {
      assert.ok(!skill.includes(forbidden), `skill must not mention ${forbidden}`);
    }

    // Surgical-merge contract must be present (prevents silent data loss).
    assert.match(skill, /## Modules/, "Modules heading referenced in surgical-merge contract");
    assert.match(skill, /Preserve every other section as-is/i);

    // Source citation must be declared as the primary evidence.
    assert.match(skill, /anchor(ed)? to source at `file:line`/);

    // Dead OpenAI reference must be gone.
    assert.doesNotMatch(
      skill,
      /openai\.com\/index\/harness-engineering/,
      "the stale OpenAI harness-engineering link should have been removed",
    );
  } finally {
    cleanupDir(target);
  }
});
