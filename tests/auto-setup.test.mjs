import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTO_SETUP_SCRIPT,
  INSTALL_SCRIPT,
  cleanupDir,
  makeTempDir,
  runNode,
} from "./helpers.mjs";

function runAutoSetup(target, extraArgs = []) {
  const r = runNode(AUTO_SETUP_SCRIPT, extraArgs, { cwd: target });
  assert.equal(r.status, 0, r.stderr);
  return { result: r, summary: JSON.parse(r.stdout) };
}

function installTo(target) {
  const r = runNode(INSTALL_SCRIPT, [], { cwd: target });
  assert.equal(r.status, 0, r.stderr);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertNoProviderTrees(target) {
  for (const platformDir of [".claude", ".codex", ".gemini"]) {
    assert.ok(!existsSync(join(target, platformDir)), `auto-setup must not create ${platformDir}/`);
  }
}

function snapshotTree(root) {
  const out = new Map();
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.set(rel, readFileSync(full, "utf8"));
    }
  }
  if (existsSync(root)) walk(root, "");
  return out;
}

function assertTreeUnchanged(before, root) {
  const after = snapshotTree(root);
  assert.equal(after.size, before.size, `${root} file count must not change`);
  for (const [path, body] of before) {
    assert.equal(after.get(path), body, `${root}/${path} must be preserved byte-for-byte`);
  }
}

function assertManifestShape(manifest) {
  assert.deepEqual(Object.keys(manifest).slice(0, 10), [
    "schemaVersion",
    "tool",
    "targetPath",
    "createdAt",
    "snapshotPath",
    "copiedNamespaces",
    "activeCycle",
    "registrySummary",
    "finalizerSummary",
    "nextAction",
  ]);
}

function readAgent(target, slug) {
  return readFileSync(join(target, ".harness/loom/agents", `${slug}.md`), "utf8");
}

function readAgentBodies(target, slugs) {
  return Object.fromEntries(slugs.map((slug) => [slug, readAgent(target, slug)]));
}

