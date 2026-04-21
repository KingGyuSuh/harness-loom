import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

// Runtime template anchors. These tests pin the load-bearing tokens the
// `harness-orchestrate/SKILL.template.md` body exposes to runtime readers, so a
// future refactor cannot silently drop the Pair/Finalizer separation, the
// defer-to-end continuation flag, or the zero-emit safety.

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

test("orchestrate template documents the ↔ arrow as the mandatory Pair roster token", () => {
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
    /`↔`\s*arrow\s*is\s*load-bearing/i,
    "orchestrate must flag the ↔ arrow as load-bearing so parsers cannot treat it as decoration",
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

test("orchestrate template exposes Phase advance — Pair rules and Phase advance — Finalizer rules", () => {
  const body = readFileSync(ORCHESTRATE_TEMPLATE, "utf8");
  assert.match(body, /Phase advance — Pair rules/);
  assert.match(body, /Phase advance — Finalizer rules/);
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

