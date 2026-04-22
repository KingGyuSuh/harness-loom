import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

// Runtime template anchors. These tests pin the load-bearing tokens the
// `harness-orchestrate/SKILL.template.md` body exposes to runtime readers, so a
// future refactor cannot silently drop the Pair/Finalizer separation, the
// role-specific dispatch envelope, the defer-to-end continuation flag, or the
// zero-emit safety.

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
const FINALIZER_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-finalizer.template.md",
);
const STATE_TEMPLATE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/state.template.md",
);
const STATE_SCHEMA = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-orchestrate/references/state-md-schema.md",
);
const DISPATCH_ENVELOPE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-orchestrate/references/dispatch-envelope.md",
);
const STATE_MACHINE = join(
  REPO_ROOT,
  "plugins/harness-loom/skills/harness-init/references/runtime/harness-orchestrate/references/state-machine.md",
);

function sectionBetween(body, start, end) {
  const startIndex = body.indexOf(start);
  assert.notEqual(startIndex, -1, `expected section start ${start}`);
  const endIndex = body.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `expected section end ${end}`);
  return body.slice(startIndex, endIndex);
}

test("orchestrate template exists at the canonical factory path", () => {
  assert.ok(
    existsSync(ORCHESTRATE_TEMPLATE),
    `expected ${ORCHESTRATE_TEMPLATE} to exist`,
  );
});

test("orchestrate template declares the three runtime turn kinds", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Each turn kind must be described as a distinct dispatch path. The
  // canonical four-state DFA diagram (Planner | Pair | Finalizer | Halt)
  // lives in references/state-machine.md; this body cites that reference
  // rather than duplicating the enumeration.
  assert.match(body, /Planner turn/);
  assert.match(body, /Pair turn/);
  assert.match(body, /Finalizer turn/);
  assert.match(
    body,
    /three runtime turn kinds/i,
    "orchestrate must open with the three-turn-kinds framing",
  );
});

test("orchestrate template documents the ↔ segment as the mandatory Pair roster binding", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.ok(
    body.includes("↔"),
    "orchestrate template must reference the `↔` arrow as the Pair roster marker",
  );
  assert.match(
    body,
    /↔\s*reviewer|↔\s*reviewers/,
    "orchestrate must show the ↔ arrow connecting producer to reviewer(s) in the Pair line shape",
  );
  assert.match(
    body,
    /`↔` segment binds a producer to its reviewer set/,
    "orchestrate must define the ↔ segment as the producer/reviewer binding",
  );
  assert.match(
    body,
    /line position is the producer's global stage index/,
    "orchestrate must preserve the roster line-position global stage anchor",
  );
});

test("runtime DFA reference keeps the four-state transition contract", () => {
  const body = readFileSync(STATE_MACHINE, "utf8");
  for (const state of ["Planner", "Pair", "Finalizer", "Halt"]) {
    assert.ok(body.includes(`\`${state}\``), `DFA must name ${state}`);
  }
  assert.match(body, /Planner\s+-> Pair\s+\(ready set non-empty\)/);
  assert.match(body, /Pair\s+-> Planner\s+\(planner recall\)/);
  assert.match(body, /Finalizer -> Halt\s+\(PASS\)/);
  assert.match(body, /Finalizer -> Planner\s+\(FAIL \/ RETREAT\)/);
  assert.match(
    body,
    /all live EPICs terminal \+ `planner-continuation: none`/,
    "DFA must keep the terminal finalizer gate tied to planner-continuation: none",
  );
});

