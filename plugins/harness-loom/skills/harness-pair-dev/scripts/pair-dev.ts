#!/usr/bin/env node
// Purpose: deterministic helper for the v0.3.0 harness-pair-dev command
// surface. This script validates add/improve source references and performs guarded
// pair removal in the current target. It does not author LLM-written pair
// bodies; successful add/improve calls return preparation JSON only.

import { spawnSync } from "node:child_process";
import { constants as FS } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type Action = "add" | "improve" | "remove";

interface Args {
  action: Action;
  pair: string;
  purpose?: string;
  from?: string;
  reviewers: string[];
  before?: string;
  after?: string;
}

interface RegistryEntry {
  pair: string;
  producer: string;
  reviewers: string[];
  skill: string;
  line: string;
}

interface Placement {
  mode: "append" | "before" | "after";
  anchor?: string;
}

interface ActiveCycleCheck {
  safe: boolean;
  reason?: string;
  references?: string[];
}

interface RemovalTarget {
  kind: "agent" | "skill";
  slug: string;
  path: string;
  shared: boolean;
}

interface RemovalPlan {
  targets: RemovalTarget[];
  preservedShared: string[];
}

const SLUG_RE = /^harness-[a-z0-9]+(-[a-z0-9]+)*$/;
const FOUNDATION_SLUGS = new Set([
  "harness-context",
  "harness-orchestrate",
  "harness-planning",
  "harness-planner",
  "harness-finalizer",
]);
const TERMINAL_CURRENT = new Set(["done", "superseded"]);
const SYNC_HANDOFF = "node .harness/loom/sync.ts --provider <list>";

function die(message: string, code = 1): never {
  process.stderr.write(`pair-dev: ${message}\n`);
  process.exit(code);
}

