import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
  REGISTER_PAIR_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  assert.equal(runNode(INSTALL_SCRIPT, [target]).status, 0);
}

test("README claim about prefix handling matches register-pair contract", () => {
  // README must NOT promise auto-prepending of unprefixed slugs — register-pair
  // strictly rejects unprefixed slugs (see prefixRe in register-pair.ts and
  // the dedicated rejection test below).
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  assert.doesNotMatch(
    readme,
    /unprefixed slugs are auto-prepended/i,
    "README must not promise auto-prepend; register-pair.ts rejects unprefixed slugs",
  );
  // Quickstart should surface the actual rule so users do not feed bare slugs.
  assert.match(
    readme,
    /must start with the `harness-` prefix|register-pair\.ts rejects unprefixed/i,
    "README must surface the actual register-pair prefix requirement",
  );
});

test("register-pair writes 1:1 entry with backticks and ↔ arrow", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-demo",
      "--producer", "harness-demo-producer",
      "--reviewer", "harness-demo-reviewer",
      "--skill", "harness-demo",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    const orchestrate = registry;
    assert.match(
      orchestrate,
      /- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`/,
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
      "--pair", "harness-api",
      "--producer", "harness-api-producer",
      "--reviewer", "harness-api-reviewer",
      "--reviewer", "harness-security-reviewer",
      "--skill", "harness-api",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    const orchestrate = registry;
    assert.match(
      orchestrate,
      /- harness-api: producer `harness-api-producer` ↔ reviewers \[`harness-api-reviewer`, `harness-security-reviewer`\], skill `harness-api`/,
    );
  } finally {
    cleanupDir(target);
  }
});

test("register-pair does not write into harness-planning SKILL", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const planningPath = join(
      target,
      ".harness/loom/skills/harness-planning/SKILL.md",
    );
    const before = readFileSync(planningPath, "utf8");

    assert.equal(
      runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "harness-demo",
        "--producer", "harness-demo-producer",
        "--reviewer", "harness-demo-reviewer",
        "--skill", "harness-demo",
      ]).status,
      0,
    );

    const after = readFileSync(planningPath, "utf8");
    assert.equal(after, before, "planning SKILL must be untouched by register-pair");
    assert.doesNotMatch(after, /## Available departments/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair inserts a new pair before an anchor in the Registered pairs section", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    for (const pair of [
      {
        pair: "harness-alpha",
        producer: "harness-alpha-producer",
        reviewer: "harness-alpha-reviewer",
        skill: "harness-alpha",
      },
      {
        pair: "harness-gamma",
        producer: "harness-gamma-producer",
        reviewer: "harness-gamma-reviewer",
        skill: "harness-gamma",
      },
    ]) {
      const r = runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", pair.pair,
        "--producer", pair.producer,
        "--reviewer", pair.reviewer,
        "--skill", pair.skill,
      ]);
      assert.equal(r.status, 0, r.stderr);
    }

    const inserted = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-beta",
      "--producer", "harness-beta-producer",
      "--reviewer", "harness-beta-reviewer",
      "--skill", "harness-beta",
      "--before", "harness-gamma",
    ]);
    assert.equal(inserted.status, 0, inserted.stderr);

    const body = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    const alpha = body.indexOf("- harness-alpha:");
    const beta = body.indexOf("- harness-beta:");
    const gamma = body.indexOf("- harness-gamma:");
    assert.ok(alpha !== -1 && beta !== -1 && gamma !== -1, "missing pair order markers");
    assert.ok(alpha < beta, "expected alpha before beta");
    assert.ok(beta < gamma, "expected beta before gamma");
  } finally {
    cleanupDir(target);
  }
});

test("register-pair rejects a missing placement anchor", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-beta",
      "--producer", "harness-beta-producer",
      "--reviewer", "harness-beta-reviewer",
      "--skill", "harness-beta",
      "--after", "harness-does-not-exist",
    ]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /placement anchor not found/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair rejects slugs that are missing the harness- prefix", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const baseArgs = {
      pair: "harness-demo",
      producer: "harness-demo-producer",
      reviewer: "harness-demo-reviewer",
      skill: "harness-demo",
    };
    const cases = [
      { override: ["--pair", "demo"], label: "--pair" },
      { override: ["--producer", "demo-producer"], label: "--producer" },
      { override: ["--reviewer", "demo-reviewer"], label: "--reviewer" },
      { override: ["--skill", "demo"], label: "--skill" },
    ];
    for (const { override, label } of cases) {
      const argv = [
        "--target", target,
        "--pair", baseArgs.pair,
        "--producer", baseArgs.producer,
        "--reviewer", baseArgs.reviewer,
        "--skill", baseArgs.skill,
      ];
      // Replace the overridden flag's value with an unprefixed slug.
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === override[0]) {
          argv[i + 1] = override[1];
          break;
        }
      }
      const r = runNode(REGISTER_PAIR_SCRIPT, argv);
      assert.notEqual(r.status, 0, `${label} should have been rejected but exited 0`);
      assert.match(
        r.stderr,
        /must start with "harness-"/,
        `${label} rejection should mention the prefix rule (got: ${r.stderr})`,
      );
    }
  } finally {
    cleanupDir(target);
  }
});

test("register-pair requires at least one --reviewer", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-mirror",
      "--producer", "harness-mirror-producer",
      "--skill", "harness-mirror",
    ]);
    assert.notEqual(r.status, 0, "pair without --reviewer must fail");
    assert.match(r.stderr, /at least one --reviewer is required/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair --unregister also enforces the harness- prefix on --pair", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--unregister",
      "--target", target,
      "--pair", "demo",
    ]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /must start with "harness-"/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair --unregister removes the pair from the Registered pairs section", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    const registryPath = join(target, ".harness/loom/registry.md");

    assert.equal(
      runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "harness-unreg",
        "--producer", "harness-unreg-producer",
        "--reviewer", "harness-unreg-reviewer",
        "--skill", "harness-unreg",
      ]).status,
      0,
    );
    assert.match(readFileSync(registryPath, "utf8"), /^- harness-unreg:/m);

    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--unregister",
      "--target", target,
      "--pair", "harness-unreg",
    ]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.registry.changed, true);
    assert.equal(summary.planning, undefined, "summary must not carry a planning field");
    assert.doesNotMatch(readFileSync(registryPath, "utf8"), /^- harness-unreg:/m);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair --unregister is scoped to the roster section only", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    const registryPath = join(target, ".harness/loom/registry.md");

    // Register so the roster contains harness-scoped.
    assert.equal(
      runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "harness-scoped",
        "--producer", "harness-scoped-producer",
        "--reviewer", "harness-scoped-reviewer",
        "--skill", "harness-scoped",
      ]).status,
      0,
    );

    // Append a narrative section AFTER the roster that happens to contain a
    // line visually identical to a roster entry. Unregister must NOT touch it.
    const narrative =
      "\n## Narrative — do not touch\n" +
      "- harness-scoped: this is prose, not a registration\n";
    writeFileSync(
      registryPath,
      readFileSync(registryPath, "utf8") + narrative,
    );

    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--unregister",
      "--target", target,
      "--pair", "harness-scoped",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const after = readFileSync(registryPath, "utf8");
    // The roster-scoped entry is gone.
    assert.doesNotMatch(
      after,
      /^## Registered pairs\n[\s\S]*?^- harness-scoped: producer/m,
    );
    // The narrative line survives verbatim.
    assert.match(after, /^- harness-scoped: this is prose, not a registration$/m);
    assert.match(after, /## Narrative — do not touch/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair --unregister reports changed:false on a missing pair", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    // No registration of harness-ghost ever happened; unregister must no-op
    // deterministically rather than succeeding deceptively.
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--unregister",
      "--target", target,
      "--pair", "harness-ghost",
    ]);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.registry.changed, false);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair tolerates CRLF line endings in registry.md", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    // Rewrite the registry with CRLF endings (simulates a Windows checkout
    // where `git config core.autocrlf=true` converted on checkout).
    const registryPath = join(target, ".harness/loom/registry.md");
    const lfBody = readFileSync(registryPath, "utf8");
    const crlfBody = lfBody.replace(/\n/g, "\r\n");
    writeFileSync(registryPath, crlfBody);

    // Register a pair — should find `## Registered pairs` despite CRLF, insert
    // into that section (not append a second duplicate heading), and preserve
    // CRLF on write-back.
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-crlf",
      "--producer", "harness-crlf-producer",
      "--reviewer", "harness-crlf-reviewer",
      "--skill", "harness-crlf",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const after = readFileSync(registryPath, "utf8");
    // Exactly one `## Registered pairs` heading at line-start — not duplicated.
    const headingCount = (after.match(/(^|\r\n|\n)## Registered pairs(\r\n|\n)/g) || []).length;
    assert.equal(headingCount, 1, `expected exactly one Registered pairs heading, got ${headingCount}`);
    // The new entry landed in the section.
    assert.match(
      after,
      /- harness-crlf: producer `harness-crlf-producer` ↔ reviewer `harness-crlf-reviewer`, skill `harness-crlf`/,
    );
    // CRLF preserved on write — the file must still contain \r\n.
    assert.ok(after.includes("\r\n"), "CRLF line endings must survive the round-trip");
  } finally {
    cleanupDir(target);
  }
});

test("register-pair rejects --before / --after with a missing value", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    for (const flag of ["--before", "--after"]) {
      // Flag at argv end with no following value — must error, not fall back
      // silently to append placement.
      const r = runNode(REGISTER_PAIR_SCRIPT, [
        "--target", target,
        "--pair", "harness-demo",
        "--producer", "harness-demo-producer",
        "--reviewer", "harness-demo-reviewer",
        "--skill", "harness-demo",
        flag,
      ]);
      assert.notEqual(r.status, 0, `${flag} with no value should fail`);
      assert.match(r.stderr, new RegExp(`${flag} requires a pair slug`));
    }
  } finally {
    cleanupDir(target);
  }
});