function assertReconstructedProducerAgent(body, { pair, skill, producer }) {
  assert.match(body, new RegExp(`^name: ${producer}$`, "m"));
  assert.match(body, new RegExp(`^skills:\\n  - ${skill}\\n  - harness-context$`, "m"));
  assert.match(body, new RegExp(`registered \`${pair}\` harness pair`));
  assert.match(body, /^## Output Format$/m);
  assert.match(body, /End your response with this structured block:/);
  assert.match(body, /Status: PASS \/ FAIL/);
  assert.match(body, /Files created: \[\{file path\}\]/);
  assert.match(body, /Files modified: \[\{file path\}\]/);
  assert.match(body, /Diff summary: \{sections changed vs baseline, or "N\/A"\}/);
  assert.match(body, /Self-verification: \{issues found and resolved during this cycle\}/);
  assert.match(body, /Blocked or out-of-scope items: \[\{item, reason\}\]/);
  assert.doesNotMatch(body, /Suggested next-work|Advisory-next|Regression gate|Escalation/);
  assert.doesNotMatch(body, /Verdict: PASS \/ FAIL/);
}

function assertReconstructedReviewerAgent(body, { pair, skill, reviewer }) {
  assert.match(body, new RegExp(`^name: ${reviewer}$`, "m"));
  assert.match(
    body,
    new RegExp(
      `^description: "Use when \`/harness-orchestrate\` dispatches the \`${pair}\` reviewer turn\\. Read the shared pair skill plus \`harness-context\`, grade the paired producer task, and end with the Reviewer Output Format block\\."$`,
      "m",
    ),
  );
  assert.match(body, new RegExp(`^skills:\\n  - ${skill}\\n  - harness-context$`, "m"));
  assert.match(body, new RegExp(`registered \`${pair}\` harness pair`));
  assert.match(body, /Check contract freshness\. Reason: reconstructed pairs must follow current templates and harness-context law\./);
  assert.match(body, /Verify the producer used current contracts rather than stale snapshot copies\./);
  assert.match(body, /^## Output Format$/m);
  assert.match(body, /End your response with this structured block:/);
  assert.match(body, /Verdict: PASS \/ FAIL/);
  assert.match(body, /Criteria: \[\{criterion, result, evidence-citation \(file:line\)\}\]/);
  assert.match(body, /FAIL items: \[\{item, level \(technical\/creative\/structural\), reason\}\]/);
  assert.match(body, /Feedback: \{short free-form rationale\}/);
  assert.doesNotMatch(body, /Suggested next-work|Advisory-next|Regression gate|Escalation/);
  assert.doesNotMatch(body, /Status: PASS \/ FAIL/);
}

test("auto-setup fresh target installs foundation and prints explicit sync handoff", () => {
  const target = makeTempDir();
  try {
    writeFileSync(join(target, "README.md"), "# Demo\n");

    const { summary } = runAutoSetup(target, ["--setup", "--provider", "codex"]);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "fresh");
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.activeCycle.classification, "absent");
    assert.equal(summary.install.summary.verification.ok, true);
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider codex");
    assert.deepEqual(summary.providerTreesWritten, []);
    assert.equal(summary.convergence.pairReconstructions.length, 1);
    assert.equal(summary.convergence.pairReconstructions[0].status, "authored");
    assert.equal(summary.convergence.pairReconstructions[0].pair, "harness-document");
    assert.equal(summary.convergence.finalizerReconstruction.status, "authored");
    assert.ok(existsSync(join(target, ".harness/loom/sync.ts")));
    assert.ok(existsSync(join(target, ".harness/cycle/state.md")));
    assert.ok(existsSync(join(target, ".harness/loom/agents/harness-document-producer.md")));
    assert.match(
      readFileSync(join(target, ".harness/loom/registry.md"), "utf8"),
      /^- harness-document:/m,
    );
    assert.match(
      readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8"),
      /Refresh README, docs, or CHANGELOG/,
    );
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup rejects unknown flags before writing harness state", () => {
  const target = makeTempDir();
  try {
    const r = runNode(AUTO_SETUP_SCRIPT, ["--force"], { cwd: target });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown flag: --force/);
    assert.ok(!existsSync(join(target, ".harness")), "invalid args must not create .harness/");
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup preserves pre-existing provider trees and only prints sync handoff", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".claude/agents"), { recursive: true });
    mkdirSync(join(target, ".claude/skills/user-skill"), { recursive: true });
    mkdirSync(join(target, ".codex/agents"), { recursive: true });
    mkdirSync(join(target, ".gemini/skills/harness-stale"), { recursive: true });
    writeFileSync(join(target, ".claude/settings.json"), '{"permissions":{"allow":["Bash(ls)"]}}\n');
    writeFileSync(join(target, ".claude/agents/team-reviewer.md"), "USER CLAUDE AGENT\n");
    writeFileSync(join(target, ".claude/skills/user-skill/SKILL.md"), "USER CLAUDE SKILL\n");
    writeFileSync(join(target, ".codex/config.toml"), "[features]\nuser_feature = true\n");
    writeFileSync(join(target, ".codex/agents/harness-stale-producer.toml"), "STALE BUT UNTOUCHED\n");
    writeFileSync(join(target, ".gemini/settings.json"), '{"hooks":{"AfterAgent":[]}}\n');
    writeFileSync(join(target, ".gemini/skills/harness-stale/SKILL.md"), "STALE GEMINI SKILL\n");

    const before = new Map([
      [".claude", snapshotTree(join(target, ".claude"))],
      [".codex", snapshotTree(join(target, ".codex"))],
      [".gemini", snapshotTree(join(target, ".gemini"))],
    ]);

    const { summary } = runAutoSetup(target, ["--setup", "--provider", "claude,gemini"]);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider claude,gemini");
    assert.equal(
      summary.nextAction,
      "From the target root, run `node .harness/loom/sync.ts --provider claude,gemini` for any platform trees you want to refresh.",
    );
    assert.deepEqual(summary.providerTreesWritten, []);
    for (const platformDir of [".claude", ".codex", ".gemini"]) {
      assertTreeUnchanged(before.get(platformDir), join(target, platformDir));
    }
    assert.ok(!existsSync(join(target, ".claude/agents/harness-planner.md")));
    assert.ok(!existsSync(join(target, ".codex/hooks.json")));
    assert.ok(!existsSync(join(target, ".gemini/agents/harness-planner.md")));
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup reconstructs registered pair files and registry after refresh", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const oldSkill = [
      "---",
      "name: harness-demo",
      'description: "Use when maintaining custom demo build scripts."',
      "user-invocable: false",
      "---",
      "",
      "# Old Demo",
      "",
      "## Design Thinking",
      "",
      "Own custom demo release packaging.",
      "",
      "## Methodology",
      "",
      "Keep custom build scripts and fixture snapshots aligned.",
      "",
      "## Evaluation Criteria",
      "",
      "- Old criterion.",
      "",
      "## Taboos",
      "",
      "- Old taboo.",
      "",
    ].join("\n");
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), oldSkill);
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      "---\nname: harness-demo-producer\n---\n\n# Producer\n\n## Task\n\n1. Maintain custom build scripts.\n",
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      "---\nname: harness-demo-reviewer\n---\n\n# Reviewer\n\n## Task\n\n1. Audit fixture snapshots.\n",
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-security-reviewer.md"),
      "---\nname: harness-demo-security-reviewer\n---\n\n# Security Reviewer\n\n## Task\n\n1. Check release safety notes.\n",
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewers [`harness-demo-reviewer`, `harness-demo-security-reviewer`], skill `harness-demo`",
        "",
      ].join("\n"),
    );

    const { summary } = runAutoSetup(target, ["--setup"]);
    const manifest = readJson(summary.snapshot.manifestPath);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.snapshot.created, true);
    assert.deepEqual(summary.snapshot.copiedNamespaces, [".harness/cycle", ".harness/loom"]);
    assertManifestShape(manifest);
    assert.equal(manifest.registrySummary.pairCount, 1);
    assert.equal(manifest.registrySummary.pairs[0].pair, "harness-demo");
    assert.equal(manifest.activeCycle.classification, "pristine");
    assert.ok(existsSync(join(summary.snapshot.path, "loom/skills/harness-demo/SKILL.md")));
    assert.ok(existsSync(join(summary.snapshot.path, "cycle/state.md")));

    assert.equal(summary.convergence.pairReconstructions[0].status, "reconstructed");
    assert.deepEqual(summary.convergence.pairReconstructions[0].reviewers, [
      "harness-demo-reviewer",
      "harness-demo-security-reviewer",
    ]);
    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.notEqual(currentSkill, oldSkill);
    assert.match(currentSkill, /name: harness-demo/);
    assert.match(currentSkill, /### Preserved Snapshot Intent/);
    assert.match(currentSkill, /custom build scripts/);
    assert.match(currentSkill, /Current project files and tests are cited/);

    assertReconstructedProducerAgent(readAgent(target, "harness-demo-producer"), {
      pair: "harness-demo",
      skill: "harness-demo",
      producer: "harness-demo-producer",
    });
    for (const reviewer of ["harness-demo-reviewer", "harness-demo-security-reviewer"]) {
      assertReconstructedReviewerAgent(readAgent(target, reviewer), {
        pair: "harness-demo",
        skill: "harness-demo",
        reviewer,
      });
    }

    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    assert.match(
      registry,
      /- harness-demo: producer `harness-demo-producer` ↔ reviewers \[`harness-demo-reviewer`, `harness-demo-security-reviewer`\], skill `harness-demo`/,
    );
    assert.equal(registry.match(/^- harness-demo:/gm).length, 1);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration preserves custom pair and finalizer bodies while refreshing contract surfaces", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const oldSkill = [
      "---",
      "name: harness-demo",
      'description: "Use when maintaining custom demo build scripts."',
      "user-invocable: false",
      "---",
      "",
      "# Old Demo",
      "",
      "## Design Thinking",
      "",
      "Own custom demo release packaging.",
      "",
      "## Methodology",
      "",
      "Keep custom build scripts and fixture snapshots aligned.",
      "",
      "## Evaluation Criteria",
      "",
      "- Old criterion.",
      "",
      "## Taboos",
      "",
      "- Old taboo.",
      "",
    ].join("\n");
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), oldSkill);
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        'description: "Use when maintaining custom demo producer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "  - demo-domain",
        "---",
        "",
        "# Demo Producer",
        "",
        "Producer identity that should survive migration.",
        "",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
        "## Output Format",
        "",
        "Status: PASS / FAIL",
        "Summary: legacy block",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity that should survive migration.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "Finalizer intro that should survive migration.",
        "",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    const { summary } = runAutoSetup(target, ["--migration"]);

    assert.equal(summary.mode, "migration");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.convergence.pairReconstructions[0].status, "migrated");
    assert.equal(summary.convergence.pairReconstructions[0].source.kind, "snapshot");
    assert.match(summary.convergence.pairReconstructions[0].replaced.join("\n"), /frontmatter skills/);
    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.match(currentSkill, /Own custom demo release packaging/);
    assert.match(currentSkill, /Keep custom build scripts and fixture snapshots aligned/);
    assert.doesNotMatch(currentSkill, /### Preserved Snapshot Intent/);

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.match(currentProducer, /Producer identity that should survive migration/);
    assert.match(currentProducer, /1\. Maintain custom build scripts\./);
    assert.match(currentProducer, /^skills:\n  - harness-demo\n  - harness-context\n  - demo-domain$/m);
    assert.match(currentProducer, /^Status: PASS \/ FAIL$/m);

    const currentReviewer = readFileSync(join(target, ".harness/loom/agents/harness-demo-reviewer.md"), "utf8");
    assert.match(currentReviewer, /Reviewer identity that should survive migration/);
    assert.match(currentReviewer, /1\. Audit fixture snapshots\./);
    assert.match(currentReviewer, /^Verdict: PASS \/ FAIL$/m);

    assert.equal(summary.convergence.finalizerReconstruction.status, "migrated");
    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.match(currentFinalizer, /Finalizer intro that should survive migration/);
    assert.match(currentFinalizer, /Refresh docs\/ and CHANGELOG\.md after verified release work/);
    assert.match(currentFinalizer, /^Status: PASS \/ FAIL$/m);
    assert.match(currentFinalizer, /## Structural Issue/);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration handles source agents and finalizer without intro paragraphs", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        'description: "Use when maintaining custom demo build scripts."',
        "user-invocable: false",
        "---",
        "",
        "# Old Demo",
        "",
        "## Design Thinking",
        "",
        "Own custom demo release packaging.",
        "",
        "## Methodology",
        "",
        "Keep custom build scripts and fixture snapshots aligned.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        'description: "Use when maintaining custom demo producer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Producer",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity that should survive migration.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    runAutoSetup(target, ["--migration"]);

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.equal((currentProducer.match(/^## Principles$/gm) ?? []).length, 1);
    assert.equal((currentProducer.match(/^## Task$/gm) ?? []).length, 1);

    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.equal((currentFinalizer.match(/^## Principles$/gm) ?? []).length, 1);
    assert.equal((currentFinalizer.match(/^## Task$/gm) ?? []).length, 1);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration preserves escaped quotes in frontmatter descriptions", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        'description: "Use when handling \\"demo\\" work." # preserve this note',
        "user-invocable: false",
        "---",
        "",
        "# Demo Skill",
        "",
        "## Design Thinking",
        "",
        "Own custom demo release packaging.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        'description: "Use when handling \\"demo\\" producer work." # preserve this note',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Producer",
        "",
        "Producer identity.",
        "",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        'description: "Use when closing \\"demo\\" cycles." # preserve this note',
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "Finalizer intro.",
        "",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    runAutoSetup(target, ["--migration"]);

    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.match(currentSkill, /^description: "Use when handling \\"demo\\" work\."$/m);

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.match(currentProducer, /^description: "Use when handling \\"demo\\" producer work\."$/m);

    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.match(currentFinalizer, /^description: "Use when closing \\"demo\\" cycles\."$/m);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration preserves multiline block-scalar descriptions", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        "description: >",
        "  Use when handling demo work",
        "  across multiple migrations.",
        "user-invocable: false",
        "---",
        "",
        "# Demo Skill",
        "",
        "## Design Thinking",
        "",
        "Own custom demo release packaging.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        "description: |",
        "  Use when handling demo producer work.",
        "  Preserve current contracts.",
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Producer",
        "",
        "Producer identity.",
        "",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        "description: >",
        "  Use when closing demo cycles",
        "  after verified release work.",
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "Finalizer intro.",
        "",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    runAutoSetup(target, ["--migration"]);

    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.match(
      currentSkill,
      /^description: "Use when handling demo work across multiple migrations\."$/m,
    );

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.ok(
      currentProducer.includes('description: "Use when handling demo producer work.\\nPreserve current contracts."'),
    );

    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.match(
      currentFinalizer,
      /^description: "Use when closing demo cycles after verified release work\."$/m,
    );
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration preserves block-scalar descriptions with indentation indicators", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        "description: >2",
        "  Use when handling demo work",
        "  across indentation-aware migrations.",
        "user-invocable: false",
        "---",
        "",
        "# Demo Skill",
        "",
        "## Design Thinking",
        "",
        "Own custom demo release packaging.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        'description: "Use when handling demo producer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Producer",
        "",
        "Producer identity.",
        "",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        "description: |1-",
        " Use when closing demo cycles.",
        " Keep release notes coherent.",
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "Finalizer intro.",
        "",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    runAutoSetup(target, ["--migration"]);

    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.match(
      currentSkill,
      /^description: "Use when handling demo work across indentation-aware migrations\."$/m,
    );

    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.ok(
      currentFinalizer.includes('description: "Use when closing demo cycles.\\nKeep release notes coherent."'),
    );
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration preserves inline extra skills in source agent frontmatter", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        'description: "Use when maintaining custom demo build scripts."',
        "user-invocable: false",
        "---",
        "",
        "# Demo Skill",
        "",
        "## Design Thinking",
        "",
        "Own custom demo release packaging.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      [
        "---",
        "name: harness-demo-producer",
        'description: "Use when handling demo producer work."',
        "skills: [harness-demo, harness-context, demo-domain] # keep extra skill",
        "---",
        "",
        "# Demo Producer",
        "",
        "Producer identity.",
        "",
        "## Principles",
        "",
        "1. Preserve demo packaging context.",
        "",
        "## Task",
        "",
        "1. Maintain custom build scripts.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      [
        "---",
        "name: harness-demo-reviewer",
        'description: "Use when auditing demo reviewer work."',
        "skills:",
        "  - harness-demo",
        "  - harness-context",
        "---",
        "",
        "# Demo Reviewer",
        "",
        "Reviewer identity.",
        "",
        "## Principles",
        "",
        "1. Check fixture snapshots carefully.",
        "",
        "## Task",
        "",
        "1. Audit fixture snapshots.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        'description: "Use when closing demo cycles."',
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "Finalizer intro.",
        "",
        "## Principles",
        "",
        "1. Keep release notes coherent.",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    runAutoSetup(target, ["--migration"]);

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.match(
      currentProducer,
      /^skills:\n  - harness-demo\n  - harness-context\n  - demo-domain$/m,
    );
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration rejects a fresh target", () => {
  const target = makeTempDir();
  try {
    writeFileSync(join(target, "README.md"), "# Demo\n");

    const result = runNode(AUTO_SETUP_SCRIPT, ["--migration"], { cwd: target });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--migration requires existing \.harness\/loom or \.harness\/cycle state/);
    assert.equal(existsSync(join(target, ".harness")), false);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup skips registry pairs that reuse foundation slugs before reconstruction writes", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const originalPlanner = readFileSync(join(target, ".harness/loom/agents/harness-planner.md"), "utf8");
    const originalContext = readFileSync(join(target, ".harness/loom/skills/harness-context/SKILL.md"), "utf8");
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-bad: producer `harness-planner` ↔ reviewer `harness-bad-reviewer`, skill `harness-context`",
        "",
      ].join("\n"),
    );

    const { summary } = runAutoSetup(target);

    assert.equal(summary.convergence.pairReconstructions.length, 1);
    assert.equal(summary.convergence.pairReconstructions[0].status, "skipped");
    assert.match(
      summary.convergence.pairReconstructions[0].reason,
      /producer slug is reserved for a foundation or singleton role: harness-planner/,
    );
    assert.equal(
      readFileSync(join(target, ".harness/loom/agents/harness-planner.md"), "utf8"),
      originalPlanner,
    );
    assert.equal(
      readFileSync(join(target, ".harness/loom/skills/harness-context/SKILL.md"), "utf8"),
      originalContext,
    );
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-bad-reviewer.md")), false);
    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    assert.doesNotMatch(registry, /^- harness-bad:/m);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup skips registry pairs with shared or colliding reconstruction artifacts", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-alpha: producer `harness-alpha-producer` ↔ reviewer `harness-shared-reviewer`, skill `harness-shared`",
        "- harness-beta: producer `harness-beta-producer` ↔ reviewer `harness-shared-reviewer`, skill `harness-shared`",
        "- harness-collision: producer `harness-collision-agent` ↔ reviewer `harness-collision-agent`, skill `harness-collision`",
        "",
      ].join("\n"),
    );

    const { summary } = runAutoSetup(target);
    const byPair = Object.fromEntries(
      summary.convergence.pairReconstructions.map((reconstruction) => [reconstruction.pair, reconstruction]),
    );

    assert.equal(summary.convergence.pairReconstructions.length, 3);
    assert.equal(byPair["harness-alpha"].status, "skipped");
    assert.equal(byPair["harness-beta"].status, "skipped");
    assert.equal(byPair["harness-collision"].status, "skipped");
    assert.match(byPair["harness-alpha"].reason, /skill slug is shared by multiple pair entries.*harness-shared/);
    assert.match(byPair["harness-beta"].reason, /skill slug is shared by multiple pair entries.*harness-shared/);
    assert.match(
      byPair["harness-collision"].reason,
      /producer and reviewer share the same agent slug: harness-collision-agent/,
    );
    assert.equal(existsSync(join(target, ".harness/loom/skills/harness-shared/SKILL.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-shared-reviewer.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-collision-agent.md")), false);
    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    assert.doesNotMatch(registry, /^- harness-alpha:/m);
    assert.doesNotMatch(registry, /^- harness-beta:/m);
    assert.doesNotMatch(registry, /^- harness-collision:/m);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup reconstructs customized finalizer on current skeleton", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      [
        "---",
        "name: harness-finalizer",
        "skills:",
        "  - harness-context",
        "---",
        "",
        "# Finalizer",
        "",
        "## Task",
        "",
        "1. Refresh docs/ and CHANGELOG.md after verified release work.",
        "",
        "## Output Format",
        "",
        "Status: PASS / FAIL",
        "Summary: release docs refreshed",
        "Self-verification: docs and changelog checked",
        "",
      ].join("\n"),
    );

    const { summary } = runAutoSetup(target);
    const manifest = readJson(summary.snapshot.manifestPath);

    assert.equal(summary.finalizerSummary.status, "customized");
    assert.equal(summary.finalizerSummary.customized, true);
    assert.ok(summary.finalizerSummary.signals.includes("docs"));
    assert.equal(manifest.finalizerSummary.status, "customized");
    assert.match(manifest.finalizerSummary.recommendation, /snapshot finalizer as intent evidence/);
    assert.match(readFileSync(join(summary.snapshot.path, "loom/agents/harness-finalizer.md"), "utf8"), /CHANGELOG/);

    assert.equal(summary.convergence.finalizerReconstruction.status, "reconstructed");
    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.match(currentFinalizer, /The finalizer is a \*\*singleton cycle-end role\*\*/);
    assert.match(currentFinalizer, /### Preserved Intent Evidence/);
    assert.match(currentFinalizer, /CHANGELOG/);
    assert.match(currentFinalizer, /Files left alone \(intentionally\)/);
    assert.match(currentFinalizer, /Status: PASS \/ FAIL/);
    assert.match(currentFinalizer, /Self-verification:/);
    assert.match(currentFinalizer, /Blocked or out-of-scope items: \[\{item, reason\}\]/);
    assert.match(currentFinalizer, /## Structural Issue/);
    assert.match(currentFinalizer, /Suspected upstream stage:\s*planner/i);
    assert.doesNotMatch(currentFinalizer, /^(Suggested next-work|Advisory-next|Regression gate|Escalation):/m);
    assert.doesNotMatch(currentFinalizer, /^Verdict: PASS \/ FAIL$/m);
    assert.doesNotMatch(currentFinalizer, /^Criteria:/m);
    assert.doesNotMatch(currentFinalizer, /^FAIL items:/m);
    assert.doesNotMatch(currentFinalizer, /Summary: release docs refreshed/);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup rerun allocates a new snapshot and keeps reconstructed pair idempotent", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    writeFileSync(
      join(target, ".harness/loom/skills/harness-demo/SKILL.md"),
      [
        "---",
        "name: harness-demo",
        'description: "Use when maintaining demo workflows."',
        "user-invocable: false",
        "---",
        "",
        "# Demo",
        "",
        "## Methodology",
        "",
        "Preserve deterministic demo workflow evidence.",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-producer.md"),
      "---\nname: harness-demo-producer\n---\n\n# Producer\n\n## Task\n\n1. Produce demo workflow changes.\n",
    );
    writeFileSync(
      join(target, ".harness/loom/agents/harness-demo-reviewer.md"),
      "---\nname: harness-demo-reviewer\n---\n\n# Reviewer\n\n## Task\n\n1. Review demo workflow changes.\n",
    );
    writeFileSync(
      join(target, ".harness/loom/registry.md"),
      [
        "# Registry",
        "",
        "## Registered pairs",
        "",
        "- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`",
        "",
      ].join("\n"),
    );

    const first = runAutoSetup(target).summary;
    const skillAfterFirst = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    const agentBodiesAfterFirst = readAgentBodies(target, [
      "harness-demo-producer",
      "harness-demo-reviewer",
    ]);
    const registryAfterFirst = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");

    const second = runAutoSetup(target).summary;
    const skillAfterSecond = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    const agentBodiesAfterSecond = readAgentBodies(target, [
      "harness-demo-producer",
      "harness-demo-reviewer",
    ]);
    const registryAfterSecond = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");

    assert.notEqual(first.snapshot.path, second.snapshot.path);
    assert.ok(existsSync(first.snapshot.path));
    assert.ok(existsSync(second.snapshot.path));
    assert.equal(skillAfterSecond, skillAfterFirst);
    assert.deepEqual(agentBodiesAfterSecond, agentBodiesAfterFirst);
    assertReconstructedProducerAgent(agentBodiesAfterSecond["harness-demo-producer"], {
      pair: "harness-demo",
      skill: "harness-demo",
      producer: "harness-demo-producer",
    });
    assertReconstructedReviewerAgent(agentBodiesAfterSecond["harness-demo-reviewer"], {
      pair: "harness-demo",
      skill: "harness-demo",
      reviewer: "harness-demo-reviewer",
    });
    assert.equal(registryAfterSecond, registryAfterFirst);
    assert.equal(registryAfterSecond.match(/^- harness-demo:/gm).length, 1);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup warns and snapshots active cycle before discard and reseed", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const statePath = join(target, ".harness/cycle/state.md");
    const activeState = readFileSync(statePath, "utf8").replace("loop: false", "loop: true");
    writeFileSync(statePath, `<!-- active-cycle-sentinel -->\n${activeState}`);

    const { result, summary } = runAutoSetup(target);
    const manifest = readJson(summary.snapshot.manifestPath);

    assert.match(result.stderr, /warning .*Existing cycle classified as active/);
    assert.equal(summary.activeCycle.classification, "active");
    assert.equal(manifest.activeCycle.classification, "active");
    assert.ok(summary.warnings[0].includes("discarded/reseeded"));
    assert.match(readFileSync(join(summary.snapshot.path, "cycle/state.md"), "utf8"), /active-cycle-sentinel/);

    const currentState = readFileSync(statePath, "utf8");
    assert.doesNotMatch(currentState, /active-cycle-sentinel/);
    assert.match(currentState, /^loop: false$/m);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup warns and preserves unknown cycle before discard and reseed", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const cycleDir = join(target, ".harness/cycle");
    const statePath = join(cycleDir, "state.md");
    writeFileSync(join(cycleDir, "unknown-cycle-sentinel.txt"), "preserve me\n");
    rmSync(statePath);

    const { result, summary } = runAutoSetup(target);
    const manifest = readJson(summary.snapshot.manifestPath);

    assert.match(result.stderr, /warning .*Existing cycle classified as unknown/);
    assert.equal(summary.activeCycle.classification, "unknown");
    assert.equal(manifest.activeCycle.classification, "unknown");
    assert.match(readFileSync(join(summary.snapshot.path, "cycle/unknown-cycle-sentinel.txt"), "utf8"), /preserve me/);

    assert.ok(existsSync(statePath));
    assert.ok(!existsSync(join(cycleDir, "unknown-cycle-sentinel.txt")));
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});
