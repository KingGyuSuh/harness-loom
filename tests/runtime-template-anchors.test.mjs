import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

// EP-2 contract: the runtime `harness-orchestrate/SKILL.template.md` body must
// teach the orchestrator how to recognize a reviewer-less producer-only roster
// line and how to advance phase from the producer's own Status without
// dispatching a reviewer or writing a review file. These tests pin the
// load-bearing tokens so a future refactor of the template body cannot silently
// drop the contract that EP-1's register-pair.ts shape depends on.

const ORCHESTRATE_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-orchestrate/SKILL.template.md",
);
const PLANNING_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-planning/SKILL.template.md",
);

test("orchestrate template exists at the canonical factory path", () => {
  assert.ok(
    existsSync(ORCHESTRATE_TEMPLATE),
    `expected ${ORCHESTRATE_TEMPLATE} to exist`,
  );
});

test("orchestrate template documents the `(no reviewer)` registration line shape", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Load-bearing literal token register-pair.ts emits for reviewer-less.
  assert.ok(
    body.includes("(no reviewer)"),
    "orchestrate template must mention the `(no reviewer)` literal token",
  );
  // The ↔ arrow is the present-iff-paired token. The template must name it
  // explicitly so the runtime two-token check (no `↔` AND `(no reviewer)`) is
  // gradeable from the body alone.
  assert.ok(
    body.includes("↔"),
    "orchestrate template must reference the `↔` arrow as the paired-roster marker",
  );
});

test("orchestrate template states reviewer-less means `not subject to review`", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // goals.md:L21 — reviewed-work contract must not be diluted. The exact phrase
  // distinguishes `reviewer-less = not subject to review` from
  // `reviewer-less = passed without review`.
  assert.ok(
    body.includes("not subject to review"),
    "orchestrate template must state reviewer-less means `not subject to review`",
  );
  assert.ok(
    body.includes("passed without review"),
    "orchestrate template must explicitly contrast against `passed without review`",
  );
});

test("orchestrate template carries the reviewer-less Turn Algorithm branch", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Step 5-c is the orchestrator's load-bearing dispatch-skip step.
  assert.ok(
    /5-c\.?\s+Reviewer-less producer turn/i.test(body),
    "orchestrate template must define Turn Algorithm step 5-c for reviewer-less",
  );
  // Step 7-b synthesizes the verdict from the producer's own `Status` line.
  assert.ok(
    /7-b\.?\s+Reviewer-less/i.test(body),
    "orchestrate template must define Turn Algorithm step 7-b for reviewer-less verdict aggregation",
  );
});

test("orchestrate template ties reviewer-less verdict to the producer's own Status", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Producer self-status is the only verdict source for reviewer-less; the
  // template must say so directly so the runtime cannot fall through to a
  // missing-reviewer FAIL.
  assert.match(
    body,
    /Status:\s*PASS\|FAIL/,
    "orchestrate template must reference the producer's own `Status: PASS|FAIL` line as the reviewer-less verdict source",
  );
  assert.ok(
    body.includes("Self-verification"),
    "orchestrate template must reference the producer's `Self-verification` evidence as part of the reviewer-less verdict",
  );
});

test("orchestrate template states reviewer-less leaves zero review files for the turn", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // The Reviewed-Work Contract must enumerate 0/1/M review files; otherwise the
  // existing "exactly 1 task + 1 or M reviews" invariant silently breaks.
  assert.match(
    body,
    /0,?\s*1,?\s*or\s*M/i,
    "orchestrate template must say the per-turn review file count is 0, 1, or M",
  );
});

test("planning template acknowledges reviewer-less rosters at the roster shape rule", () => {
  const body = readFileSync(PLANNING_TEMPLATE, "utf8");
  // §4 must teach the planner that one producer slug may resolve to either a
  // paired or a reviewer-less roster line; otherwise a planner emitting a
  // reviewer-less producer in a roster could be flagged as a contract bug.
  assert.ok(
    body.includes("(no reviewer)"),
    "planning template must mention the `(no reviewer)` shape so reviewer-less producers are valid roster slugs",
  );
});