test("orchestrate template documents the Finalizer contract — no review files, own Status as verdict", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.match(
    body,
    /## Finalizer turn contract/,
    "orchestrate must carry a dedicated Finalizer turn contract section",
  );
  // The contract must state the finalizer leaves no reviews (rendered either
  // as "Review — none" in the artifact list or "0 review files" in prose).
  assert.match(
    body,
    /Review[^\n]*(—|--)\s*none|0 review files/i,
    "Finalizer turn contract must state the finalizer leaves no review file",
  );
  assert.match(
    body,
    /Status:\s*PASS\s*\|\s*FAIL/,
    "Finalizer verdict source must be the finalizer's own Status: PASS|FAIL",
  );
  assert.ok(
    body.includes("Self-verification"),
    "Finalizer verdict must cite Self-verification evidence",
  );
  // Finalizer artifacts live in their own subtree, not under epics/.
  assert.match(
    body,
    /\.harness\/cycle\/finalizer\/tasks\//,
    "Finalizer task path must live at `.harness/cycle/finalizer/tasks/`",
  );
});

test("orchestrate template points to the loom-root registry for Pair roster lookup", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Registry lives at loom root, shared between orchestrator (read) and
  // pair-authoring tooling (write). Orchestrate SKILL body must reference
  // the registry rather than embedding the roster sections.
  assert.match(
    body,
    /`\.harness\/loom\/registry\.md`/,
    "orchestrate must cite `.harness/loom/registry.md` as the roster source",
  );
  assert.doesNotMatch(
    body,
    /^## Registered pairs$/m,
    "orchestrate must not embed a Registered pairs section — the registry owns it",
  );
  assert.doesNotMatch(
    body,
    /^## Registered finalizers$/m,
    "orchestrate must not embed a Registered finalizers section — the finalizer is a singleton",
  );
  // Finalizer dispatch uses the fixed `harness-finalizer` slug, not a list.
  assert.match(
    body,
    /Next\.To = harness-finalizer/,
    "orchestrate must synthesize `Next.To = harness-finalizer` directly (singleton dispatch, no list iteration)",
  );
});

test("orchestrate template defines the Finalizer-retreat blocked halt rule", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // Finalizer FAIL → planner recall → planner emits 0 EPICs would otherwise
  // infinite-loop (Finalizer → Planner → Finalizer). The blocked-halt rule
  // cuts that loop by halting with user intervention.
  assert.match(
    body,
    /Finalizer-retreat blocked halt/,
    "orchestrate must declare the Finalizer-retreat blocked halt rule by name",
  );
  assert.match(
    body,
    /\(retreat reason: finalizer/,
    "blocked halt rule must key off the `(retreat reason: finalizer ...)` Intent prefix",
  );
  // Finalizer rule 3 must explicitly state that FAIL/RETREAT does NOT touch
  // planner-continuation; the flag stays planner-owned and recovery is
  // bounded by the blocked-halt rule above.
  assert.match(
    body,
    /Do not touch `planner-continuation`/,
    "Finalizer rule 3 must state planner-continuation is untouched on FAIL/RETREAT",
  );
});

test("state-md-schema marks planner-continuation as planner-owned", () => {
  const body = readFileSync(STATE_SCHEMA, "utf8");
  assert.match(
    body,
    /planner-owned/i,
    "schema must mark planner-continuation as planner-owned",
  );
  // The sole-writer rule is what keeps Finalizer FAIL/RETREAT from touching
  // the flag. If the schema says "Written only from planner next-action",
  // that's equivalent to "Finalizer does not touch it".
  assert.match(
    body,
    /Written only from planner/i,
    "schema must state the flag is written only from planner next-action so Finalizer/etc. cannot overload it",
  );
});

test("orchestrate template keeps one-turn persistence and verdict anchors", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.match(
    body,
    /Turn rhythm \(one response = consume `Next`, produce the next `Next`\)/,
    "orchestrate must keep one response scoped to one runtime turn",
  );
  assert.match(body, /Persist artifacts by turn kind/);
  assert.match(body, /Extract the verdict/);
  assert.match(
    body,
    /Raise `loop: true` only if a valid next dispatch exists/,
    "orchestrate must not re-enter without a committed valid Next",
  );
  assert.match(
    body,
    /Subagents run with `fork_context=false`/,
    "orchestrate must keep subagent evidence isolated from producer transcript/tool trace",
  );
});

