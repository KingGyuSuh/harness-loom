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

test("install.ts seeds the harness-finalizer agent under .harness/loom/", () => {
  const target = makeTempDir();
  try {
    const r = runNode(INSTALL_SCRIPT, [], { cwd: target });
    assert.equal(r.status, 0, r.stderr);

    const agent = join(target, ".harness/loom/agents/harness-finalizer.md");
    assert.ok(existsSync(agent), "harness-finalizer.md must be installed");

    // The finalizer rubric lives in the agent body, not a separate skill dir.
    const finalizerSkill = join(target, ".harness/loom/skills/harness-finalizer");
    assert.ok(!existsSync(finalizerSkill), "harness-finalizer has no separate skill dir");

    const body = readFileSync(agent, "utf8");
    assert.doesNotMatch(body, /\{\{[A-Z_]+\}\}/);
    assert.doesNotMatch(
      body,
      /^model:/m,
      "finalizer frontmatter must not pin a model — sync.ts injects per-platform pin",
    );
    assert.match(body, /^name: harness-finalizer$/m);
    // skills: list carries only harness-context (no separate pair skill).
    assert.match(body, /^skills:\s*\n\s*-\s*harness-context\s*$/m);
  } finally {
    cleanupDir(target);
  }
});

test("install.ts seeds the registry at loom root with an empty Registered pairs section", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [], { cwd: target }).status, 0);
    const registry = readFileSync(join(target, ".harness/loom/registry.md"), "utf8");
    // Registry holds the pair roster only; Finalizer is a singleton role
    // dispatched by fixed slug, not a list entry.
    assert.match(
      registry,
      /^## Registered pairs$/m,
      "registry must carry the `## Registered pairs` heading",
    );
    assert.doesNotMatch(
      registry,
      /## Registered finalizers/,
      "registry must not carry a finalizer list — the finalizer is a singleton role",
    );
    // Orchestrator SKILL body must not embed either roster section; the
    // registry file is the sole roster SSOT.
    const orchestrate = readFileSync(
      join(target, ".harness/loom/skills/harness-orchestrate/SKILL.md"),
      "utf8",
    );
    assert.doesNotMatch(
      orchestrate,
      /^## Registered pairs$/m,
      "orchestrate SKILL must not embed Registered pairs — it lives in the registry",
    );
    assert.doesNotMatch(
      orchestrate,
      /^## Registered finalizers$/m,
      "orchestrate SKILL must not embed Registered finalizers — the finalizer is a singleton",
    );
  } finally {
    cleanupDir(target);
  }
});

test("seeded harness-finalizer is a safe no-op that returns PASS", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [], { cwd: target }).status, 0);
    const body = readFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      "utf8",
    );
    // The default seeded body must declare itself a safe no-op so that a
    // fresh install's first cycle terminates cleanly without the user
    // having to author concrete cycle-end work upfront.
    assert.match(
      body,
      /safe no-op/i,
      "seeded finalizer body must self-identify as a safe no-op",
    );
    // Output Format Summary must seed the canonical no-op phrase that the
    // orchestrator reads as a clean PASS.
    assert.match(
      body,
      /no cycle-end work registered/,
      "seeded finalizer body must seed the canonical no-op Summary phrase",
    );
    // The seeded body must positively invite the project to add real cycle-end
    // work — the no-op is a starting point, not a permanent fixture.
    assert.match(
      body,
      /If cycle-end work exists, execute it here/i,
      "seeded finalizer body must invite cycle-end work to replace the no-op Task step",
    );
    // Default Task is a single PASS-emit step (no real file writes), so a
    // fresh-install cycle with this body and no edits produces no
    // out-of-cycle write.
    assert.match(
      body,
      /Status:\s*PASS.*Summary:\s*no cycle-end work registered/s,
      "default Task must direct PASS + canonical Summary so unedited installs are safe",
    );
  } finally {
    cleanupDir(target);
  }
});

test("installed harness-finalizer body exposes the load-bearing contract sections", () => {
  const target = makeTempDir();
  try {
    assert.equal(runNode(INSTALL_SCRIPT, [], { cwd: target }).status, 0);
    const body = readFileSync(
      join(target, ".harness/loom/agents/harness-finalizer.md"),
      "utf8",
    );

    // Principles, Task, Output Format sections are the load-bearing contract
    // the orchestrator grades against; the seeded body keeps these, domain
    // fills in the Task content when authoring real cycle-end work.
    assert.match(body, /^## Principles$/m);
    assert.match(body, /^## Task$/m);
    assert.match(body, /^## Output Format$/m);

    // Output Format must carry Status + Self-verification (verdict source
    // for the Finalizer turn).
    assert.match(body, /Status:\s*PASS\s*\/\s*FAIL/);
    assert.match(body, /Self-verification:/);
    assert.match(body, /Blocked or out-of-scope items:\s*\[\{item, reason\}\]/);
    assert.doesNotMatch(body, /Remaining items:/);

    // Structural Issue block with planner upstream stage — the Finalizer's
    // only retreat trigger.
    assert.match(body, /## Structural Issue/);
    assert.match(body, /Suspected upstream stage:\s*planner/i);
  } finally {
    cleanupDir(target);
  }
});
