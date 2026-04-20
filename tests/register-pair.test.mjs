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
      "--pair", "harness-demo",
      "--producer", "harness-demo-producer",
      "--reviewer", "harness-demo-reviewer",
      "--skill", "harness-demo",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const orchestrate = readFileSync(
      join(target, ".claude/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
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

    const orchestrate = readFileSync(
      join(target, ".claude/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.match(
      orchestrate,
      /- harness-api: producer `harness-api-producer` ↔ reviewers \[`harness-api-reviewer`, `harness-security-reviewer`\], skill `harness-api`/,
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
        "--pair", "harness-demo",
        "--producer", "harness-demo-producer",
        "--reviewer", "harness-demo-reviewer",
        "--skill", "harness-demo",
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
      /- harness-demo: producer `harness-demo-producer` ↔ reviewer `harness-demo-reviewer`, skill `harness-demo`/,
    );
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

test("register-pair writes reviewer-less entry as `(no reviewer)` without ↔ arrow", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-mirror",
      "--producer", "harness-mirror-producer",
      "--reviewer", "none",
      "--skill", "harness-mirror",
    ]);
    assert.equal(r.status, 0, r.stderr);

    const orchestrate = readFileSync(
      join(target, ".claude/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.match(
      orchestrate,
      /- harness-mirror: producer `harness-mirror-producer` \(no reviewer\), skill `harness-mirror`/,
    );
    // Load-bearing: the `↔` arrow must be absent from the reviewer-less line
    // so the runtime can distinguish "not subject to review" from a pair.
    assert.ok(
      !/- harness-mirror:.*↔/.test(orchestrate),
      "reviewer-less line must not contain the ↔ arrow",
    );

    const planning = readFileSync(
      join(target, ".claude/skills/harness-planning/SKILL.md"),
      "utf8",
    );
    assert.match(
      planning,
      /- harness-mirror: producer `harness-mirror-producer` \(no reviewer\), skill `harness-mirror`/,
    );
  } finally {
    cleanupDir(target);
  }
});

test("register-pair rejects mixing --reviewer none with real reviewer slugs", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-mirror",
      "--producer", "harness-mirror-producer",
      "--reviewer", "none",
      "--reviewer", "harness-mirror-reviewer",
      "--skill", "harness-mirror",
    ]);
    assert.notEqual(r.status, 0, "mixing none with a real reviewer must fail");
    assert.match(r.stderr, /none/);
    assert.match(r.stderr, /cannot be combined/);
  } finally {
    cleanupDir(target);
  }
});

test("register-pair reviewer-less mode does not require harness- prefix on the literal `none`", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    // Sanity: `none` is a magic value, not a slug, so the prefix regex does
    // not apply to it. Real reviewer slugs are still rejected when unprefixed
    // (covered by the existing prefix-rejection test).
    const r = runNode(REGISTER_PAIR_SCRIPT, [
      "--target", target,
      "--pair", "harness-mirror",
      "--producer", "harness-mirror-producer",
      "--reviewer", "none",
      "--skill", "harness-mirror",
    ]);
    assert.equal(r.status, 0, r.stderr);
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