test("orchestrate template exposes Pair and Finalizer verdict branches", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.match(body, /#### Pair verdict branch/);
  assert.match(body, /The verdict source is the aggregated reviewer set/);
  assert.match(body, /Rework \(FAIL\)/);
  assert.match(body, /Retreat \(structural\)/);
  assert.match(body, /Forward advance \(PASS\)/);
  assert.match(body, /#### Finalizer verdict branch/);
  // Finalizer FAIL/RETREAT must route to planner recall (no in-place rework).
  assert.match(
    body,
    /FAIL or RETREAT[\s\S]{0,200}planner recall/i,
    "Finalizer FAIL/RETREAT must route to planner recall",
  );
  assert.match(
    body,
    /not (reworked in place|in-place rework)/i,
    "Finalizer rules must declare no in-place rework",
  );
});

test("dispatch envelope defines role-specific minimum fields without forwarding placeholders", () => {
  const body = readFileSync(DISPATCH_ENVELOPE, "utf8");
  const common = sectionBetween(body, "## Common fields", "## Pair envelope");
  const pair = sectionBetween(body, "## Pair envelope", "## Planner envelope");
  const planner = sectionBetween(body, "## Planner envelope", "## Finalizer envelope");
  const finalizer = body.slice(body.indexOf("## Finalizer envelope"));

  for (const token of [
    "`Goal`",
    "`User request snapshot`",
    "`Turn intent`",
    "`Scope`",
  ]) {
    assert.ok(common.includes(token), `common envelope must include ${token}`);
  }
  assert.match(
    common,
    /`Turn intent` — the subagent-facing copy of `Next\.Intent`/,
    "dispatch envelope must expose Next.Intent as Turn intent",
  );
  assert.match(
    common,
    /Omit placeholder fields that do not apply to the role/,
    "dispatch envelope must omit unrelated-role placeholder fields",
  );

  for (const token of [
    "`Focus EPIC`",
    "`Task path`",
    "`Prior tasks`",
    "`Prior reviews`",
    "`rubric: skills/<slug>/SKILL.md`",
  ]) {
    assert.ok(pair.includes(token), `pair envelope must include ${token}`);
  }
  assert.match(pair, /reviewer-only `Axis`/);

  for (const token of [
    "`Existing EPICs`",
    "`Recent events`",
    "`Registered roster`",
  ]) {
    assert.ok(planner.includes(token), `planner envelope must include ${token}`);
  }
  assert.match(
    planner,
    /Planner envelopes do not include `Task path: \(none\)` or `Focus EPIC: \(none\)` placeholders/,
    "planner envelope must explicitly avoid task/EPIC placeholders",
  );

  for (const token of ["`Task path`", "`Prior tasks`", "`Prior reviews`"]) {
    assert.ok(finalizer.includes(token), `finalizer envelope must include ${token}`);
  }
  assert.match(
    finalizer,
    /Finalizer envelopes do not include `Focus EPIC: \(none\)`, a pair rubric line, or reviewer-only `Axis`/,
    "finalizer envelope must avoid unrelated Pair/EPIC fields",
  );
});

test("harness-context stays subagent-facing and omits orchestrator routing law", () => {
  const body = readFileSync(CONTEXT_TEMPLATE, "utf8");
  assert.match(body, /orchestrator decides routing, state updates, and re-dispatch/);
  assert.match(body, /role-specific envelope/);
  assert.match(body, /Common fields.*`Goal`, `User request snapshot`, `Turn intent`, and `Scope`/s);
  assert.doesNotMatch(body, /Phase advance/);
  assert.doesNotMatch(body, /Pair verdict branch/);
  assert.doesNotMatch(body, /Finalizer verdict branch/);
  assert.doesNotMatch(body, /Terminal resolution/);
  assert.doesNotMatch(body, /ready set/);
  assert.doesNotMatch(body, /planner-continuation:/);
});

test("orchestrate template gates dispatch through a ready set at the same global roster position", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.ok(
    body.includes("ready set"),
    "orchestrate template must define a ready set before dispatch",
  );
  assert.ok(
    body.includes("same global roster position"),
    "orchestrate template must state upstream gating happens at the same global roster position",
  );
});

