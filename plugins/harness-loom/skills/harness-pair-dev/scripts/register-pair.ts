#!/usr/bin/env node
// Purpose: Register a newly authored producer-reviewer pair into an existing
//          target harness. Inserts a roster line into both
//          `<target>/.harness/loom/skills/harness-orchestrate/SKILL.md` and
//          `<target>/.harness/loom/skills/harness-planning/SKILL.md` so the
//          orchestrator and planner discover the new department.
//
//          Registrations write to `.harness/loom/` (canonical staging), not to
//          any derived platform tree. Pair agent/skill files authored alongside
//          this registration also live under `.harness/loom/{agents, skills}/`.
//          Platform deploy of those new files happens only when the user runs
//          `node .harness/loom/sync.ts --provider <list>`.
//
// Supports 1:M pairs (one producer, multiple reviewers) via repeated
// `--reviewer <slug>` flags. The orchestrator dispatches all reviewers in
// parallel in a single response; each reviewer grades a different axis of
// the producer's task.
//
// Also supports a reviewer-less producer-only group via the special value
// `--reviewer none`. In that mode no reviewer agent is expected and the
// registration line carries `(no reviewer)` instead of the `↔ reviewer …`
// segment. `none` may not be combined with real reviewer slugs.
//
// Usage:
//   node skills/harness-pair-dev/scripts/register-pair.ts \
//     --target <path> --pair <slug> --producer <slug> \
//     --reviewer <slug> [--reviewer <slug> ...] --skill <slug> \
//     [--before <pair-slug> | --after <pair-slug>]
//   node skills/harness-pair-dev/scripts/register-pair.ts \
//     --target <path> --pair <slug> --producer <slug> \
//     --reviewer none --skill <slug> \
//     [--before <pair-slug> | --after <pair-slug>]
//
// Idempotent with one nuance: re-registering the same pair slug without
// `--before`/`--after` is an in-place replace (roster position is preserved);
// re-registering WITH an anchor removes the old line and re-inserts at the
// anchor (that is how a caller deliberately moves a pair). See `insertEntry`
// below for the full semantics matrix. Both skill files must already exist
// (run /harness-init first).

