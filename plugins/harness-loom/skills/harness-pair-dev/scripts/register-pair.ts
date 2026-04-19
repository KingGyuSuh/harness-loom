#!/usr/bin/env node
// Purpose: Register a newly authored producer-reviewer pair into an existing
//          target harness. Appends a Roster line to both
//          `<target>/.claude/skills/harness-orchestrate/SKILL.md` and
//          `<target>/.claude/skills/harness-planning/SKILL.md` so the
//          orchestrator and planner discover the new department.
//
// Supports 1:M pairs (one producer, multiple reviewers) via repeated
// `--reviewer <slug>` flags. The orchestrator dispatches all reviewers in
// parallel in a single response; each reviewer grades a different axis of
// the producer's task.
//
// Usage:
//   node skills/harness-pair-dev/scripts/register-pair.ts \
//     --target <path> --pair <slug> --producer <slug> \
//     --reviewer <slug> [--reviewer <slug> ...] --skill <slug>
//
// Idempotent: if the exact roster line already exists we leave the file
// unchanged. Both skill files must already exist (run /harness-init first).

import { readFile, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import process from "node:process";

interface Args {
  target: string;
  pair: string;
  producer: string;
  reviewers: string[];
  skill: string;
  unregister: boolean;
}

function die(message: string, code = 1): never {
  process.stderr.write(`register-pair: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  const out: Partial<Args> & { reviewers?: string[]; unregister?: boolean } = {
    reviewers: [],
    unregister: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-pair-dev/scripts/register-pair.ts " +
          "--target <path> --pair <harness-slug> --producer <harness-slug> " +
          "--reviewer <harness-slug> [--reviewer <harness-slug> ...] --skill <harness-slug>\n" +
          "       node skills/harness-pair-dev/scripts/register-pair.ts " +
          "--unregister --target <path> --pair <harness-slug>\n" +
          "All pair/producer/reviewer/skill slugs must start with \"harness-\".\n",
      );
      process.exit(0);
    } else if (arg === "--unregister") out.unregister = true;
    else if (arg === "--target") out.target = rest[++i];
    else if (arg === "--pair") out.pair = rest[++i];
    else if (arg === "--producer") out.producer = rest[++i];
    else if (arg === "--reviewer") out.reviewers!.push(rest[++i]);
    else if (arg === "--skill") out.skill = rest[++i];
    else die(`unknown argument: ${arg}`);
  }
  // All generated subagents and skills must live under the `harness-` namespace
  // so they are unambiguously part of the harness inside `.claude/`. The regex
  // also rejects the bare `harness-` and `harness--x` to prevent artifacts from
  // a naive prepend on an empty or malformed input.
  const prefixRe = /^harness-[a-z0-9]+(-[a-z0-9]+)*$/;
  if (out.unregister) {
    for (const key of ["target", "pair"] as const) {
      if (!out[key]) die(`--${key} is required`);
    }
    if (!prefixRe.test(out.pair as string))
      die(`--pair must start with "harness-" (got: ${out.pair})`);
    return { ...out, producer: "", skill: "", reviewers: [] } as Args;
  }
  for (const key of ["target", "pair", "producer", "skill"] as const) {
    if (!out[key]) die(`--${key} is required`);
  }
  if (!out.reviewers || out.reviewers.length === 0) die("at least one --reviewer is required");
  for (const key of ["pair", "producer", "skill"] as const) {
    if (!prefixRe.test(out[key] as string))
      die(`--${key} must start with "harness-" (got: ${out[key]})`);
  }
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function appendSection(
  filePath: string,
  heading: string,
  entry: string,
): Promise<{ changed: boolean }> {
  const raw = await readFile(filePath, "utf8");
  if (raw.includes(entry)) return { changed: false };
  let next: string;
  const headingLine = `## ${heading}`;
  if (raw.includes(headingLine)) {
    // Append under existing section: insert line before next top-level heading or EOF.
    const idx = raw.indexOf(headingLine);
    const afterHeading = raw.indexOf("\n", idx);
    const nextHeading = raw.indexOf("\n## ", afterHeading + 1);
    const insertAt = nextHeading === -1 ? raw.length : nextHeading;
    const before = raw.slice(0, insertAt).replace(/\s*$/, "");
    const after = raw.slice(insertAt);
    next = `${before}\n${entry}\n${after.startsWith("\n") ? after : "\n" + after}`;
  } else {
    const sep = raw.endsWith("\n") ? "" : "\n";
    next = `${raw}${sep}\n${headingLine}\n\n${entry}\n`;
  }
  await writeFile(filePath, next);
  return { changed: true };
}

// Remove the roster line(s) that start with `- <pair-slug>:` (matching both the
// single-reviewer and multi-reviewer entry formats this script emits).
async function removeSection(filePath: string, pair: string): Promise<{ changed: boolean }> {
  const raw = await readFile(filePath, "utf8");
  const linePrefix = `- ${pair}:`;
  const lines = raw.split("\n");
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    if (line.startsWith(linePrefix)) {
      removed++;
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) return { changed: false };
  await writeFile(filePath, kept.join("\n"));
  return { changed: true };
}

async function main() {
  const args = parseArgs(process.argv);
  const target = isAbsolute(args.target) ? args.target : resolve(process.cwd(), args.target);
  const orchestratePath = join(target, ".claude", "skills", "harness-orchestrate", "SKILL.md");
  const planningPath = join(target, ".claude", "skills", "harness-planning", "SKILL.md");

  if (!(await exists(orchestratePath))) die(`missing ${orchestratePath} (run /harness-init first)`);
  if (!(await exists(planningPath))) die(`missing ${planningPath} (run /harness-init first)`);

  if (args.unregister) {
    const orchestrate = await removeSection(orchestratePath, args.pair);
    const planning = await removeSection(planningPath, args.pair);
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

  const reviewerList = args.reviewers.map((r) => `\`${r}\``).join(", ");
  const reviewerField =
    args.reviewers.length === 1
      ? `reviewer ${reviewerList}`
      : `reviewers [${reviewerList}]`;
  const entry = `- ${args.pair}: producer \`${args.producer}\` ↔ ${reviewerField}, skill \`${args.skill}\``;

  const orchestrate = await appendSection(orchestratePath, "Registered pairs", entry);
  const planning = await appendSection(planningPath, "Available departments", entry);

  const summary = {
    target,
    pair: args.pair,
    entry,
    orchestrate: { path: orchestratePath, changed: orchestrate.changed },
    planning: { path: planningPath, changed: planning.changed },
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
