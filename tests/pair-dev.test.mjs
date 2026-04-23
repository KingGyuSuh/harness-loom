import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  INSTALL_SCRIPT,
  PAIR_DEV_SCRIPT,
  REPO_ROOT,
  REGISTER_PAIR_SCRIPT,
  cleanupDir,
  makeTempDir,
  runNode,
} from "./helpers.mjs";

function installTo(target) {
  const result = runNode(INSTALL_SCRIPT, [], { cwd: target });
  assert.equal(result.status, 0, result.stderr);
}

function runPairDev(target, args) {
  return runNode(PAIR_DEV_SCRIPT, args, { cwd: target });
}

function registerPair(target, { pair, producer, reviewers, skill }) {
  const args = [
    "--target", target,
    "--pair", pair,
    "--producer", producer,
    "--skill", skill,
  ];
  for (const reviewer of reviewers) args.splice(args.length - 2, 0, "--reviewer", reviewer);
  const result = runNode(REGISTER_PAIR_SCRIPT, args);
  assert.equal(result.status, 0, result.stderr);
}

function writePairFiles(target, { producer, reviewers, skill }) {
  const agentsDir = join(target, ".harness/loom/agents");
  const skillDir = join(target, ".harness/loom/skills", skill);
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(agentsDir, `${producer}.md`),
    `---\nname: ${producer}\n---\n\n# Producer\n`,
  );
  for (const reviewer of reviewers) {
    writeFileSync(
      join(agentsDir, `${reviewer}.md`),
      `---\nname: ${reviewer}\n---\n\n# Reviewer\n`,
    );
  }
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skill}\nuser-invocable: false\n---\n\n# ${skill}\n`,
  );
}

function registryBody(target) {
  return readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
}

function snapshotFiles(paths) {
  return new Map(paths.map((path) => [path, readFileSync(path, "utf8")]));
}

function assertFilesUnchanged(snapshot) {
  for (const [path, body] of snapshot) {
    assert.equal(readFileSync(path, "utf8"), body, `${path} should be unchanged`);
  }
}

function snapshotTree(root) {
  const entries = new Map();

  function walk(path) {
    if (!existsSync(path)) {
      entries.set(path, { type: "missing" });
      return;
    }
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries.set(path, { type: "dir" });
      for (const name of readdirSync(path).sort()) {
        walk(join(path, name));
      }
      return;
    }
    if (stat.isFile()) {
      entries.set(path, { type: "file", body: readFileSync(path, "utf8") });
      return;
    }
    entries.set(path, { type: "other" });
  }

  walk(root);
  return entries;
}

function snapshotTrees(roots) {
  return new Map(roots.map((root) => [root, snapshotTree(root)]));
}

function assertTreeSnapshotUnchanged(root, before) {
  const after = snapshotTree(root);
  assert.deepEqual(
    [...after.keys()].sort(),
    [...before.keys()].sort(),
    `${root} file list should be unchanged`,
  );
  for (const [path, entry] of before) {
    assert.deepEqual(after.get(path), entry, `${path} should be unchanged`);
  }
}

function assertTreesUnchanged(snapshots) {
  for (const [root, before] of snapshots) {
    assertTreeSnapshotUnchanged(root, before);
  }
}

function noWriteSnapshotRoots(target) {
  return [
    join(target, ".harness/loom"),
    join(target, ".claude"),
    join(target, ".codex"),
    join(target, ".gemini"),
  ];
}