import { readFile, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import process from "node:process";

interface Args {
  target: string;
  pair: string;
  producer: string;
  reviewers: string[];
  reviewerless: boolean;
  skill: string;
  before?: string;
  after?: string;
  unregister: boolean;
}

interface Placement {
  mode: "append" | "before" | "after";
  anchor?: string;
}

// Special value for `--reviewer` that selects a reviewer-less producer-only
// group. Kept as a top-level constant so the docs string and the parser stay
// in sync.
const REVIEWER_NONE = "none";

function die(message: string, code = 1): never {
  process.stderr.write(`register-pair: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  const out: Partial<Args> & { reviewers?: string[]; unregister?: boolean } = {
    reviewers: [],
    reviewerless: false,
    unregister: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-pair-dev/scripts/register-pair.ts " +
          "--target <path> --pair <harness-slug> --producer <harness-slug> " +
          "--reviewer <harness-slug> [--reviewer <harness-slug> ...] --skill <harness-slug> " +
          "[--before <harness-pair> | --after <harness-pair>]\n" +
          "       node skills/harness-pair-dev/scripts/register-pair.ts " +
          "--target <path> --pair <harness-slug> --producer <harness-slug> " +
          "--reviewer none --skill <harness-slug> " +
          "[--before <harness-pair> | --after <harness-pair>]\n" +
          "       node skills/harness-pair-dev/scripts/register-pair.ts " +
          "--unregister --target <path> --pair <harness-slug>\n" +
          "All pair/producer/reviewer/skill slugs must start with \"harness-\".\n" +
          "Use --before/--after to place the pair in the global roster order.\n" +
          "Pass `--reviewer none` (and only that) to register a reviewer-less producer-only group.\n",
      );
      process.exit(0);
    } else if (arg === "--unregister") out.unregister = true;
    else if (arg === "--target") out.target = rest[++i];
    else if (arg === "--pair") out.pair = rest[++i];
    else if (arg === "--producer") out.producer = rest[++i];
    else if (arg === "--reviewer") out.reviewers!.push(rest[++i]);
    else if (arg === "--skill") out.skill = rest[++i];
    else if (arg === "--before") out.before = rest[++i];
    else if (arg === "--after") out.after = rest[++i];
    else die(`unknown argument: ${arg}`);
  }
  // All generated subagents and skills must live under the `harness-` namespace
  // so they are unambiguously part of the harness inside `.harness/loom/`. The
  // regex also rejects the bare `harness-` and `harness--x` to prevent artifacts
  // from a naive prepend on an empty or malformed input.
  const prefixRe = /^harness-[a-z0-9]+(-[a-z0-9]+)*$/;
  if (out.unregister) {
    for (const key of ["target", "pair"] as const) {
      if (!out[key]) die(`--${key} is required`);
    }
    if (out.before || out.after) die("--before/--after cannot be used with --unregister");
    if (!prefixRe.test(out.pair as string))
      die(`--pair must start with "harness-" (got: ${out.pair})`);
    return { ...out, producer: "", skill: "", reviewers: [], reviewerless: false } as Args;
  }
  for (const key of ["target", "pair", "producer", "skill"] as const) {
    if (!out[key]) die(`--${key} is required`);
  }
  if (out.before && out.after) die("use either --before or --after, not both");
  if (!out.reviewers || out.reviewers.length === 0) die("at least one --reviewer is required");
  // Reviewer-less mode: `--reviewer none` is the only allowed value when present.
  // Mixing it with real reviewer slugs is rejected because it would silently
  // discard either the reviewer roster or the reviewer-less intent.
  const noneCount = out.reviewers.filter((r) => r === REVIEWER_NONE).length;
  if (noneCount > 0) {
    if (out.reviewers.length !== 1)
      die(`--reviewer ${REVIEWER_NONE} cannot be combined with other --reviewer values`);
    out.reviewerless = true;
    out.reviewers = [];
  }
  for (const key of ["pair", "producer", "skill"] as const) {
    if (!prefixRe.test(out[key] as string))
      die(`--${key} must start with "harness-" (got: ${out[key]})`);
  }
  for (const [flag, value] of [["--before", out.before], ["--after", out.after]] as const) {
    if (value && !prefixRe.test(value)) die(`${flag} must start with "harness-" (got: ${value})`);
  }
  if (out.before === out.pair || out.after === out.pair)
    die("pair placement anchor cannot reference the same pair being registered");
  for (const r of out.reviewers) {
    if (!prefixRe.test(r)) die(`--reviewer must start with "harness-" (got: ${r})`);
  }
  const dup = new Set<string>();
  for (const r of out.reviewers) {
    if (dup.has(r)) die(`duplicate --reviewer: ${r}`);
    dup.add(r);
  }
  return out as Args;
}

function registrationPair(line: string): string | null {
  const match = line.match(/^-\s+([a-z0-9][a-z0-9-]*)\s*:/);
  return match ? match[1] : null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function placementFromArgs(args: Args): Placement {
  if (args.before) return { mode: "before", anchor: args.before };
  if (args.after) return { mode: "after", anchor: args.after };
  return { mode: "append" };
}

// Re-registration semantics (important for docs-sync and orchestrator roster
// reads, both of which are position-sensitive):
//
//   - `append` mode + pair already present → in-place replace (position held).
//     Running `--add` twice with no anchor is idempotent for the roster order.
//   - `before`/`after` mode + pair already present → remove the existing line
//     and re-insert at the anchor. Re-registering with a fresh anchor is how
//     a caller deliberately moves a pair; anchor-driven re-registration is
//     NOT a no-op on position.
//   - `append` mode + pair absent → push to end.
//   - `before`/`after` mode + pair absent → insert at the anchor.
function insertEntry(
  entries: string[],
  pair: string,
  entry: string,
  placement: Placement,
): string[] {
  const existingIndex = entries.findIndex((line) => registrationPair(line) === pair);
  if (placement.mode === "append" && existingIndex !== -1) {
    const nextEntries = [...entries];
    nextEntries.splice(existingIndex, 1, entry);
    return nextEntries;
  }
  const nextEntries = entries.filter((line) => registrationPair(line) !== pair);
  if (placement.anchor) {
    const anchorIndex = nextEntries.findIndex((line) => registrationPair(line) === placement.anchor);
    if (anchorIndex === -1) die(`placement anchor not found in section: ${placement.anchor}`);
    const insertAt = placement.mode === "before" ? anchorIndex : anchorIndex + 1;
    nextEntries.splice(insertAt, 0, entry);
    return nextEntries;
  }
  nextEntries.push(entry);
  return nextEntries;
}

async function upsertSection(
  filePath: string,
  heading: string,
  pair: string,
  entry: string,
  placement: Placement,
): Promise<{ changed: boolean }> {
  const raw = await readFile(filePath, "utf8");
  let next: string;
  const headingLine = `## ${heading}`;
  if (raw.includes(headingLine)) {
    const idx = raw.indexOf(headingLine);
    const bodyStart = raw.indexOf("\n", idx) + 1;
    const nextHeading = raw.indexOf("\n## ", bodyStart);
    const bodyEnd = nextHeading === -1 ? raw.length : nextHeading;
    const sectionBody = raw.slice(bodyStart, bodyEnd);
    const lines = sectionBody.split("\n");
    const registrationIndices = lines
      .map((line, index) => ({ index, pair: registrationPair(line) }))
      .filter((item) => item.pair !== null);

    let nextSectionBody: string;
    if (registrationIndices.length === 0) {
      if (placement.anchor) die(`placement anchor not found in empty section: ${placement.anchor}`);
      const trimmedBody = sectionBody.replace(/\s*$/, "");
      nextSectionBody = trimmedBody.length === 0 ? `\n${entry}\n` : `${trimmedBody}\n\n${entry}\n`;
    } else {
      const firstRegistration = registrationIndices[0].index;
      const lastRegistration = registrationIndices[registrationIndices.length - 1].index;
      const prefix = lines.slice(0, firstRegistration);
      const entries = lines
        .slice(firstRegistration, lastRegistration + 1)
        .filter((line) => registrationPair(line) !== null);
      const suffix = lines.slice(lastRegistration + 1);
      const updatedEntries = insertEntry(entries, pair, entry, placement);
      nextSectionBody = [...prefix, ...updatedEntries, ...suffix].join("\n");
    }
    next = raw.slice(0, bodyStart) + nextSectionBody + raw.slice(bodyEnd);
  } else {
    const sep = raw.endsWith("\n") ? "" : "\n";
    next = `${raw}${sep}\n${headingLine}\n\n${entry}\n`;
  }
  if (next === raw) return { changed: false };
  await writeFile(filePath, next);
  return { changed: true };
}

// Remove the roster line for `pair` from a specific `## <heading>` section
// only. Matches entries written by this script (`- <pair>: ...`). Lines outside
// the section are preserved verbatim even if they happen to share the prefix
// (e.g., prose elsewhere in the SKILL that documents what a registration line
// looks like must stay intact).
async function removeFromSection(
  filePath: string,
  heading: string,
  pair: string,
): Promise<{ changed: boolean }> {
  const raw = await readFile(filePath, "utf8");
  const headingLine = `## ${heading}`;
  const headingIdx = raw.indexOf(headingLine);
  if (headingIdx === -1) return { changed: false };
  const bodyStart = raw.indexOf("\n", headingIdx) + 1;
  const nextHeading = raw.indexOf("\n## ", bodyStart);
  const bodyEnd = nextHeading === -1 ? raw.length : nextHeading;
  const sectionBody = raw.slice(bodyStart, bodyEnd);
  const kept = sectionBody
    .split("\n")
    .filter((line) => registrationPair(line) !== pair);
  const nextSectionBody = kept.join("\n");
  if (nextSectionBody === sectionBody) return { changed: false };
  const next = raw.slice(0, bodyStart) + nextSectionBody + raw.slice(bodyEnd);
  await writeFile(filePath, next);
  return { changed: true };
}

async function main() {
  const args = parseArgs(process.argv);
  const target = isAbsolute(args.target) ? args.target : resolve(process.cwd(), args.target);
  const orchestratePath = join(target, ".harness", "loom", "skills", "harness-orchestrate", "SKILL.md");
  const planningPath = join(target, ".harness", "loom", "skills", "harness-planning", "SKILL.md");

  if (!(await exists(orchestratePath))) die(`missing ${orchestratePath} (run /harness-init first)`);
  if (!(await exists(planningPath))) die(`missing ${planningPath} (run /harness-init first)`);

  if (args.unregister) {
    const orchestrate = await removeFromSection(orchestratePath, "Registered pairs", args.pair);
    const planning = await removeFromSection(planningPath, "Available departments", args.pair);
    const summary = {
      target,
      pair: args.pair,
      action: "unregister",
      orchestrate: { path: orchestratePath, changed: orchestrate.changed },
      planning: { path: planningPath, changed: planning.changed },
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    return;
  }

  // Three registration shapes, distinguishable by token without ambiguity:
  //   1:1     - <pair>: producer `<p>` ↔ reviewer `<r>`, skill `<s>`
  //   1:M     - <pair>: producer `<p>` ↔ reviewers [`<r1>`, `<r2>`], skill `<s>`
  //   1:0     - <pair>: producer `<p>` (no reviewer), skill `<s>`
  // The `↔` arrow is the load-bearing token: present iff a reviewer roster
  // exists. The orchestrator uses its absence to recognize a producer-only
  // group that is "not subject to review" rather than "passed without review".
  let entry: string;
  if (args.reviewerless) {
    entry = `- ${args.pair}: producer \`${args.producer}\` (no reviewer), skill \`${args.skill}\``;
  } else {
    const reviewerList = args.reviewers.map((r) => `\`${r}\``).join(", ");
    const reviewerField =
      args.reviewers.length === 1
        ? `reviewer ${reviewerList}`
        : `reviewers [${reviewerList}]`;
    entry = `- ${args.pair}: producer \`${args.producer}\` ↔ ${reviewerField}, skill \`${args.skill}\``;
  }

  const placement = placementFromArgs(args);
  const orchestrate = await upsertSection(
    orchestratePath,
    "Registered pairs",
    args.pair,
    entry,
    placement,
  );
  const planning = await upsertSection(
    planningPath,
    "Available departments",
    args.pair,
    entry,
    placement,
  );

  const summary = {
    target,
    pair: args.pair,
    entry,
    placement,
    orchestrate: { path: orchestratePath, changed: orchestrate.changed },
    planning: { path: planningPath, changed: planning.changed },
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
