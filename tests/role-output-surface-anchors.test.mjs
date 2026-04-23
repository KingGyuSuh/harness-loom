import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const PRODUCER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-pair-dev/templates/producer-agent.md",
);
const REVIEWER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-pair-dev/templates/reviewer-agent.md",
);
const EXAMPLE_AGENT_DIR = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-pair-dev/examples/agents",
);
const AGENT_AUTHORING = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-pair-dev/references/authoring/agent-authoring.md",
);
const ORCHESTRATE_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-orchestrate/SKILL.template.md",
);
const CONTEXT_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-context/SKILL.template.md",
);
const PLANNING_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-planning/SKILL.template.md",
);
const PLANNER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-planner.template.md",
);
const FINALIZER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-finalizer.template.md",
);

const PRODUCER_BLOCK = [
  "Status: PASS / FAIL",
  "Summary: {what was produced in one line}",
  "Files created: [{file path}]",
  "Files modified: [{file path}]",
  'Diff summary: {sections changed vs baseline, or "N/A"}',
  "Self-verification: {issues found and resolved during this cycle}",
  "Blocked or out-of-scope items: [{item, reason}]",
].join("\n");

const REVIEWER_BLOCK = [
  "Verdict: PASS / FAIL",
  "Criteria: [{criterion, result, evidence-citation (file:line)}]",
  "FAIL items: [{item, level (technical/creative/structural), reason}]",
  "Feedback: {short free-form rationale}",
].join("\n");

const LEGACY_FIELD_LINE = /^(Suggested next-work|Advisory-next|Regression gate|Escalation):/m;
const LEGACY_FIELD_NAME = /\b(Suggested next-work|Advisory-next|Regression gate|Escalation)\b/;

function read(path) {
  return readFileSync(path, "utf8");
}

function codeBlockAfter(body, marker) {
  const markerIndex = body.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing marker ${marker}`);
  const fenceStart = body.indexOf("```", markerIndex);
  assert.notEqual(fenceStart, -1, `missing code fence after ${marker}`);
  const blockStart = body.indexOf("\n", fenceStart);
  assert.notEqual(blockStart, -1, `missing code fence newline after ${marker}`);
  const fenceEnd = body.indexOf("\n```", blockStart + 1);
  assert.notEqual(fenceEnd, -1, `missing code fence end after ${marker}`);
  return body.slice(blockStart + 1, fenceEnd).trim();
}

function sectionBetween(body, start, end) {
  const startIndex = body.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section ${start}`);
  const endIndex = body.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end ${end}`);
  return body.slice(startIndex, endIndex);
}

function assertNoLegacyFieldLines(body, label) {
  assert.doesNotMatch(
    body,
    LEGACY_FIELD_LINE,
    `${label} must not expose legacy advisory/escalation output fields`,
  );
}

function exampleAgentPaths() {
  return readdirSync(EXAMPLE_AGENT_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => join(EXAMPLE_AGENT_DIR, entry));
}

test("pair-dev source templates expose reduced pair output fields only", () => {
  const producer = read(PRODUCER_TEMPLATE);
  const reviewer = read(REVIEWER_TEMPLATE);
  const producerBlock = codeBlockAfter(producer, "## Output Format");
  const reviewerBlock = codeBlockAfter(reviewer, "## Output Format");

  assert.equal(producerBlock, PRODUCER_BLOCK);
  assert.equal(reviewerBlock, REVIEWER_BLOCK);
  assertNoLegacyFieldLines(producer, "producer template");
  assertNoLegacyFieldLines(reviewer, "reviewer template");
  assert.doesNotMatch(producerBlock, /^Verdict:|^Criteria:|^FAIL items:|^Feedback:/m);
  assert.doesNotMatch(reviewerBlock, /^Status:|^Files created:|^Files modified:|^Diff summary:|^Self-verification:/m);
});

test("pair-dev completed example agents expose reduced role output fields only", () => {
  const paths = exampleAgentPaths();
  assert.ok(paths.length > 0, "expected completed pair-dev example agents");

  for (const path of paths) {
    const body = read(path);
    const label = path.slice(REPO_ROOT.length + 1);
    const outputBlock = codeBlockAfter(body, "## Output Format");

    if (outputBlock.startsWith("Status:")) {
      assert.equal(outputBlock, PRODUCER_BLOCK, `${label} producer block must match reduced shape`);
    } else if (outputBlock.startsWith("Verdict:")) {
      assert.equal(outputBlock, REVIEWER_BLOCK, `${label} reviewer block must match reduced shape`);
    } else {
      assert.fail(`${label} has an unrecognized Output Format block`);
    }

    assertNoLegacyFieldLines(outputBlock, `${label} output block`);
    assert.doesNotMatch(body, LEGACY_FIELD_NAME, `${label} must not advertise legacy advisory fields`);
  }
});