function writeCycleHistoryFixture(target) {
  const statePath = join(target, ".harness/cycle/state.md");
  const eventsPath = join(target, ".harness/cycle/events.md");
  const taskDir = join(target, ".harness/cycle/epics/EP-1--history/tasks");
  const reviewDir = join(target, ".harness/cycle/epics/EP-1--history/reviews");
  const laterTaskDir = join(target, ".harness/cycle/epics/EP-2--later/tasks");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  mkdirSync(laterTaskDir, { recursive: true });
  writeFileSync(
    statePath,
    [
      "# Runtime State",
      "",
      "Goal (from goals.md): preserve history",
      "Phase: harness-other-producer",
      "loop: false",
      "planner-continuation: none",
      "",
      "## Next",
      "To: harness-other-producer",
      "EPIC: EP-2--later",
      "Task path: .harness/cycle/epics/EP-2--later/tasks/T001--later.md",
      "Intent: Continue unrelated work.",
      "Prior tasks:",
      "- .harness/cycle/epics/EP-1--history/tasks/T001--harness-remove-producer.md",
      "Prior reviews:",
      "- .harness/cycle/epics/EP-1--history/reviews/T001--harness-remove-reviewer.md",
      "",
      "## EPIC summaries",
      "",
      "### EP-1--history",
      "outcome: historical removed-pair evidence remains readable",
      "upstream: none",
      "roster: harness-other-producer",
      "current: done",
      "note: history complete",
      "",
      "### EP-2--later",
      "outcome: unrelated work remains active",
      "upstream: none",
      "roster: harness-other-producer",
      "current: harness-other-producer",
      "note: unrelated active EPIC",
      "",
    ].join("\n"),
  );
  writeFileSync(
    eventsPath,
    [
      "# Events",
      "",
      "- 2026-04-22T00:00:00Z task=T001 role=harness-remove-producer outcome=PASS path=.harness/cycle/epics/EP-1--history/tasks/T001--harness-remove-producer.md",
      "- 2026-04-22T00:01:00Z task=T001 role=harness-remove-reviewer outcome=PASS path=.harness/cycle/epics/EP-1--history/reviews/T001--harness-remove-reviewer.md",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(taskDir, "T001--harness-remove-producer.md"),
    "Historical task content from harness-remove-producer must survive pair removal.\n",
  );
  writeFileSync(
    join(reviewDir, "T001--harness-remove-reviewer.md"),
    "Historical review content from harness-remove-reviewer must survive pair removal.\n",
  );
  writeFileSync(
    join(laterTaskDir, ".gitkeep"),
    "epic directory marker survives pair removal\n",
  );
}

function extractMarkdownSection(raw, heading) {
  const marker = `### ${heading}`;
  const start = raw.indexOf(`${marker}\n`);
  assert.notEqual(start, -1, `missing ${marker}`);
  const bodyStart = start + marker.length + 1;
  const next = raw.indexOf("\n### ", bodyStart);
  return raw.slice(bodyStart, next === -1 ? raw.length : next);
}

test("pair-dev SKILL anchors the v0.3.0 clean-break command surface", () => {
  const skill = readFileSync(
    join(REPO_ROOT, "plugins/harness-loom/skills/harness-pair-dev/SKILL.md"),
    "utf8",
  );
  const commandSurface = extractMarkdownSection(skill, "2. Command surface");

  assert.match(
    commandSurface,
    /^\/harness-pair-dev --add <pair-slug> "<purpose>" \[--from <source>\] \[--reviewer <slug> \.\.\.\] \[--before <pair-slug> \| --after <pair-slug>\]$/m,
  );
  assert.match(
    commandSurface,
    /^\/harness-pair-dev --improve <pair-slug> "<purpose>" \[--before <pair-slug> \| --after <pair-slug>\]$/m,
  );
  assert.match(commandSurface, /^\/harness-pair-dev --remove <pair-slug>$/m);
  assert.doesNotMatch(commandSurface, /--hint|--split/);
  assert.match(skill, /Treat legacy `--split` and `--hint` as unsupported v0\.3\.0 surface/);
});

test("pair-dev --remove unregisters a pair, deletes owned loom files, and preserves cycle history", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const pair = {
      pair: "harness-remove",
      producer: "harness-remove-producer",
      reviewers: ["harness-remove-reviewer"],
      skill: "harness-remove",
    };
    registerPair(target, pair);
    writePairFiles(target, pair);
    writeCycleHistoryFixture(target);
    const cycleSnapshot = snapshotTree(join(target, ".harness/cycle"));

    const result = runPairDev(target, ["--remove", "harness-remove"]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.action, "remove");
    assert.equal(summary.cycleHistoryPreserved, true);
    assert.deepEqual(summary.providerTreesWritten, []);
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider <list>");
    assert.doesNotMatch(registryBody(target), /^- harness-remove:/m);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-remove-producer.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-remove-reviewer.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/skills/harness-remove")), false);
    assertTreeSnapshotUnchanged(join(target, ".harness/cycle"), cycleSnapshot);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --remove validates malformed registry slugs before unregistering or deleting files", () => {
  const cases = [
    {
      label: "producer path",
      line:
        "- harness-malformed: producer `harness-malformed/producer` ↔ reviewer `harness-malformed-reviewer`, skill `harness-malformed`",
      error: /registered producer slug is invalid: harness-malformed\/producer/,
    },
    {
      label: "reviewer path",
      line:
        "- harness-malformed: producer `harness-malformed-producer` ↔ reviewers [`harness-malformed-reviewer`, `harness-malformed/reviewer`], skill `harness-malformed`",
      error: /registered reviewer slug is invalid: harness-malformed\/reviewer/,
    },
    {
      label: "skill path",
      line:
        "- harness-malformed: producer `harness-malformed-producer` ↔ reviewer `harness-malformed-reviewer`, skill `harness-malformed/skill`",
      error: /registered skill slug is invalid: harness-malformed\/skill/,
    },
  ];

  for (const { label, line, error } of cases) {
    const target = makeTempDir();
    try {
      installTo(target);
      const pair = {
        pair: "harness-malformed",
        producer: "harness-malformed-producer",
        reviewers: ["harness-malformed-reviewer"],
        skill: "harness-malformed",
      };
      registerPair(target, pair);
      writePairFiles(target, pair);

      const registryPath = join(target, ".harness/loom/registry.md");
      const validRegistry = readFileSync(registryPath, "utf8");
      const malformedRegistry = validRegistry.replace(/^- harness-malformed:.*$/m, line);
      assert.notEqual(malformedRegistry, validRegistry, `${label} should rewrite the registry fixture`);
      writeFileSync(registryPath, malformedRegistry);

      const beforeRegistry = readFileSync(registryPath, "utf8");
      const fileSnapshot = snapshotFiles([
        join(target, ".harness/loom/agents/harness-malformed-producer.md"),
        join(target, ".harness/loom/agents/harness-malformed-reviewer.md"),
        join(target, ".harness/loom/skills/harness-malformed/SKILL.md"),
      ]);

      const result = runPairDev(target, ["--remove", "harness-malformed"]);
      assert.notEqual(result.status, 0, `${label} should fail`);
      assert.match(result.stderr, error);
      assert.equal(readFileSync(registryPath, "utf8"), beforeRegistry, `${label} registry changed`);
      assert.match(registryBody(target), /^- harness-malformed:/m);
      assertFilesUnchanged(fileSnapshot);
    } finally {
      cleanupDir(target);
    }
  }
});

