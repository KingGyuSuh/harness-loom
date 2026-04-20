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

test("installed harness-doc-keeper skill directs the producer to design docs from project + goal", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
    const skill = readFileSync(
      join(target, ".harness/loom/skills/harness-doc-keeper/SKILL.md"),
      "utf8",
    );

    // The rubric must open by reading project + goal, not by scanning code
    // for module boundaries. This is the central reframe (docs curator, not
    // module navigator).
    assert.match(
      skill,
      /analyze the project and its goal/i,
      "skill must open by analyzing project + goal",
    );
    assert.match(
      skill,
      /design the documentation layout that fits this project/i,
      "skill must design a layout rather than enumerate code modules",
    );

    // Layout building blocks the rubric advertises must be present so a
    // producer knows the vocabulary it can draw from.
    for (const category of [
      "design-docs",
      "product-specs",
      "exec-plans",
      "generated",
      "references",
    ]) {
      assert.match(
        skill,
        new RegExp(`docs/${category}/`),
        `layout building block docs/${category}/ must be referenced`,
      );
    }

    // The pointer-doc surgical contract must still be present: CLAUDE.md /
    // AGENTS.md are owned only in the pointer section.
    assert.match(skill, /CLAUDE\.md.*AGENTS\.md|AGENTS\.md.*CLAUDE\.md/);
    assert.match(skill, /replace only that section|preserve every other section/i);

    // Write-scope guard: doc-keeper must never touch source code.
    assert.match(
      skill,
      /never touch source code|does not implement/i,
      "skill must forbid writing outside documentation paths",
    );

    // Old module-navigator vocabulary (5-pass scan, file:line anchors as primary
    // evidence, legacy reference URLs) must no longer appear.
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
    assert.doesNotMatch(
      skill,
      /openai\.com\/index\/harness-engineering/,
      "the stale OpenAI harness-engineering link should have been removed",
    );
  } finally {
    cleanupDir(target);
  }
});