test("agent authoring guidance pins reduced pair surfaces and role exceptions", () => {
  const body = read(AGENT_AUTHORING);
  const rules = sectionBetween(body, "## Output Format Rules", "## Anti-patterns");

  assert.equal(codeBlockAfter(rules, "**Producer variant**"), PRODUCER_BLOCK);
  assert.equal(codeBlockAfter(rules, "**Reviewer variant**"), REVIEWER_BLOCK);
  assert.match(rules, /A pair producer's `Status` is self-report only/);
  assert.match(rules, /The paired reviewer `Verdict` is the Pair turn's load-bearing verdict source/);
  assert.match(
    rules,
    /must not defer in-scope acceptance, verification, or evidence/,
    "producer blocked/out-of-scope field must not authorize self-deferral",
  );
  assert.match(
    rules,
    /returns `Status: FAIL` or `## Structural Issue`; it does not PASS by listing the blocker there/,
    "producer authoring rules must fail or structurally escalate required-scope blockers",
  );
  assert.match(rules, /Planner agents do not emit `Status` or `Escalation`/);
  assert.match(rules, /`next-action` field on a meta-role is load-bearing/);
  assert.match(rules, /Its own `Status: PASS \| FAIL` plus `Self-verification` block is the verdict/);
  assert.match(rules, /must not emit Reviewer-shape fields/);
  assertNoLegacyFieldLines(rules, "agent authoring output rules");
});

test("planner and finalizer templates preserve load-bearing fields and omit legacy field lines", () => {
  const planner = read(PLANNER_TEMPLATE);
  const planning = read(PLANNING_TEMPLATE);
  const finalizer = read(FINALIZER_TEMPLATE);
  const plannerBlock = codeBlockAfter(planner, "## Output Format");
  const finalizerBlock = codeBlockAfter(finalizer, "## Output Format");

  assert.match(plannerBlock, /^EPICs \(this turn\):/m);
  assert.match(plannerBlock, /^Remaining:/m);
  assert.match(plannerBlock, /^next-action: <"done" \| "continue/m);
  assert.match(plannerBlock, /^Additional pairs required:/m);
  assert.doesNotMatch(plannerBlock, /^Status:|^Summary:|^Escalation:/m);
  assert.match(planner, /`next-action` is load-bearing/);
  assert.match(planning, /Planner output contains no task file paths, no `Status`, no `Escalation`/);

  assert.match(finalizerBlock, /^Status: PASS \/ FAIL$/m);
  assert.match(finalizerBlock, /^Self-verification:/m);
  assert.match(finalizerBlock, /^Blocked or out-of-scope items:/m);
  assert.doesNotMatch(finalizerBlock, /^Verdict:|^Criteria:|^FAIL items:|^Escalation:/m);
  assert.match(finalizer, /Optional line: inside the fenced block, include `Files left alone \(intentionally\)/);

  for (const [label, contract] of [
    ["planner template", planner],
    ["planning template", planning],
    ["finalizer template", finalizer],
  ]) {
    assertNoLegacyFieldLines(contract, label);
  }
});

test("runtime contracts reject advisory routing fields and keep Structural Issue as the escalation surface", () => {
  const orchestrate = read(ORCHESTRATE_TEMPLATE);
  const context = read(CONTEXT_TEMPLATE);

  assert.match(orchestrate, /Advisory or escalation routing fields are not part of the runtime output contract/);
  assert.match(orchestrate, /synthesizes the real `Next` from reviewer verdicts, planner `next-action`, finalizer `Status`, and `## Structural Issue`/);
  assert.match(orchestrate, /`## Structural Issue` is the only structural escalation surface/);
  assert.match(context, /Add advisory or escalation routing fields/);
  assert.match(context, /use `Blocked or out-of-scope items`, `Feedback`, or `## Structural Issue` according to role/);

  assertNoLegacyFieldLines(orchestrate, "orchestrate template");
  assertNoLegacyFieldLines(context, "context template");
});