test("pair-dev --remove refuses active-cycle references before mutating loom files", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const pair = {
      pair: "harness-active",
      producer: "harness-active-producer",
      reviewers: ["harness-active-reviewer"],
      skill: "harness-active",
    };
    registerPair(target, pair);
    writePairFiles(target, pair);
    const statePath = join(target, ".harness/cycle/state.md");
    const activeState = [
      "# Runtime State",
      "",
      "Goal (from goals.md): demo",
      "Phase: harness-active-producer",
      "loop: false",
      "planner-continuation: none",
      "",
      "## Next",
      "To: harness-active-producer",
      "EPIC: EP-1--active",
      "Task path: .harness/cycle/epics/EP-1--active/tasks/T001--active.md",
      "Intent: Continue the active pair.",
      "Prior tasks:",
      "Prior reviews:",
      "",
      "## EPIC summaries",
      "",
      "### EP-1--active",
      "outcome: active work completes",
      "upstream: none",
      "roster: harness-active-producer",
      "current: harness-active-producer",
      "note: active",
      "",
    ].join("\n");
    writeFileSync(statePath, activeState);
    const beforeRegistry = registryBody(target);
    const fileSnapshot = snapshotFiles([
      join(target, ".harness/loom/agents/harness-active-producer.md"),
      join(target, ".harness/loom/agents/harness-active-reviewer.md"),
      join(target, ".harness/loom/skills/harness-active/SKILL.md"),
    ]);

    const result = runPairDev(target, ["--remove", "harness-active"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to remove harness-active/);
    assert.match(result.stderr, /active-cycle ## Next To references/);
    assert.equal(registryBody(target), beforeRegistry);
    assertFilesUnchanged(fileSnapshot);
    assert.equal(readFileSync(statePath, "utf8"), activeState);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --remove refuses live EPIC roster references when Next is clear", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const pair = {
      pair: "harness-live",
      producer: "harness-live-producer",
      reviewers: ["harness-live-reviewer"],
      skill: "harness-live",
    };
    registerPair(target, pair);
    writePairFiles(target, pair);
    const statePath = join(target, ".harness/cycle/state.md");
    const activeState = [
      "# Runtime State",
      "",
      "Goal (from goals.md): demo",
      "Phase: harness-other-producer",
      "loop: false",
      "planner-continuation: none",
      "",
      "## Next",
      "To: harness-other-producer",
      "EPIC: EP-1--active",
      "Task path: .harness/cycle/epics/EP-1--active/tasks/T001--active.md",
      "Intent: Continue another pair.",
      "Prior tasks:",
      "Prior reviews:",
      "",
      "## EPIC summaries",
      "",
      "### EP-1--active",
      "outcome: active work completes",
      "upstream: none",
      "roster: harness-live-producer",
      "current: harness-other-producer",
      "note: active",
      "",
    ].join("\n");
    writeFileSync(statePath, activeState);
    const beforeRegistry = registryBody(target);
    const fileSnapshot = snapshotFiles([
      join(target, ".harness/loom/agents/harness-live-producer.md"),
      join(target, ".harness/loom/agents/harness-live-reviewer.md"),
      join(target, ".harness/loom/skills/harness-live/SKILL.md"),
    ]);

    const result = runPairDev(target, ["--remove", "harness-live"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /live EPIC EP-1--active references/);
    assert.equal(registryBody(target), beforeRegistry);
    assertFilesUnchanged(fileSnapshot);
    assert.equal(readFileSync(statePath, "utf8"), activeState);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --remove refuses live EPIC current-only references when Next and roster are clear", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const pair = {
      pair: "harness-current",
      producer: "harness-current-producer",
      reviewers: ["harness-current-reviewer"],
      skill: "harness-current",
    };
    registerPair(target, pair);
    writePairFiles(target, pair);
    const statePath = join(target, ".harness/cycle/state.md");
    const activeState = [
      "# Runtime State",
      "",
      "Goal (from goals.md): demo",
      "Phase: harness-other-producer",
      "loop: false",
      "planner-continuation: none",
      "",
      "## Next",
      "To: harness-other-producer",
      "EPIC: EP-1--active",
      "Task path: .harness/cycle/epics/EP-1--active/tasks/T001--active.md",
      "Intent: Continue another pair.",
      "Prior tasks:",
      "Prior reviews:",
      "",
      "## EPIC summaries",
      "",
      "### EP-1--active",
      "outcome: active work completes",
      "upstream: none",
      "roster: harness-other-producer",
      "current: harness-current-producer",
      "note: active",
      "",
    ].join("\n");
    writeFileSync(statePath, activeState);
    const beforeRegistry = registryBody(target);
    const loomSnapshot = snapshotTree(join(target, ".harness/loom"));
    const cycleSnapshot = snapshotTree(join(target, ".harness/cycle"));

    const result = runPairDev(target, ["--remove", "harness-current"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /live EPIC EP-1--active references/);
    assert.match(result.stderr, /harness-current-producer/);
    assert.equal(registryBody(target), beforeRegistry);
    assertTreeSnapshotUnchanged(join(target, ".harness/loom"), loomSnapshot);
    assertTreeSnapshotUnchanged(join(target, ".harness/cycle"), cycleSnapshot);
    assert.equal(readFileSync(statePath, "utf8"), activeState);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --remove preserves shared agent and skill paths referenced by remaining registry entries", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const alpha = {
      pair: "harness-alpha",
      producer: "harness-alpha-producer",
      reviewers: ["harness-shared-reviewer"],
      skill: "harness-shared",
    };
    const beta = {
      pair: "harness-beta",
      producer: "harness-beta-producer",
      reviewers: ["harness-shared-reviewer"],
      skill: "harness-shared",
    };
    registerPair(target, alpha);
    registerPair(target, beta);
    writePairFiles(target, alpha);
    writeFileSync(
      join(target, ".harness/loom/agents/harness-beta-producer.md"),
      "---\nname: harness-beta-producer\n---\n\n# Producer\n",
    );

    const result = runPairDev(target, ["--remove", "harness-alpha"]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);

    assert.doesNotMatch(registryBody(target), /^- harness-alpha:/m);
    assert.match(registryBody(target), /^- harness-beta:/m);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-alpha-producer.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-shared-reviewer.md")), true);
    assert.equal(existsSync(join(target, ".harness/loom/skills/harness-shared/SKILL.md")), true);
    assert.ok(
      summary.preservedShared.some((path) => path.endsWith("agents/harness-shared-reviewer.md")),
    );
    assert.ok(summary.preservedShared.some((path) => path.endsWith("skills/harness-shared")));
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --remove does not treat a colliding pair identifier as shared-file evidence", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const victim = {
      pair: "harness-foo",
      producer: "harness-foo-producer",
      reviewers: ["harness-foo-reviewer"],
      skill: "harness-foo",
    };
    const collider = {
      pair: "harness-foo-producer",
      producer: "harness-bar-producer",
      reviewers: ["harness-bar-reviewer"],
      skill: "harness-bar",
    };
    registerPair(target, victim);
    registerPair(target, collider);
    writePairFiles(target, victim);
    writePairFiles(target, collider);

    const result = runPairDev(target, ["--remove", "harness-foo"]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);

    assert.doesNotMatch(registryBody(target), /^- harness-foo:/m);
    assert.match(registryBody(target), /^- harness-foo-producer:/m);

    assert.equal(
      existsSync(join(target, ".harness/loom/agents/harness-foo-producer.md")),
      false,
      "victim producer file must be deleted even when a remaining pair's identifier collides with its slug",
    );
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-foo-reviewer.md")), false);
    assert.equal(existsSync(join(target, ".harness/loom/skills/harness-foo")), false);

    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-bar-producer.md")), true);
    assert.equal(existsSync(join(target, ".harness/loom/agents/harness-bar-reviewer.md")), true);
    assert.equal(existsSync(join(target, ".harness/loom/skills/harness-bar/SKILL.md")), true);

    assert.deepEqual(summary.preservedShared, []);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --add --from accepts live slugs plus snapshot/archive locators as evidence", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    registerPair(target, {
      pair: "harness-source",
      producer: "harness-source-producer",
      reviewers: ["harness-source-reviewer"],
      skill: "harness-source",
    });
    mkdirSync(join(target, ".codex/agents"), { recursive: true });
    writeFileSync(
      join(target, ".codex/agents/user-owned.md"),
      "provider tree content must not be touched by pair-dev preparation\n",
    );

    const acceptedSnapshot = snapshotTrees(noWriteSnapshotRoots(target));
    const accepted = runPairDev(target, [
      "--add", "harness-target", "Use the source pair as an overlay source.",
      "--from", "harness-source",
    ]);
    assert.equal(accepted.status, 0, accepted.stderr);
    const summary = JSON.parse(accepted.stdout);
    assert.equal(summary.action, "prepare-add");
    assert.equal(summary.authored, false);
    assert.equal(summary.from.kind, "live");
    assert.equal(summary.from.pair, "harness-source");
    assert.deepEqual(summary.writes, []);
    assert.deepEqual(summary.providerTreesWritten, []);
    assert.doesNotMatch(registryBody(target), /^- harness-target:/m);
    assertTreesUnchanged(acceptedSnapshot);

    const snapshotRoot = join(target, ".harness/_snapshots/auto-setup/20260423T000000Z/loom");
    mkdirSync(join(snapshotRoot, "agents"), { recursive: true });
    mkdirSync(join(snapshotRoot, "skills/harness-source"), { recursive: true });
    writeFileSync(join(snapshotRoot, "registry.md"), registryBody(target));
    writeFileSync(
      join(snapshotRoot, "agents/harness-source-producer.md"),
      "---\nname: harness-source-producer\n---\n\n# Producer\n",
    );
    writeFileSync(
      join(snapshotRoot, "agents/harness-source-reviewer.md"),
      "---\nname: harness-source-reviewer\n---\n\n# Reviewer\n",
    );
    writeFileSync(
      join(snapshotRoot, "skills/harness-source/SKILL.md"),
      "---\nname: harness-source\nuser-invocable: false\n---\n\n# harness-source\n",
    );

    const snapshotAccepted = runPairDev(target, [
      "--add", "harness-target", "Use snapshot evidence.",
      "--from", "snapshot:20260423T000000Z/harness-source",
    ]);
    assert.equal(snapshotAccepted.status, 0, snapshotAccepted.stderr);
    const snapshotSummary = JSON.parse(snapshotAccepted.stdout);
    assert.equal(snapshotSummary.from.kind, "snapshot");
    assert.equal(snapshotSummary.from.locator, "snapshot:20260423T000000Z/harness-source");
    assert.equal(snapshotSummary.from.skillPath, ".harness/_snapshots/auto-setup/20260423T000000Z/loom/skills/harness-source/SKILL.md");

    const archiveRoot = join(target, ".harness/_archive/20260423T000100Z/loom");
    mkdirSync(join(archiveRoot, "agents"), { recursive: true });
    mkdirSync(join(archiveRoot, "skills/harness-source"), { recursive: true });
    writeFileSync(join(archiveRoot, "registry.md"), registryBody(target));
    writeFileSync(
      join(archiveRoot, "agents/harness-source-producer.md"),
      "---\nname: harness-source-producer\n---\n\n# Producer\n",
    );
    writeFileSync(
      join(archiveRoot, "agents/harness-source-reviewer.md"),
      "---\nname: harness-source-reviewer\n---\n\n# Reviewer\n",
    );
    writeFileSync(
      join(archiveRoot, "skills/harness-source/SKILL.md"),
      "---\nname: harness-source\nuser-invocable: false\n---\n\n# harness-source\n",
    );

    const archiveAccepted = runPairDev(target, [
      "--add", "harness-target", "Use archive evidence.",
      "--from", "archive:20260423T000100Z/harness-source",
    ]);
    assert.equal(archiveAccepted.status, 0, archiveAccepted.stderr);
    const archiveSummary = JSON.parse(archiveAccepted.stdout);
    assert.equal(archiveSummary.from.kind, "archive");
    assert.equal(archiveSummary.from.locator, "archive:20260423T000100Z/harness-source");

    const rejected = [
      [".harness/_archive/snapshots/demo", /not a file or platform path/],
      [".codex/agents/harness-source.md", /not a file or platform path/],
      ["harness-planner", /foundation or singleton/],
      ["harness-finalizer", /foundation or singleton/],
      ["harness-orchestrate", /foundation or singleton/],
      ["harness-missing", /not registered/],
      ["snapshot:missing/harness-source", /missing source registry/],
    ];
    for (const [from, pattern] of rejected) {
      const rejectedSnapshot = snapshotTrees(noWriteSnapshotRoots(target));
      const result = runPairDev(target, [
        "--add", "harness-target", "Use evidence.",
        "--from", from,
      ]);
      assert.notEqual(result.status, 0, `${from} should be rejected`);
      assert.match(result.stderr, pattern);
      assertTreesUnchanged(rejectedSnapshot);
    }
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --add requires positional purpose", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const before = snapshotTrees(noWriteSnapshotRoots(target));

    const result = runPairDev(target, ["--add", "harness-missing-purpose"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--add requires positional "<purpose>"/);
    assertTreesUnchanged(before);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --improve requires positional purpose", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    registerPair(target, {
      pair: "harness-existing",
      producer: "harness-existing-producer",
      reviewers: ["harness-existing-reviewer"],
      skill: "harness-existing",
    });

    const result = runPairDev(target, ["--improve", "harness-existing"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--improve requires positional "<purpose>"/);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev --improve returns positional purpose in a no-write preparation summary", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    registerPair(target, {
      pair: "harness-existing",
      producer: "harness-existing-producer",
      reviewers: ["harness-existing-reviewer"],
      skill: "harness-existing",
    });
    const beforeRegistry = registryBody(target);
    const purpose = "Tighten review around source-backed removal safety.";

    const result = runPairDev(target, ["--improve", "harness-existing", purpose]);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);

    assert.equal(summary.action, "prepare-improve");
    assert.equal(summary.authored, false);
    assert.equal(summary.purpose, purpose);
    assert.equal(summary.existing.pair, "harness-existing");
    assert.deepEqual(summary.writes, []);
    assert.deepEqual(summary.providerTreesWritten, []);
    assert.equal(summary.syncCommand, "node .harness/loom/sync.ts --provider <list>");
    assert.equal(registryBody(target), beforeRegistry);
  } finally {
    cleanupDir(target);
  }
});

test("pair-dev rejects legacy --split and --hint", () => {
  const target = makeTempDir();
  try {
    const split = runPairDev(target, ["--split", "harness-demo"]);
    assert.notEqual(split.status, 0);
    assert.match(split.stderr, /--split is unsupported/);

    const hint = runPairDev(target, [
      "--improve", "harness-demo", "Revise the pair.",
      "--hint", "old syntax",
    ]);
    assert.notEqual(hint.status, 0);
    assert.match(hint.stderr, /--hint is unsupported/);
  } finally {
    cleanupDir(target);
  }
});