test("planning template teaches global roster subsequence and next-action grammar", () => {
  const body = readFileSync(PLANNING_TEMPLATE, "utf8");
  assert.ok(
    body.includes("global roster order"),
    "planning template must describe the project-global roster order",
  );
  assert.ok(
    body.includes("subsequence"),
    "planning template must say each EPIC roster is a subsequence of that global roster",
  );
  assert.ok(
    body.includes("next-action: done"),
    "planning template must document the done signal",
  );
  assert.ok(
    body.includes("next-action: continue"),
    "planning template must document the continue signal",
  );
  assert.match(
    body,
    /defer-to-end|after .* terminal/i,
    "planning template must describe continue as defer-to-end, not immediate recall",
  );
});

test("planning template distinguishes structural-issue recall from defer-to-end recall", () => {
  const body = readFileSync(PLANNING_TEMPLATE, "utf8");
  assert.ok(
    body.includes("(retreat reason:"),
    "planning template must name the retreat Intent prefix so the planner knows it is a structural recall",
  );
  assert.ok(
    body.includes("(planner continuation:"),
    "planning template must name the continuation Intent prefix so the planner knows to re-plan against events.md",
  );
});

test("planner agent template exposes next-action as load-bearing", () => {
  const body = readFileSync(PLANNER_TEMPLATE, "utf8");
  assert.match(
    body,
    /next-action: <"done"\s*\|\s*"continue/,
    "planner Output Format must show the load-bearing next-action grammar",
  );
  assert.ok(
    body.includes("defer-to-end"),
    "planner description must mention defer-to-end so authors do not expect next-turn recall",
  );
});