function help(): never {
  process.stdout.write(
    [
      "Usage:",
      '  node <harness-pair-dev>/scripts/pair-dev.ts --add <pair-slug> "<purpose>" [--from <existing-pair-slug>] [--reviewer <slug> ...] [--before <pair-slug> | --after <pair-slug>]',
      '  node <harness-pair-dev>/scripts/pair-dev.ts --improve <pair-slug> "<purpose>" [--before <pair-slug> | --after <pair-slug>]',
      "  node <harness-pair-dev>/scripts/pair-dev.ts --remove <pair-slug>",
      "",
      "Target root is the current working directory. Add/improve return validation summaries; remove mutates .harness/loom only.",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

function requireValue(rest: string[], index: number, flag: string): string {
  const value = rest[index + 1];
  if (value === undefined || value.startsWith("--")) die(`${flag} requires a value`);
  return value;
}

function parseCommand(rest: string[]): { action: Action; pair: string; nextIndex: number } {
  let found: { action: Action; pair: string; nextIndex: number } | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--split") {
      die("--split is unsupported in harness-pair-dev v0.3.0; use explicit --add/--improve/--remove steps");
    }
    if (arg === "--hint") {
      die('--hint is unsupported in harness-pair-dev v0.3.0; pass intent as positional "<purpose>"');
    }
    if (arg === "--add" || arg === "--improve" || arg === "--remove") {
      if (found) die("use exactly one of --add, --improve, or --remove");
      const pair = requireValue(rest, i, arg);
      found = { action: arg.slice(2) as Action, pair, nextIndex: i + 2 };
      i++;
    }
  }
  if (!found) die("use exactly one of --add, --improve, or --remove");
  return found;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  if (rest.includes("--help") || rest.includes("-h")) help();

  const command = parseCommand(rest);
  const out: Args = {
    action: command.action,
    pair: command.pair,
    reviewers: [],
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--add" || arg === "--improve" || arg === "--remove") {
      i++;
    } else if (arg === "--from") {
      out.from = requireValue(rest, i, "--from");
      i++;
    } else if (arg === "--reviewer") {
      out.reviewers.push(requireValue(rest, i, "--reviewer"));
      i++;
    } else if (arg === "--before") {
      out.before = requireValue(rest, i, "--before");
      i++;
    } else if (arg === "--after") {
      out.after = requireValue(rest, i, "--after");
      i++;
    } else if (arg === "--split") {
      die("--split is unsupported in harness-pair-dev v0.3.0; use explicit --add/--improve/--remove steps");
    } else if (arg === "--hint") {
      die('--hint is unsupported in harness-pair-dev v0.3.0; pass intent as positional "<purpose>"');
    } else if (arg.startsWith("--")) {
      die(`unknown argument: ${arg}`);
    } else {
      if (i === command.nextIndex && out.action !== "remove" && out.purpose === undefined) {
        out.purpose = arg;
      } else if (i !== command.nextIndex - 1) {
        die(`unexpected positional argument: ${arg}`);
      }
    }
  }

  if (!SLUG_RE.test(out.pair)) die(`pair slug must start with "harness-" (got: ${out.pair})`);
  if (FOUNDATION_SLUGS.has(out.pair)) die(`${out.pair} is a foundation or singleton role, not a removable pair`);
  if (out.before && out.after) die("use either --before or --after, not both");
  for (const [flag, value] of [["--before", out.before], ["--after", out.after]] as const) {
    if (value && !SLUG_RE.test(value)) die(`${flag} must be a harness pair slug (got: ${value})`);
    if (value && value === out.pair) die("placement anchor cannot reference the same pair");
  }
  for (const reviewer of out.reviewers) {
    if (!SLUG_RE.test(reviewer)) die(`--reviewer must be a harness slug (got: ${reviewer})`);
  }
  if (new Set(out.reviewers).size !== out.reviewers.length) die("duplicate --reviewer values are not allowed");

  if (out.action === "add") {
    if (!out.purpose) die('--add requires positional "<purpose>" after <pair-slug>');
  } else if (out.action === "improve") {
    if (!out.purpose) die('--improve requires positional "<purpose>" after <pair-slug>');
    if (out.from) die("--from is only supported with --add");
    if (out.reviewers.length > 0) die("--reviewer is only supported with --add");
  } else {
    if (out.purpose) die("--remove does not accept a purpose");
    if (out.from) die("--from is only supported with --add");
    if (out.reviewers.length > 0) die("--reviewer is only supported with --add");
    if (out.before || out.after) die("--before/--after cannot be used with --remove");
  }

  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeCRLF(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

function extractSection(raw: string, heading: string): string | null {
  const headingLine = `## ${heading}`;
  const normalized = normalizeCRLF(raw);
  const inlineIndex = normalized.indexOf(`\n${headingLine}\n`);
  const headingIndex =
    inlineIndex !== -1
      ? inlineIndex + 1
      : normalized.startsWith(`${headingLine}\n`)
      ? 0
      : -1;
  if (headingIndex === -1) return null;
  const bodyStart = normalized.indexOf("\n", headingIndex) + 1;
  const nextHeading = normalized.indexOf("\n## ", bodyStart);
  const bodyEnd = nextHeading === -1 ? normalized.length : nextHeading;
  return normalized.slice(bodyStart, bodyEnd);
}

function parseRegistryLine(line: string): RegistryEntry | null {
  const match = line.match(
    /^-\s+(harness-[a-z0-9]+(?:-[a-z0-9]+)*)\s*:\s*producer\s+`([^`]+)`\s+↔\s+(reviewer|reviewers)\s+(.+),\s+skill\s+`([^`]+)`\s*$/,
  );
  if (!match) return null;
  const reviewerPart = match[4];
  const reviewers = Array.from(reviewerPart.matchAll(/`([^`]+)`/g), (item) => item[1]);
  if (reviewers.length === 0) return null;
  return {
    pair: match[1],
    producer: match[2],
    reviewers,
    skill: match[5],
    line,
  };
}

function parseRegistry(raw: string): RegistryEntry[] {
  const section = extractSection(raw, "Registered pairs");
  if (section === null) die("missing ## Registered pairs in .harness/loom/registry.md");
  return section
    .split("\n")
    .map((line) => parseRegistryLine(line))
    .filter((entry): entry is RegistryEntry => entry !== null);
}

async function readRegistry(target: string): Promise<{ path: string; entries: RegistryEntry[] }> {
  const registryPath = join(target, ".harness", "loom", "registry.md");
  if (!(await exists(registryPath))) die(`missing ${registryPath} (run /harness-init first)`);
  const raw = await readFile(registryPath, "utf8");
  return { path: registryPath, entries: parseRegistry(raw) };
}

function findEntry(entries: RegistryEntry[], pair: string): RegistryEntry | null {
  return entries.find((entry) => entry.pair === pair) ?? null;
}

function placement(args: Args): Placement {
  if (args.before) return { mode: "before", anchor: args.before };
  if (args.after) return { mode: "after", anchor: args.after };
  return { mode: "append" };
}

function assertAnchor(entries: RegistryEntry[], args: Args): void {
  const anchor = args.before ?? args.after;
  if (!anchor) return;
  if (!findEntry(entries, anchor)) die(`placement anchor is not a registered pair: ${anchor}`);
}

function validateFrom(entries: RegistryEntry[], from: string): RegistryEntry {
  if (
    from.includes("/") ||
    from.includes("\\") ||
    from.startsWith(".") ||
    from.endsWith(".md")
  ) {
    die("--from accepts a registered pair slug, not a file, snapshot, or platform path");
  }
  if (FOUNDATION_SLUGS.has(from)) die(`--from ${from} is a foundation or singleton role, not a registered pair`);
  if (!SLUG_RE.test(from)) die(`--from must be a registered harness pair slug (got: ${from})`);
  const entry = findEntry(entries, from);
  if (!entry) die(`--from pair is not registered: ${from}`);
  return entry;
}

function extractHarnessSlugs(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(/\bharness-[a-z0-9]+(?:-[a-z0-9]+)*\b/g), (match) => match[0]));
}

function intersectingReferences(text: string, protectedSlugs: Set<string>): string[] {
  const refs = extractHarnessSlugs(text);
  return [...protectedSlugs].filter((slug) => refs.has(slug));
}

function parseField(section: string, field: string): string | null {
  const match = section.match(new RegExp(`^${field}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function parseEpicSections(summaries: string): Array<{ epic: string; body: string }> {
  return summaries
    .split(/\n(?=###\s+EP-\d+--)/)
    .map((section) => {
      const match = section.match(/^###\s+(EP-\d+--[^\n]+)\n([\s\S]*)$/);
      return match ? { epic: match[1], body: match[2] } : null;
    })
    .filter((section): section is { epic: string; body: string } => section !== null);
}

function checkActiveCycleState(raw: string, protectedSlugs: Set<string>): ActiveCycleCheck {
  const normalized = normalizeCRLF(raw);
  if (!normalized.startsWith("# Runtime State\n")) {
    return { safe: false, reason: "state.md is not in the canonical runtime-state shape" };
  }
  const next = extractSection(normalized, "Next");
  const summaries = extractSection(normalized, "EPIC summaries");
  if (next === null || summaries === null) {
    return { safe: false, reason: "state.md is missing ## Next or ## EPIC summaries" };
  }

  const nextRefs = intersectingReferences(next, protectedSlugs);
  if (nextRefs.length > 0) {
    return {
      safe: false,
      reason: "active-cycle ## Next references the pair being removed",
      references: nextRefs,
    };
  }

  const epicSections = parseEpicSections(summaries);
  const trimmedSummaries = summaries.trim();
  if (epicSections.length === 0) {
    if (trimmedSummaries.length === 0 || /There are no EPICs yet\./.test(trimmedSummaries)) {
      return { safe: true };
    }
    return { safe: false, reason: "state.md EPIC summaries could not be parsed" };
  }

  for (const { epic, body } of epicSections) {
    const roster = parseField(body, "roster");
    const current = parseField(body, "current");
    if (roster === null || current === null) {
      return { safe: false, reason: `state.md ${epic} is missing roster or current` };
    }
    if (TERMINAL_CURRENT.has(current)) continue;
    const refs = [
      ...intersectingReferences(roster, protectedSlugs),
      ...intersectingReferences(current, protectedSlugs),
    ];
    const uniqueRefs = [...new Set(refs)];
    if (uniqueRefs.length > 0) {
      return {
        safe: false,
        reason: `live EPIC ${epic} references the pair being removed`,
        references: uniqueRefs,
      };
    }
  }

  return { safe: true };
}

async function assertActiveCycleSafe(target: string, entry: RegistryEntry): Promise<ActiveCycleCheck> {
  const statePath = join(target, ".harness", "cycle", "state.md");
  if (!(await exists(statePath))) return { safe: true };
  const protectedSlugs = new Set([entry.pair, entry.producer, entry.skill, ...entry.reviewers]);
  const raw = await readFile(statePath, "utf8");
  const result = checkActiveCycleState(raw, protectedSlugs);
  if (!result.safe) {
    die(
      `refusing to remove ${entry.pair}: ${result.reason}${
        result.references && result.references.length > 0
          ? ` (${result.references.join(", ")})`
          : ""
      }`,
    );
  }
  return result;
}

function referencedSlugs(entries: RegistryEntry[]): Set<string> {
  const refs = new Set<string>();
  for (const entry of entries) {
    refs.add(entry.pair);
    refs.add(entry.producer);
    refs.add(entry.skill);
    for (const reviewer of entry.reviewers) refs.add(reviewer);
  }
  return refs;
}

function validateRegisteredSlug(role: string, slug: string): void {
  if (!SLUG_RE.test(slug)) die(`registered ${role} slug is invalid: ${slug}`);
  if (FOUNDATION_SLUGS.has(slug)) {
    die(`registered ${role} slug is reserved for a foundation or singleton role: ${slug}`);
  }
}

function validateRegistryEntry(entry: RegistryEntry): void {
  validateRegisteredSlug("pair", entry.pair);
  validateRegisteredSlug("producer", entry.producer);
  for (const reviewer of entry.reviewers) validateRegisteredSlug("reviewer", reviewer);
  validateRegisteredSlug("skill", entry.skill);
}

function safeResolve(base: string, ...parts: string[]): string {
  const resolved = resolve(base, ...parts);
  const root = resolve(base);
  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || resolve(root, rel) !== resolved) {
    die(`refusing to operate outside ${root}`);
  }
  return resolved;
}

async function removePath(path: string): Promise<"deleted" | "missing"> {
  if (!(await exists(path))) return "missing";
  await rm(path, { recursive: true, force: true });
  return "deleted";
}

function buildRemovalPlan(target: string, entries: RegistryEntry[], existing: RegistryEntry): RemovalPlan {
  for (const entry of entries) validateRegistryEntry(entry);

  const postRemovalEntries = entries.filter((entry) => entry.pair !== existing.pair);
  const remainingRefs = referencedSlugs(postRemovalEntries);
  const loomRoot = join(target, ".harness", "loom");
  const targets: RemovalTarget[] = [];

  for (const slug of [existing.producer, ...existing.reviewers]) {
    const path = safeResolve(loomRoot, "agents", `${slug}.md`);
    targets.push({ kind: "agent", slug, path, shared: remainingRefs.has(slug) });
  }

  const skillPath = safeResolve(loomRoot, "skills", existing.skill);
  targets.push({
    kind: "skill",
    slug: existing.skill,
    path: skillPath,
    shared: remainingRefs.has(existing.skill),
  });

  return {
    targets,
    preservedShared: targets.filter((target) => target.shared).map((target) => target.path),
  };
}

function unregister(target: string, pair: string): unknown {
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "register-pair.ts");
  const result = spawnSync(process.execPath, [scriptPath, "--unregister", "--target", target, "--pair", pair], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    die(result.stderr.trim() || `register-pair --unregister failed with status ${result.status}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    die("register-pair --unregister did not return JSON");
  }
}

async function prepareAdd(target: string, args: Args): Promise<unknown> {
  const registry = await readRegistry(target);
  if (findEntry(registry.entries, args.pair)) die(`${args.pair} is already registered; use --improve`);
  assertAnchor(registry.entries, args);
  const from = args.from ? validateFrom(registry.entries, args.from) : null;
  const reviewers = args.reviewers.length > 0 ? args.reviewers : [`${args.pair}-reviewer`];
  return {
    action: "prepare-add",
    authored: false,
    target,
    pair: args.pair,
    purpose: args.purpose,
    producer: `${args.pair}-producer`,
    reviewers,
    skill: args.pair,
    from,
    placement: placement(args),
    writes: [],
    providerTreesWritten: [],
    syncCommand: SYNC_HANDOFF,
    nextStep:
      "Author producer/reviewer/skill files under .harness/loom using template-first overlay when --from is present, then register the pair and run the sync command.",
  };
}

async function prepareImprove(target: string, args: Args): Promise<unknown> {
  const registry = await readRegistry(target);
  const existing = findEntry(registry.entries, args.pair);
  if (!existing) die(`cannot improve missing registered pair: ${args.pair}`);
  assertAnchor(registry.entries, args);
  return {
    action: "prepare-improve",
    authored: false,
    target,
    pair: args.pair,
    purpose: args.purpose,
    existing,
    placement: placement(args),
    writes: [],
    providerTreesWritten: [],
    syncCommand: SYNC_HANDOFF,
    nextStep:
      "Revise the existing loom agent/skill files from current repo evidence, re-register only if placement or reviewer shape changes, then run the sync command.",
  };
}

async function removePair(target: string, args: Args): Promise<unknown> {
  const beforeRegistry = await readRegistry(target);
  const existing = findEntry(beforeRegistry.entries, args.pair);
  if (!existing) die(`cannot remove missing registered pair: ${args.pair}`);
  await assertActiveCycleSafe(target, existing);
  const removalPlan = buildRemovalPlan(target, beforeRegistry.entries, existing);

  const unregisterSummary = unregister(target, args.pair);
  const deleted: string[] = [];
  const missing: string[] = [];

  for (const removalTarget of removalPlan.targets) {
    if (removalTarget.shared) {
      continue;
    }
    const result = await removePath(removalTarget.path);
    if (result === "deleted") deleted.push(removalTarget.path);
    else missing.push(removalTarget.path);
  }

  return {
    action: "remove",
    target,
    pair: existing.pair,
    removedEntry: existing,
    unregister: unregisterSummary,
    deleted,
    missing,
    preservedShared: removalPlan.preservedShared,
    cycleHistoryPreserved: true,
    providerTreesWritten: [],
    syncCommand: SYNC_HANDOFF,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const target = process.cwd();
  let summary: unknown;
  if (args.action === "add") summary = await prepareAdd(target, args);
  else if (args.action === "improve") summary = await prepareImprove(target, args);
  else summary = await removePair(target, args);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
