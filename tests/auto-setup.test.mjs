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
  const r = runNode(AUTO_SETUP_SCRIPT, [target, ...extraArgs]);
  assert.equal(r.status, 0, r.stderr);
  return { result: r, summary: JSON.parse(r.stdout) };
}

function installTo(target) {
  const r = runNode(INSTALL_SCRIPT, [target]);
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
  assert.match(body, /Remaining items: \[\{items not yet done\}\]/);
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

    const { summary } = runAutoSetup(target, ["--provider", "codex"]);

    assert.equal(summary.mode, "fresh");
    assert.equal(summary.snapshot.created, false);
    assert.equal(summary.activeCycle.classification, "absent");
    assert.equal(summary.install.summary.verification.ok, true);
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider codex");
    assert.deepEqual(summary.providerTreesWritten, []);
    assert.match(summary.convergence.pairRecommendations.join("\n"), /documentation evidence/);
    assert.ok(existsSync(join(target, ".harness/loom/sync.ts")));
    assert.ok(existsSync(join(target, ".harness/cycle/state.md")));
    assertNoProviderTrees(target);
  } finally {
    cleanupDir(target);
  }
});

test("auto-setup rejects unknown flags before writing harness state", () => {
  const target = makeTempDir();
  try {
    const r = runNode(AUTO_SETUP_SCRIPT, [target, "--force"]);
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

    const { summary } = runAutoSetup(target, ["--provider", "claude,gemini"]);

    assert.equal(summary.mode, "existing");
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

    const { summary } = runAutoSetup(target);
    const manifest = readJson(summary.snapshot.manifestPath);

    assert.equal(summary.mode, "existing");
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
    assert.match(currentFinalizer, /Remaining items: \[\{items not yet done\}\]/);
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