test("finalizer template is a safe-no-op cycle-end agent with Status + Structural Issue", () => {
  const body = readFileSync(FINALIZER_TEMPLATE, "utf8");
  assert.ok(existsSync(FINALIZER_TEMPLATE), "harness-finalizer template must exist");
  assert.match(body, /^name: harness-finalizer$/m);
  // Skills list carries only harness-context — no separate pair skill.
  assert.match(body, /^skills:\s*\n\s*-\s*harness-context\s*$/m);
  // Body must self-identify as a safe no-op so a fresh install's first
  // cycle terminates cleanly even without project-specific cycle-end work.
  assert.match(
    body,
    /safe no-op/i,
    "finalizer body must declare itself a safe no-op until the project authors concrete cycle-end work",
  );
  assert.match(
    body,
    /no cycle-end work registered/,
    "finalizer body must seed the canonical no-op Summary phrase",
  );
  // Output Format must carry Status + Self-verification.
  assert.match(body, /Status:\s*PASS\s*\/\s*FAIL/);
  assert.match(body, /Self-verification:/);
  // Structural Issue block retreats to planner — finalizer's only retreat target.
  assert.match(body, /## Structural Issue/);
  assert.match(body, /Suspected upstream stage:\s*planner/i);
});

test("state schema documents the 4-line header including planner-continuation", () => {
  const body = readFileSync(STATE_SCHEMA, "utf8");
  assert.match(
    body,
    /four-line header/,
    "schema must describe the header as four lines now that planner-continuation exists",
  );
  assert.match(
    body,
    /^planner-continuation: <pending\|none>$/m,
    "schema must show the planner-continuation canonical grammar",
  );
  assert.match(
    body,
    /\(planner continuation: \.\.\.\)/,
    "schema must document the Intent prefix for defer-to-end recalls",
  );
  assert.match(
    body,
    /\(retreat reason: \.\.\.\)/,
    "schema must keep the retreat Intent prefix so planner can distinguish recall modes",
  );
});

test("state.template.md initializes planner-continuation: none", () => {
  const body = readFileSync(STATE_TEMPLATE, "utf8");
  assert.match(
    body,
    /^planner-continuation: none$/m,
    "fresh cycle state must default planner-continuation to none so cold start is deterministic",
  );
});

test("runtime templates propagate the cycle-local user request snapshot", () => {
  const orchestrate = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  const context = readFileSync(CONTEXT_TEMPLATE, "utf8");
  const planner = readFileSync(PLANNER_TEMPLATE, "utf8");
  const planning = readFileSync(PLANNING_TEMPLATE, "utf8");
  const dispatch = readFileSync(DISPATCH_ENVELOPE, "utf8");
  const schema = readFileSync(STATE_SCHEMA, "utf8");
  const finalizer = readFileSync(FINALIZER_TEMPLATE, "utf8");
  const scopedRuntimeContracts = [
    orchestrate,
    context,
    planner,
    planning,
    dispatch,
    schema,
    finalizer,
  ];

  for (const body of scopedRuntimeContracts) {
    assert.match(
      body,
      /User request snapshot/,
      "runtime contracts must name the User request snapshot envelope field",
    );
    assert.doesNotMatch(body, /Goal source/);
    assert.doesNotMatch(body, /Reference materials/);
    assert.doesNotMatch(body, /\.harness\/cycle\/goal\.md/);
    assert.doesNotMatch(body, /Current phase/);
    assert.match(
      body,
      /Turn intent/,
      "runtime contracts must use Turn intent for subagent-facing Next.Intent",
    );
  }
  for (const body of [orchestrate, dispatch, schema]) {
    assert.match(
      body,
      /\.harness\/cycle\/user-request-snapshot\.md/,
      "orchestrator-owned contracts must point at the cycle-local request snapshot",
    );
  }
  assert.match(
    orchestrate,
    /every Planner, Pair, and Finalizer envelope/,
    "orchestrate must explicitly carry the snapshot through every turn kind",
  );
  assert.match(
    context,
    /Read `User request snapshot` before narrowing the work if it contains constraints beyond `Turn intent`/,
  );
  assert.match(
    planner,
    /Read `Goal`, `User request snapshot`[\s\S]{0,120}`Turn intent`/,
  );
  assert.match(
    planning,
    /Prefer `User request snapshot` over the short `Goal` summary/i,
  );
  assert.match(
    dispatch,
    /planner, pair producers\/reviewers, and the finalizer read it/i,
  );
  assert.match(
    schema,
    /harness-init` must not seed a placeholder snapshot/,
    "schema must keep install-time placeholder snapshots out of the contract",
  );
});

test("orchestrate template encodes the defer-to-end continuation flow", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.ok(
    body.includes("planner-continuation: pending"),
    "orchestrate must write planner-continuation: pending from next-action=continue",
  );
  assert.ok(
    body.includes("planner-continuation: none"),
    "orchestrate must describe the cleared flag state",
  );
  assert.ok(
    body.includes("defer-to-end"),
    "orchestrate must label the continuation semantics as defer-to-end",
  );
  // Terminal resolution is the dedicated subsection that consumes the flag
  // once every live EPIC is terminal; it is called from both Planner and
  // Pair branches so the rule lives in one place.
  assert.match(
    body,
    /Terminal resolution/,
    "orchestrate must name the Terminal resolution subsection that consumes the planner-continuation flag",
  );
});

test("orchestrate zero-emit handling prevents pathological continuation", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  // The Zero-emit handling subsection groups three cases (blocked halt,
  // finalizer-retreat halt, continuation zero-emit → force `none`) before
  // any new dispatch. It replaces the older single "Zero-emit safety" clause.
  assert.match(
    body,
    /Zero-emit handling/i,
    "orchestrate must retain the Zero-emit handling subsection that prevents pathological continuation",
  );
  // The continuation-zero-emit case must force `planner-continuation: none`
  // so a planner that cannot produce new work cannot stall halt forever.
  assert.match(
    body,
    /zero new executable EPICs[\s\S]{0,200}force\s+`?planner-continuation:\s*none`?/i,
    "Zero-emit handling must force `planner-continuation: none` on defer-to-end recall emitting zero EPICs",
  );
});

test("runtime templates outside the finalizer do not reference factory-only plugin surfaces", () => {
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
    "/harness-pair-dev",
    "/harness-init",
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
