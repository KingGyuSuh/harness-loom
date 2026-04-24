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

test("auto-setup fresh target installs foundation and prints explicit sync command", () => {
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
    assert.equal(summary.convergence.pairOperations.length, 0);
    assert.equal(summary.convergence.finalizerOperation.status, "default-noop");
    assert.equal(summary.convergence.setupAuthoring.required, true);
    assert.equal(summary.convergence.setupAuthoring.scriptPhaseOnly, true);
    assert.match(summary.convergence.setupAuthoring.expectedNextWork, /author the initial registered pair roster/);
    assert.equal(summary.convergence.pairRecommendationDetails[0].pair, null);
    assert.match(summary.convergence.pairRecommendations[0], /LLM project analysis/);
    assert.match(summary.convergence.note, /authoring concrete pair\/finalizer configuration/);
    assert.match(summary.nextAction, /Continue setup by inspecting the project/);
    assert.match(summary.nextAction, /after that authoring is complete/);
    assert.match(summary.nextAction, /node \.harness\/loom\/sync\.ts --provider codex/);
    assert.ok(existsSync(join(target, ".harness/loom/sync.ts")));
    assert.ok(existsSync(join(target, ".harness/cycle/state.md")));
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-document-producer.md")), false);
    assert.doesNotMatch(readFileSync(join(target, ".harness/loom/registry.md"), "utf8"), /^- harness-document:/m);
    assert.match(
      readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8"),
      /no cycle-end work registered for this project/,
    );
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup requires LLM analysis before fresh pair authoring", () => {
  const target = makeTempDir();
  try {
    writeFileSync(join(target, "README.md"), "# Harness Loom Like\n");
    mkdirSync(join(target, "plugins/harness-loom/skills/harness-init/scripts"), { recursive: true });
    mkdirSync(join(target, "plugins/harness-loom/skills/harness-auto-setup"), { recursive: true });
    mkdirSync(join(target, "plugins/harness-loom/skills/harness-pair-dev/scripts"), { recursive: true });
    writeFileSync(join(target, "plugins/harness-loom/skills/harness-init/SKILL.md"), "# init\n");
    writeFileSync(join(target, "plugins/harness-loom/skills/harness-auto-setup/SKILL.md"), "# setup\n");
    writeFileSync(join(target, "plugins/harness-loom/skills/harness-pair-dev/SKILL.md"), "# pair\n");
    writeFileSync(join(target, "plugins/harness-loom/skills/harness-init/scripts/sync.ts"), "// sync\n");
    writeFileSync(join(target, "plugins/harness-loom/skills/harness-pair-dev/scripts/pair-dev.ts"), "// pair\n");

    const { summary } = runAutoSetup(target, ["--setup"]);

    assert.equal(summary.convergence.pairOperations.length, 0);
    assert.equal(summary.convergence.pairRecommendationDetails.length, 1);
    assert.match(summary.convergence.setupAuthoring.questionPolicy, /at most three concise questions/);
    assert.equal(summary.convergence.pairRecommendationDetails[0].pair, null);
    assert.equal(summary.convergence.pairRecommendationDetails[0].command, null);
    assert.match(summary.convergence.pairRecommendationDetails[0].rationale, /LLM project analysis/);
    assert.match(summary.convergence.pairRecommendationDetails[0].rationale, /authoring pair axes/);
    assert.ok(summary.convergence.pairRecommendationDetails[0].evidence.includes("README.md"));
    assert.doesNotMatch(summary.convergence.pairRecommendations.join("\n"), /harness-document/);
    assert.doesNotMatch(summary.convergence.pairRecommendations.join("\n"), /harness-verification/);
    assert.doesNotMatch(summary.convergence.pairRecommendations.join("\n"), /harness-runtime-contract/);
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

test("auto-setup on an existing target leaves the foundation and provider trees untouched", () => {
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
      [".harness/loom", snapshotTree(join(target, ".harness/loom"))],
      [".harness/cycle", snapshotTree(join(target, ".harness/cycle"))],
      [".claude", snapshotTree(join(target, ".claude"))],
      [".codex", snapshotTree(join(target, ".codex"))],
      [".gemini", snapshotTree(join(target, ".gemini"))],
    ]);

    const { summary } = runAutoSetup(target, ["--setup", "--provider", "claude,gemini"]);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.install.skipped, true);
    assert.equal(summary.convergence.mode, "setup-inspection-authoring-required");
    assert.match(summary.convergence.note, /left the foundation untouched/);
    assert.equal(summary.convergence.pairOperations.length, 0);
    assert.equal(summary.convergence.finalizerOperation.status, "skipped");
    assert.equal(summary.convergence.setupAuthoring.required, true);
    assert.match(summary.convergence.setupAuthoring.expectedNextWork, /author additive registered pairs/);
    assert.match(summary.convergence.pairRecommendations[0], /script phase leaves the foundation unchanged/);
    assert.match(summary.convergence.pairRecommendations[0], /author the needed pair\/finalizer configuration/);
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider claude,gemini");
    assert.match(summary.nextAction, /Continue setup by inspecting the project and existing roster/);
    assert.match(summary.nextAction, /author only additive pair\/finalizer changes/);
    assert.match(summary.nextAction, /after that authoring is complete/);
    assert.match(summary.nextAction, /node \.harness\/loom\/sync\.ts --provider claude,gemini/);
    assert.deepEqual(summary.providerTreesWritten, []);
    for (const platformDir of [".harness/loom", ".harness/cycle", ".claude", ".codex", ".gemini"]) {
      assertTreeUnchanged(before.get(platformDir), join(target, platformDir));
    }
    assert.ok(!existsSync(join(target, ".harness/_snapshots")));
    assert.ok(!existsSync(join(target, ".claude/agents/harness-planner.md")));
    assert.ok(!existsSync(join(target, ".codex/hooks.json")));
    assert.ok(!existsSync(join(target, ".gemini/agents/harness-planner.md")));
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup setup mode directs cycle-only targets to migration before sync", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    rmSync(join(target, ".harness/loom"), { recursive: true, force: true });

    const { summary } = runAutoSetup(target, ["--setup", "--provider", "codex"]);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.install.skipped, true);
    assert.equal(summary.convergence.mode, "setup-cycle-only-migration-required");
    assert.match(summary.convergence.note, /\.harness\/cycle without \.harness\/loom/);
    assert.equal(summary.convergence.setupAuthoring.required, false);
    assert.equal(summary.convergence.setupAuthoring.blocked, true);
    assert.match(summary.convergence.setupAuthoring.expectedNextWork, /\/harness-auto-setup --migration --provider codex/);
    assert.match(summary.convergence.pairRecommendations[0], /without \.harness\/loom/);
    assert.match(summary.convergence.finalizerRecommendation, /No \.harness\/loom foundation is present/);
    assert.match(summary.nextAction, /\/harness-auto-setup --migration --provider codex/);
    assert.doesNotMatch(summary.nextAction, /node \.harness\/loom\/sync\.ts/);
    assert.equal(existsSync(join(target, ".harness/loom")), false);
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup restores non-pair custom loom skills and agents after reseed", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".harness/loom/skills/harness-demo"), { recursive: true });
    mkdirSync(join(target, ".harness/loom/skills/my-playbook"), { recursive: true });
    writeFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "# Demo Pair Skill\n");
    writeFileSync(join(target, ".harness/loom/skills/my-playbook/SKILL.md"), "# Custom Playbook\n");
    writeFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "# Demo Producer\n");
    writeFileSync(join(target, ".harness/loom/agents/harness-demo-reviewer.md"), "# Demo Reviewer\n");
    writeFileSync(join(target, ".harness/loom/agents/my-helper.md"), "# Custom Helper\n");
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

    assert.deepEqual(summary.convergence.restoredCustomEntries.skills, ["my-playbook"]);
    assert.deepEqual(summary.convergence.restoredCustomEntries.agents, ["my-helper.md"]);
    assert.deepEqual(summary.convergence.restoredCustomEntries.skipped, []);
    assert.match(readFileSync(join(target, ".harness/loom/skills/my-playbook/SKILL.md"), "utf8"), /Custom Playbook/);
    assert.match(readFileSync(join(target, ".harness/loom/agents/my-helper.md"), "utf8"), /Custom Helper/);
    assert.equal(summary.convergence.pairOperations[0].pair, "harness-demo");
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup setup mode preserves registered pairs before additive authoring", () => {
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
      "## Approach",
      "",
      "Keep custom build scripts and fixture snapshots aligned.",
      "",
      "## Rollout Plan",
      "",
      "Preserve fixture promotion steps.",
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

    const loomBefore = snapshotTree(join(target, ".harness/loom"));
    const cycleBefore = snapshotTree(join(target, ".harness/cycle"));
    const { summary } = runAutoSetup(target, ["--setup"]);

    assert.equal(summary.mode, "setup");
    assert.equal(summary.targetState, "existing");
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.install.skipped, true);
    assert.equal(summary.convergence.mode, "setup-inspection-authoring-required");
    assert.equal(summary.convergence.pairOperations.length, 0);
    assert.equal(summary.convergence.finalizerOperation.status, "skipped");
    assert.match(summary.convergence.setupAuthoring.stopCondition, /Stop without authoring only/);
    assert.match(summary.convergence.pairRecommendationDetails[0].rationale, /script phase leaves them unchanged/);
    assert.match(summary.convergence.pairRecommendationDetails[0].rationale, /author only additive pair\/finalizer changes/);
    assert.match(summary.convergence.pairRecommendationDetails[0].rationale, /Use --migration/);
    assertTreeUnchanged(loomBefore, join(target, ".harness/loom"));
    assertTreeUnchanged(cycleBefore, join(target, ".harness/cycle"));

    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.equal(currentSkill, oldSkill);

    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    assert.match(
      registry,
      /- harness-demo: producer `harness-demo-producer` ↔ reviewers \[`harness-demo-reviewer`, `harness-demo-security-reviewer`\], skill `harness-demo`/,
    );
    assert.equal(registry.match(/^- harness-demo:/gm).length, 1);
    assert.ok(!existsSync(join(target, ".harness/_snapshots")));
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
      "## Approach",
      "",
      "Keep custom build scripts and fixture snapshots aligned.",
      "",
      "## Rollout Plan",
      "",
      "Preserve fixture promotion steps.",
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
        "## Rollout Plan",
        "",
        "Keep demo release packaging sequenced.",
        "",
        "```markdown",
        "## Output Format",
        "fenced producer example should survive",
        "```",
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
        "## Review Notes",
        "",
        "Escalate packaging drift.",
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
        "## Output Format",
        "",
        "Status: PASS / FAIL",
        "Summary: stale finalizer block",
        "",
        "```markdown",
        "## Structural Issue",
        "- legacy fenced example",
        "```",
        "",
        "## Release Checklist",
        "",
        "Keep release notes and docs aligned.",
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
    assert.equal(summary.convergence.pairOperations[0].status, "migrated");
    assert.equal(summary.convergence.setupAuthoring, null);
    assert.equal(summary.convergence.pairOperations[0].source.kind, "snapshot");
    assert.match(summary.convergence.pairOperations[0].replaced.join("\n"), /frontmatter skills/);
    assert.doesNotMatch(
      summary.convergence.pairOperations[0].replaced.join("\n"),
      /current runtime trigger descriptions/,
    );
    assert.equal(summary.convergence.migrationPlan.pairs[0].pair, "harness-demo");
    assert.match(summary.convergence.migrationPlan.pairs[0].overlayMethodology, /from-overlay\.md/);
    assert.ok(summary.convergence.migrationPlan.pairs[0].userSurfaces.includes("skill:Approach"));
    assert.ok(summary.convergence.migrationPlan.pairs[0].userSurfaces.includes("skill:Rollout Plan"));
    assert.match(summary.convergence.migrationPlan.finalizer.overlayMethodology, /finalizer-overlay\.md/);
    const currentSkill = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    assert.match(currentSkill, /Own custom demo release packaging/);
    assert.match(currentSkill, /## Approach/);
    assert.match(currentSkill, /Keep custom build scripts and fixture snapshots aligned/);
    assert.match(currentSkill, /## Rollout Plan/);
    assert.match(currentSkill, /Preserve fixture promotion steps/);
    assert.doesNotMatch(currentSkill, /### Preserved Snapshot Intent/);

    const currentProducer = readFileSync(join(target, ".harness/loom/agents/harness-demo-producer.md"), "utf8");
    assert.match(currentProducer, /Producer identity that should survive migration/);
    assert.match(currentProducer, /1\. Maintain custom build scripts\./);
    assert.match(currentProducer, /## Rollout Plan/);
    assert.match(currentProducer, /Keep demo release packaging sequenced/);
    assert.match(currentProducer, /fenced producer example should survive/);
    assert.match(currentProducer, /^skills:\n  - harness-demo\n  - harness-context\n  - demo-domain$/m);
    assert.match(currentProducer, /^Status: PASS \/ FAIL$/m);
    assert.doesNotMatch(currentProducer, /Summary: legacy block/);

    const currentReviewer = readFileSync(join(target, ".harness/loom/agents/harness-demo-reviewer.md"), "utf8");
    assert.match(currentReviewer, /Reviewer identity that should survive migration/);
    assert.match(currentReviewer, /1\. Audit fixture snapshots\./);
    assert.match(currentReviewer, /## Review Notes/);
    assert.match(currentReviewer, /Escalate packaging drift/);
    assert.match(currentReviewer, /^Verdict: PASS \/ FAIL$/m);

    assert.equal(summary.convergence.finalizerOperation.status, "migrated");
    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.match(currentFinalizer, /Finalizer intro that should survive migration/);
    assert.match(currentFinalizer, /Refresh docs\/ and CHANGELOG\.md after verified release work/);
    assert.match(currentFinalizer, /## Release Checklist/);
    assert.match(currentFinalizer, /Keep release notes and docs aligned/);
    assert.doesNotMatch(currentFinalizer, /Summary: stale finalizer block/);
    assert.doesNotMatch(currentFinalizer, /legacy fenced example/);
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

test("auto-setup skips registry pairs that reuse foundation slugs before migration writes", () => {
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

    const { summary } = runAutoSetup(target, ["--migration"]);

    assert.equal(summary.convergence.pairOperations.length, 1);
    assert.equal(summary.convergence.pairOperations[0].status, "skipped");
    assert.match(
      summary.convergence.pairOperations[0].reason,
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

test("auto-setup skips registry pairs with shared or colliding migration artifacts", () => {
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

    const { summary } = runAutoSetup(target, ["--migration"]);
    const byPair = Object.fromEntries(
      summary.convergence.pairOperations.map((operation) => [operation.pair, operation]),
    );

    assert.equal(summary.convergence.pairOperations.length, 3);
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

test("auto-setup setup mode leaves customized finalizer unchanged", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const customFinalizer = [
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
    ].join("\n");
    writeFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      customFinalizer,
    );

    const { summary } = runAutoSetup(target, ["--setup"]);

    assert.equal(summary.finalizerSummary.status, "customized");
    assert.equal(summary.finalizerSummary.customized, true);
    assert.ok(summary.finalizerSummary.signals.includes("docs"));
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.install.skipped, true);
    assert.equal(summary.convergence.finalizerOperation.status, "skipped");
    assert.match(summary.convergence.finalizerRecommendation, /left unchanged/);
    const currentFinalizer = readFileSync(join(target, ".harness/loom/agents/harness-finalizer.md"), "utf8");
    assert.equal(currentFinalizer, customFinalizer);
    assert.ok(!existsSync(join(target, ".harness/_snapshots")));
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup migration rerun allocates a new snapshot and keeps migrated pair idempotent", () => {
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

    const first = runAutoSetup(target, ["--migration"]).summary;
    const skillAfterFirst = readFileSync(join(target, ".harness/loom/skills/harness-demo/SKILL.md"), "utf8");
    const agentBodiesAfterFirst = readAgentBodies(target, [
      "harness-demo-producer",
      "harness-demo-reviewer",
    ]);
    const registryAfterFirst = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");

    const second = runAutoSetup(target, ["--migration"]).summary;
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
    assert.match(
      agentBodiesAfterSecond["harness-demo-producer"],
      /^skills:\n  - harness-demo\n  - harness-context$/m,
    );
    assert.match(agentBodiesAfterSecond["harness-demo-producer"], /1\. Produce demo workflow changes\./);
    assert.match(agentBodiesAfterSecond["harness-demo-producer"], /^## Output Format$/m);
    assert.match(agentBodiesAfterSecond["harness-demo-producer"], /Status: PASS \/ FAIL/);
    assert.match(
      agentBodiesAfterSecond["harness-demo-reviewer"],
      /^skills:\n  - harness-demo\n  - harness-context$/m,
    );
    assert.match(agentBodiesAfterSecond["harness-demo-reviewer"], /1\. Review demo workflow changes\./);
    assert.match(agentBodiesAfterSecond["harness-demo-reviewer"], /^## Output Format$/m);
    assert.match(agentBodiesAfterSecond["harness-demo-reviewer"], /Verdict: PASS \/ FAIL/);
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

    const { result, summary } = runAutoSetup(target, ["--migration"]);
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

    const { result, summary } = runAutoSetup(target, ["--migration"]);
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
