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
const CONTEXT_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-context/SKILL.template.md",
);
const PLANNER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-planner.template.md",
);
const DOC_KEEPER_SKILL_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-doc-keeper/SKILL.template.md",
);
const DOC_KEEPER_PRODUCER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-doc-keeper-producer.template.md",
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

test("planning template defines rosters as a subsequence of a fixed global roster", () => {
  const body = readFileSync(PLANNING_TEMPLATE, "utf8");
  assert.ok(
    body.includes("global roster order"),
    "planning template must describe the project-global roster order",
  );
  assert.ok(
    body.includes("subsequence"),
    "planning template must say each EPIC roster is a subsequence of that global roster",
  );
});

test("orchestrate template gates dispatch through a ready set at the same global roster position", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.ok(
    body.includes("ready set"),
    "orchestrate template must define a ready set before dispatch",
  );
  assert.ok(
    body.includes("same global roster position"),
    "orchestrate template must state that upstream gating happens at the same global roster position",
  );
});

test("doc-keeper skill template stays project-shape driven without factory references", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.match(
    body,
    /derive modules from this project's current shape/i,
    "doc-keeper SKILL.template must derive modules from the current project's own structure",
  );
  assert.match(
    body,
    /Ignore generated, vendored, cache, and runtime-owned directories/i,
    "doc-keeper SKILL.template must ignore generated and runtime-owned directories",
  );
  for (const token of [
    "plugins/harness-loom",
    "skill-authoring.md",
    "oversized-split.md",
    "Pass 1",
    "Pass 2",
    "Pass 3",
    "Pass 4",
    "Pass 5",
  ]) {
    assert.ok(
      !body.includes(token),
      `doc-keeper SKILL.template must not hardcode ${token}`,
    );
  }
});

test("doc-keeper skill template anchors citations to source at file:line", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.match(
    body,
    /anchor(ed)? to source at `file:line`/,
    "doc-keeper SKILL.template must declare source at file:line as the primary citation",
  );
  // Cycle artifacts must be demoted to a supplementary role so a fullstack
  // target project can produce valid docs even in a cycle that did not write
  // any task/review files referencing project code.
  assert.match(
    body,
    /cycle artifacts.*never the primary evidence/i,
    "doc-keeper SKILL.template must demote cycle artifacts to supplementary evidence",
  );
});

test("doc-keeper skill template specifies a surgical `## Modules` block rewrite", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.ok(
    body.includes("## Modules"),
    "doc-keeper SKILL.template must name the `## Modules` heading as the surgical-merge boundary",
  );
  assert.match(
    body,
    /Preserve every other section as-is/i,
    "doc-keeper SKILL.template must preserve content outside `## Modules`",
  );
  // The Taboo block must warn against wholesale rewrite so future refactors do
  // not silently reintroduce the data-loss bug.
  assert.match(
    body,
    /Rewrite `CLAUDE\.md` or `AGENTS\.md` wholesale/i,
    "doc-keeper SKILL.template Taboos must forbid wholesale CLAUDE/AGENTS regeneration",
  );
});

test("doc-keeper skill template no longer references the stale OpenAI harness-engineering URL", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.doesNotMatch(
    body,
    /openai\.com\/index\/harness-engineering/,
    "the OpenAI harness-engineering link belongs to the pre-rewrite template and must stay removed",
  );
});

test("doc-keeper producer template emits concise coverage-oriented self-verification", () => {
  const body = readFileSync(DOC_KEEPER_PRODUCER_TEMPLATE, "utf8");
  assert.ok(
    body.includes("Modules covered"),
    "doc-keeper producer must emit `Modules covered` in its Output Format",
  );
  assert.ok(
    body.includes("Pointers updated"),
    "doc-keeper producer must emit `Pointers updated` in its Output Format",
  );
  // The producer must explicitly forbid reading state.md for module shape so
  // its module set stays anchored to the target's filesystem, not to cycle
  // state that may not reference any target source.
  assert.match(
    body,
    /Do NOT use `state\.md` or cycle artifacts to invent the module structure; derive that from `cwd`/i,
    "doc-keeper producer must redirect module discovery to cwd scan, not state.md",
  );
  assert.ok(
    !body.includes("Preserved prefix/suffix bytes"),
    "doc-keeper producer should avoid byte-count bookkeeping in its output contract",
  );
});

test("runtime templates outside doc-keeper do not reference factory-only plugin surfaces", () => {
  const templates = [
    ORCHESTRATE_TEMPLATE,
    PLANNING_TEMPLATE,
    CONTEXT_TEMPLATE,
    PLANNER_TEMPLATE,
  ];
  const forbidden = [
    "plugins/harness-loom",
    "register-pair.ts",
    "install.ts",
    "docs-sync.ts",
    "/harness-pair-dev",
    "/harness-init",
    "/harness-sync",
    "CLAUDE_SKILL_DIR",
  ];
  for (const template of templates) {
    const body = readFileSync(template, "utf8");
    for (const token of forbidden) {
      assert.ok(
        !body.includes(token),
        `${template} must not reference factory-only token ${token}`,
      );
    }
  }
});
