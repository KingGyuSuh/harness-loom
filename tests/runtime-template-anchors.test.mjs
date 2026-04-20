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

test("doc-keeper skill template drives a docs-curator layout from project + goal, not a code-module navigator", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.match(
    body,
    /analyze the project and its goal/i,
    "doc-keeper SKILL.template must open by analyzing project + goal",
  );
  assert.match(
    body,
    /design the documentation layout that fits this project/i,
    "doc-keeper SKILL.template must design a project-specific layout",
  );
  // Layout building blocks the rubric advertises. A curator-style rubric must
  // surface these category names so the producer knows what vocabulary it can
  // draw from.
  for (const category of [
    "design-docs",
    "product-specs",
    "exec-plans",
    "generated",
    "references",
  ]) {
    assert.match(
      body,
      new RegExp(`docs/${category}/`),
      `layout building block docs/${category}/ must be named`,
    );
  }
  // Legacy navigator vocabulary must not reappear.
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

test("doc-keeper skill template forbids writing outside the documentation surface", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  assert.match(
    body,
    /never touch source code|does not implement/i,
    "doc-keeper SKILL.template must forbid writing to code/tests/build scripts",
  );
});

test("doc-keeper skill template keeps the CLAUDE.md / AGENTS.md pointer-section surgical contract", () => {
  const body = readFileSync(DOC_KEEPER_SKILL_TEMPLATE, "utf8");
  // The pointer section name may evolve (Modules, Documents, etc.) but the
  // surgical-merge discipline — replace only the pointer section, preserve
  // everything else — must persist to prevent silent data loss.
  assert.match(
    body,
    /CLAUDE\.md.*AGENTS\.md|AGENTS\.md.*CLAUDE\.md/,
    "doc-keeper SKILL.template must name both pointer docs",
  );
  assert.match(
    body,
    /replace only that section|preserve every other section/i,
    "doc-keeper SKILL.template must keep the surgical-merge contract",
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

test("doc-keeper producer template emits a curator-style self-verification contract", () => {
  const body = readFileSync(DOC_KEEPER_PRODUCER_TEMPLATE, "utf8");
  // The producer must surface docs-curator signals: layout rationale, impact
  // map from cycle events to docs, pointer-doc status, and an explicit "left
  // alone intentionally" accounting so the reviewer-less verdict is graded on
  // scope, not just on presence of outputs.
  for (const field of [
    "Files created",
    "Files modified",
    "Files left alone",
    "Layout rationale",
    "Impact map",
    "Pointers updated",
    "Self-verification",
  ]) {
    assert.ok(
      body.includes(field),
      `doc-keeper producer must emit \`${field}\` in its Output Format`,
    );
  }
  // Byte-count bookkeeping and module-navigator framing must not come back.
  assert.ok(
    !body.includes("Preserved prefix/suffix bytes"),
    "doc-keeper producer should avoid byte-count bookkeeping in its output contract",
  );
  assert.ok(
    !body.includes("Modules covered"),
    "doc-keeper producer must drop the module-navigator `Modules covered` field",
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
