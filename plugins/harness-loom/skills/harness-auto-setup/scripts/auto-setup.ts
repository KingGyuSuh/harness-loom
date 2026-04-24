#!/usr/bin/env node
// Purpose: Bootstrap fresh targets, recommend project-shaped additions for
//          existing targets, or migrate existing harness foundations through a
//          snapshot-first contract refresh. Stale harness files are never
//          blind-copied and platform sync is never run.

import { spawnSync } from "node:child_process";
import { constants as FS, readFileSync } from "node:fs";
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const INSTALL_SCRIPT = resolve(SCRIPT_DIR, "../../harness-init/scripts/install.ts");
const FINALIZER_TEMPLATE = resolve(
  SCRIPT_DIR,
  "../../harness-init/references/runtime/harness-finalizer.template.md",
);
const PAIR_DEV_DIR = resolve(SCRIPT_DIR, "../../harness-pair-dev");
const PAIR_DEV_SCRIPT = resolve(PAIR_DEV_DIR, "scripts/pair-dev.ts");
const REGISTER_PAIR_SCRIPT = resolve(PAIR_DEV_DIR, "scripts/register-pair.ts");
const PRODUCER_TEMPLATE = resolve(PAIR_DEV_DIR, "templates/producer-agent.md");
const REVIEWER_TEMPLATE = resolve(PAIR_DEV_DIR, "templates/reviewer-agent.md");
const ALLOWED_PROVIDERS = new Set(["claude", "codex", "gemini"]);
const HARNESS_SLUG_RE = /^harness-[a-z0-9]+(-[a-z0-9]+)*$/;
const FOUNDATION_SLUGS = new Set([
  "harness-context",
  "harness-orchestrate",
  "harness-planning",
  "harness-planner",
  "harness-finalizer",
]);

type CycleClassification = "absent" | "pristine" | "active" | "halted" | "unknown";
type RegistryStatus = "absent" | "present" | "unparsable";
type FinalizerStatus = "absent" | "default-noop" | "customized" | "unreadable";
type RunMode = "setup" | "migration";
type TargetState = "fresh" | "existing";

interface Args {
  target: string;
  providers: string[];
  runMode: RunMode;
}

interface ActiveCycleSummary {
  classification: CycleClassification;
  reason: string;
  path: string | null;
  phase: string | null;
  loop: boolean | null;
  runnableNext: boolean | null;
  epicCount: number;
  liveEpicCount: number;
}

interface RegistryPair {
  pair: string;
  producer: string;
  reviewers: string[];
  skill: string;
  sourceLine: string;
  evidence: {
    skillPresent: boolean;
    producerPresent: boolean;
    reviewersPresent: string[];
    missing: string[];
  };
}

interface RegistrySummary {
  status: RegistryStatus;
  path: string | null;
  pairCount: number;
  pairs: RegistryPair[];
  unparsedLines: string[];
}

interface FinalizerSummary {
  status: FinalizerStatus;
  path: string | null;
  customized: boolean;
  signals: string[];
  taskPreview: string | null;
  recommendation: string;
}

interface RepoSignals {
  files: string[];
  directories: string[];
  evidence: string[];
}

interface Manifest {
  schemaVersion: number;
  tool: string;
  targetPath: string;
  createdAt: string;
  snapshotPath: string;
  copiedNamespaces: string[];
  activeCycle: ActiveCycleSummary;
  registrySummary: RegistrySummary;
  finalizerSummary: FinalizerSummary;
  nextAction: string;
  runMode?: RunMode;
  targetState?: TargetState;
  recommendations: {
    mode: string;
    pairs: string[];
    finalizer: string;
    sync: string;
  };
}

interface PairOperation {
  pair: string;
  status: "migrated" | "skipped";
  reason: string;
  producer: string;
  reviewers: string[];
  skill: string;
  filesWritten: string[];
  registry: unknown;
  evidenceLines: string[];
  preserved: string[];
  replaced: string[];
  manualReview: string[];
  source:
    | {
        kind: "repo-signals" | "live" | "snapshot" | "archive";
        locator: string | null;
      }
    | null;
  convergence: {
    improvementPasses: number;
    stopReason: string;
    qualityVerdict: "acceptable" | "fallback" | "manual-review";
  };
}

interface ArtifactUsage {
  agents: Map<string, string[]>;
  skills: Map<string, string[]>;
}

interface FinalizerOperation {
  status: "migrated" | "default-noop" | "missing" | "skipped";
  reason: string;
  path: string | null;
  filesWritten: string[];
  evidenceLines: string[];
  preserved: string[];
  replaced: string[];
  manualReview: string[];
  convergence: {
    improvementPasses: number;
    stopReason: string;
    qualityVerdict: "acceptable" | "fallback" | "manual-review";
  };
}

interface PairRecommendationDetail {
  pair: string | null;
  command: string | null;
  rationale: string;
  evidence: string[];
}

interface RestoredCustomEntries {
  skills: string[];
  agents: string[];
  skipped: { path: string; reason: string }[];
}

interface MigrationPlanPair {
  pair: string;
  source: {
    skillPath: string | null;
    producerPath: string | null;
    reviewerPaths: Record<string, string | null>;
    missingArtifacts: string[];
  };
  target: {
    skillPath: string;
    producerPath: string;
    reviewerPaths: Record<string, string>;
  };
  overlayMethodology: string;
  contractSurfaces: string[];
  userSurfaces: string[];
  manualReviewNotes: string[];
}

interface MigrationPlanFinalizer {
  required: boolean;
  source: { agentPath: string | null };
  target: { agentPath: string };
  overlayMethodology: string;
  contractSurfaces: string[];
  userSurfaces: string[];
  manualReviewNotes: string[];
}

interface MigrationPlan {
  pairs: MigrationPlanPair[];
  finalizer: MigrationPlanFinalizer | null;
}

interface PairMigrationResult {
  operations: PairOperation[];
  migrationPlanPairs: MigrationPlanPair[];
}

interface InstallResult {
  status: number | null;
  stdout: string;
  stderr: string;
  summary: unknown;
  skipped?: boolean;
  reason?: string;
}

function die(message: string, code = 1): never {
  process.stderr.write(`harness-auto-setup: ${message}\n`);
  process.exit(code);
}

function parseProviders(raw: string): string[] {
  const providers = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (providers.length === 0) die("--provider requires at least one provider");
  for (const provider of providers) {
    if (!ALLOWED_PROVIDERS.has(provider)) {
      die(`unknown provider: ${provider} (expected claude,codex,gemini)`);
    }
  }
  return providers;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let providers = ["claude", "codex", "gemini"];
  let runMode: RunMode = "setup";
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-auto-setup/scripts/auto-setup.ts [--setup | --migration] [--provider <claude,codex,gemini>]\n" +
          "  Target is always process.cwd(); run from the project root.\n" +
          "  Default mode is --setup. Use --migration for minimal-delta upgrades of an existing harness.\n" +
          "  The provider list is only used to print the explicit sync command; sync is not run.\n",
      );
      process.exit(0);
    } else if (arg === "--setup") {
      if (runMode === "migration") die("use either --setup or --migration, not both");
      runMode = "setup";
    } else if (arg === "--migration") {
      if (runMode === "setup" && rest.includes("--setup")) die("use either --setup or --migration, not both");
      runMode = "migration";
    } else if (arg === "--provider") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) die("--provider requires a comma-separated list");
      providers = parseProviders(value);
    } else if (arg.startsWith("--")) {
      die(`unknown flag: ${arg}`);
    } else {
      die(`unexpected argument: ${arg}`);
    }
  }
  return { target: process.cwd(), providers, runMode };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalize(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

function rel(target: string, path: string): string {
  return relative(target, path).split("\\").join("/");
}

function syncCommand(providers: string[]): string {
  return `node .harness/loom/sync.ts --provider ${providers.join(",")}`;
}

function autoSetupCommand(runMode: RunMode, providers: string[]): string {
  return `/harness-auto-setup --${runMode} --provider ${providers.join(",")}`;
}

function snapshotStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function allocateSnapshotDir(target: string, createdAt: string): Promise<string> {
  const root = join(target, ".harness", "_snapshots", "auto-setup");
  await mkdir(root, { recursive: true });
  const stamp = snapshotStamp(new Date(createdAt));
  for (let i = 0; i < 100; i++) {
    const id = i === 0 ? stamp : `${stamp}-${String(i).padStart(2, "0")}`;
    const candidate = join(root, id);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : "";
      if (code === "EEXIST") continue;
      throw err;
    }
  }
  die(`could not allocate snapshot directory under ${root}`);
}

function section(body: string, heading: string): string | null {
  const normalized = body.replace(/\r\n/g, "\n");
  const headingLine = `## ${heading}`;
  const headingIdxLineStart = normalized.indexOf(`\n${headingLine}\n`);
  const headingIdx =
    headingIdxLineStart !== -1
      ? headingIdxLineStart + 1
      : normalized.startsWith(`${headingLine}\n`)
      ? 0
      : -1;
  if (headingIdx === -1) return null;
  const bodyStart = normalized.indexOf("\n", headingIdx) + 1;
  const nextHeading = normalized.indexOf("\n## ", bodyStart);
  const bodyEnd = nextHeading === -1 ? normalized.length : nextHeading;
  return normalized.slice(bodyStart, bodyEnd);
}

function subsection(body: string, headingLine: string): string | null {
  const normalized = body.replace(/\r\n/g, "\n");
  const headingIdxLineStart = normalized.indexOf(`\n${headingLine}\n`);
  const headingIdx =
    headingIdxLineStart !== -1
      ? headingIdxLineStart + 1
      : normalized.startsWith(`${headingLine}\n`)
      ? 0
      : -1;
  if (headingIdx === -1) return null;
  const bodyStart = normalized.indexOf("\n", headingIdx) + 1;
  const tail = normalized.slice(bodyStart);
  const nextHeadingMatch = tail.match(/\n#{2,3}\s+/);
  const bodyEnd = nextHeadingMatch?.index === undefined ? normalized.length : bodyStart + nextHeadingMatch.index;
  return normalized.slice(bodyStart, bodyEnd);
}

function topLevelH2Bounds(body: string, heading: string): { headingStart: number; bodyStart: number; bodyEnd: number } | null {
  const normalized = body.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let offset = 0;
  let inFence = false;
  let found: { headingStart: number; bodyStart: number } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
    } else if (!inFence && line === `## ${heading}`) {
      found = { headingStart: offset, bodyStart: offset + line.length + 1 };
      break;
    }
    offset += line.length + 1;
  }
  if (!found) return null;

  let bodyEnd = normalized.length;
  offset = found.bodyStart;
  inFence = false;
  for (const line of normalized.slice(found.bodyStart).split("\n")) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
    } else if (!inFence && /^##\s+/.test(line)) {
      bodyEnd = offset;
      break;
    }
    offset += line.length + 1;
  }
  return { ...found, bodyEnd };
}

function replaceTopLevelSection(body: string, heading: string, replacement: string): string {
  const normalized = body.replace(/\r\n/g, "\n");
  const bounds = topLevelH2Bounds(normalized, heading);
  const sectionBody = replacement.trim() + "\n";
  if (!bounds) {
    const sep = normalized.endsWith("\n") ? "" : "\n";
    return `${normalized}${sep}\n## ${heading}\n\n${sectionBody}`;
  }
  return normalized.slice(0, bounds.bodyStart) + "\n" + sectionBody + normalized.slice(bounds.bodyEnd);
}

function removeTopLevelSection(body: string, heading: string): string {
  const normalized = body.replace(/\r\n/g, "\n");
  const bounds = topLevelH2Bounds(normalized, heading);
  if (!bounds) return normalized;
  const prefix = normalized.slice(0, bounds.headingStart).replace(/\n+$/g, "\n\n");
  const suffix = normalized.slice(bounds.bodyEnd).replace(/^\n+/, "");
  return `${prefix}${suffix}`.trimEnd() + "\n";
}

function field(body: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function renderTemplate(raw: string, vars: Record<string, string>): string {
  let out = raw;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function frontmatterBlock(body: string): string | null {
  const normalized = body.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return match ? match[1] : null;
}

function leadingIndent(line: string): number {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function stripYamlComment(value: string): string {
  let quote: '"' | "'" | null = null;
  let escape = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote === '"') {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (ch === "'" && value[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"') {
      quote = '"';
      continue;
    }
    if (ch === "'") {
      quote = "'";
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trimEnd();
}

function parseYamlScalar(value: string): string | null {
  const trimmed = stripYamlComment(value).trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseYamlInlineList(value: string): string[] | null {
  const trimmed = stripYamlComment(value).trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1);
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escape = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    current += ch;
    if (quote === '"') {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"') {
      quote = '"';
      continue;
    }
    if (ch === "'") {
      quote = "'";
      continue;
    }
    if (ch === ",") {
      current = current.slice(0, -1);
      const parsed = parseYamlScalar(current);
      if (parsed !== null && parsed !== "") out.push(parsed);
      current = "";
    }
  }
  if (quote || escape) return null;
  const parsed = parseYamlScalar(current);
  if (parsed !== null && parsed !== "") out.push(parsed);
  return out;
}

function collectIndentedValue(lines: string[], start: number): { lines: string[]; next: number } {
  let index = start;
  while (index < lines.length && /^\s*$/.test(lines[index])) index += 1;
  if (index >= lines.length) return { lines: [], next: index };
  const firstIndent = leadingIndent(lines[index]);
  if (firstIndent === 0) return { lines: [], next: index };
  const out: string[] = [];
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      out.push("");
      index += 1;
      continue;
    }
    const indent = leadingIndent(line);
    if (indent < firstIndent) break;
    out.push(line.slice(firstIndent));
    index += 1;
  }
  return { lines: out, next: index };
}

function parseYamlBlockScalar(indicator: string, lines: string[]): string {
  const style = indicator.trim()[0] === ">" ? ">" : "|";
  const cleaned = lines.map((line) => line.replace(/[ \t]+$/g, ""));
  if (style === "|") return cleaned.join("\n").replace(/\n+$/g, "");
  let out = "";
  let pendingBlankLines = 0;
  for (const line of cleaned) {
    if (line === "") {
      pendingBlankLines += 1;
      continue;
    }
    if (out) {
      out += pendingBlankLines > 0 ? "\n".repeat(pendingBlankLines) : " ";
    }
    out += line;
    pendingBlankLines = 0;
  }
  return out;
}

function isYamlBlockScalarIndicator(value: string): boolean {
  return /^[>|](?:[1-9])?(?:[+-])?$/.test(value) || /^[>|][+-](?:[1-9])?$/.test(value);
}

function frontmatterValue(body: string, key: string): string | string[] | null {
  const block = frontmatterBlock(body);
  if (!block) return null;
  const lines = block.split("\n");
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(new RegExp(`^${escaped}:\\s*(.*)$`));
    if (!match) continue;
    const rawValue = match[1];
    const trimmed = stripYamlComment(rawValue).trim();
    if (isYamlBlockScalarIndicator(trimmed)) {
      const nested = collectIndentedValue(lines, i + 1);
      return parseYamlBlockScalar(trimmed, nested.lines);
    }
    const inlineList = parseYamlInlineList(rawValue);
    if (inlineList) return inlineList;
    if (trimmed === "") {
      const nested = collectIndentedValue(lines, i + 1);
      if (nested.lines.length === 0) return "";
      if (nested.lines.every((line) => line === "" || /^\s*-\s+/.test(line))) {
        return nested.lines
          .filter((line) => /^\s*-\s+/.test(line))
          .map((line) => parseYamlScalar(line.replace(/^\s*-\s+/, "")))
          .filter((value): value is string => value !== null && value !== "");
      }
      return nested.lines.join("\n").trim();
    }
    return parseYamlScalar(rawValue);
  }
  return null;
}

function frontmatterScalar(body: string, key: string): string | null {
  const value = frontmatterValue(body, key);
  return typeof value === "string" ? value : null;
}

function frontmatterDescription(body: string): string | null {
  return frontmatterScalar(body, "description");
}

function frontmatterSkills(body: string): string[] {
  const value = frontmatterValue(body, "skills");
  return Array.isArray(value) ? value : [];
}

function bodyWithoutFrontmatter(body: string): string {
  const normalized = body.replace(/\r\n/g, "\n");
  return normalized.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function topHeadingParts(body: string): { title: string; tail: string } | null {
  const content = bodyWithoutFrontmatter(body);
  const match = /^#\s+([^\n]+)(?:\n|$)/m.exec(content);
  if (!match) return null;
  return {
    title: match[1].trim(),
    tail: content.slice(match.index + match[0].length).trimStart(),
  };
}

function topHeading(body: string): string | null {
  return topHeadingParts(body)?.title ?? null;
}

function bodyAfterTopHeading(body: string): string | null {
  return topHeadingParts(body)?.tail ?? null;
}

function h2Headings(body: string | null): string[] {
  if (!body) return [];
  const out: string[] = [];
  for (const match of bodyWithoutFrontmatter(body).matchAll(/^##\s+([^\n]+)$/gm)) {
    const heading = match[1].trim();
    if (!out.includes(heading)) out.push(heading);
  }
  return out;
}

function finalizerOutputFormatContract(template: string): string {
  const normalized = template.replace(/\r\n/g, "\n");
  const heading = "## Output Format";
  const headingIdxLineStart = normalized.indexOf(`\n${heading}\n`);
  const headingIdx =
    headingIdxLineStart !== -1
      ? headingIdxLineStart + 1
      : normalized.startsWith(`${heading}\n`)
      ? 0
      : -1;
  if (headingIdx === -1) return section(template, "Output Format") ?? "";
  const bodyStart = normalized.indexOf("\n", headingIdx) + 1;
  return normalized.slice(bodyStart).trimEnd();
}

function introAfterHeading(body: string): string | null {
  const tail = bodyAfterTopHeading(body);
  if (tail === null) return null;
  const nextSection = tail.search(/(^|\n)## /);
  const intro = (nextSection === -1 ? tail : tail.slice(0, nextSection)).trim();
  return intro || null;
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function renderSkillFrontmatter(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${quoteYaml(description)}`,
    "user-invocable: false",
    "---",
  ].join("\n");
}

function renderAgentFrontmatter(
  name: string,
  description: string,
  skills: string[],
  model: string | null,
): string {
  const lines = [
    "---",
    `name: ${name}`,
    `description: ${quoteYaml(description)}`,
    "skills:",
    ...skills.map((skill) => `  - ${skill}`),
  ];
  if (model) lines.push(`model: ${model}`);
  lines.push("---");
  return lines.join("\n");
}

function preservedExtraSkills(body: string, required: string[]): string[] {
  const requiredSet = new Set(required);
  const out: string[] = [];
  for (const skill of frontmatterSkills(body)) {
    if (requiredSet.has(skill) || !skill) continue;
    if (!out.includes(skill)) out.push(skill);
  }
  return out;
}

function cleanEvidenceLine(line: string): string | null {
  const cleaned = line
    .replace(/^[-*]\s+/, "")
    .replace(/^#+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (/^```/.test(cleaned)) return null;
  if (/^Status: PASS \/ FAIL$/.test(cleaned)) return null;
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned;
}

function uniqueCapped(lines: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = cleanEvidenceLine(line);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function markedEvidence(body: string): string[] | null {
  const marked =
    subsection(body, "### Preserved Snapshot Intent") ?? subsection(body, "### Preserved Intent Evidence");
  if (!marked) return null;
  const lines = marked
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  return uniqueCapped(lines, 8);
}

function evidenceFromMarkdown(body: string, preferredSections: string[], fallbackLabel: string): string[] {
  const marked = markedEvidence(body);
  if (marked && marked.length > 0) return marked;

  const out: string[] = [];
  const description = frontmatterDescription(body);
  if (description) out.push(`${fallbackLabel} description: ${description}`);
  for (const heading of preferredSections) {
    const sectionBody = section(body, heading);
    if (!sectionBody) continue;
    const lines = sectionBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("```"))
      .slice(0, 4);
    for (const line of lines) out.push(`${fallbackLabel} ${heading}: ${line}`);
  }
  if (out.length === 0) {
    const lines = body
      .replace(/^---\n[\s\S]*?\n---\n?/, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
      .slice(0, 4);
    for (const line of lines) out.push(`${fallbackLabel} body: ${line}`);
  }
  return uniqueCapped(out, 8);
}

async function classifyCycle(target: string, cycleDir: string): Promise<ActiveCycleSummary> {
  if (!(await exists(cycleDir))) {
    return {
      classification: "absent",
      reason: ".harness/cycle is absent",
      path: null,
      phase: null,
      loop: null,
      runnableNext: null,
      epicCount: 0,
      liveEpicCount: 0,
    };
  }

  const statePath = join(cycleDir, "state.md");
  if (!(await exists(statePath))) {
    return {
      classification: "unknown",
      reason: ".harness/cycle exists but state.md is missing",
      path: rel(target, statePath),
      phase: null,
      loop: null,
      runnableNext: null,
      epicCount: 0,
      liveEpicCount: 0,
    };
  }

  let state: string;
  try {
    state = normalize(await readFile(statePath, "utf8"));
  } catch {
    return {
      classification: "unknown",
      reason: "state.md could not be read",
      path: rel(target, statePath),
      phase: null,
      loop: null,
      runnableNext: null,
      epicCount: 0,
      liveEpicCount: 0,
    };
  }

  const phase = field(state, "Phase");
  const loopRaw = field(state, "loop");
  const plannerContinuation = field(state, "planner-continuation");
  const next = section(state, "Next");
  const nextTo = next ? field(next, "To") : null;
  const nextEpic = next ? field(next, "EPIC") : null;
  const nextTask = next ? field(next, "Task path") : null;

  if (!phase || (loopRaw !== "true" && loopRaw !== "false") || !plannerContinuation || !next || !nextTo) {
    return {
      classification: "unknown",
      reason: "state.md is missing required header or Next fields",
      path: rel(target, statePath),
      phase,
      loop: loopRaw === "true" ? true : loopRaw === "false" ? false : null,
      runnableNext: null,
      epicCount: 0,
      liveEpicCount: 0,
    };
  }

  const loop = loopRaw === "true";
  const epicSummaryBody = section(state, "EPIC summaries") ?? "";
  const liveEpicSummaryBody = epicSummaryBody.split(/\nExample:\n/)[0];
  const epicHeadings = [...liveEpicSummaryBody.matchAll(/^###\s+(EP-\d+--[^\n]+)$/gm)].map((m) => m[1]);
  const epicCurrents = [...liveEpicSummaryBody.matchAll(/^current:\s*(.+)$/gm)].map((m) => m[1].trim());
  const terminal = new Set(["done", "superseded"]);
  const liveEpicCount = epicCurrents.filter((current) => !terminal.has(current)).length;
  const ambiguousEpic = epicHeadings.length !== epicCurrents.length;
  const runnableNext = !["", "(none)", "none", "halt", "halted"].includes(nextTo.toLowerCase());
  const pristine =
    /^Goal \(from <none yet>\):/m.test(state) &&
    phase === "planner" &&
    !loop &&
    plannerContinuation === "none" &&
    epicHeadings.length === 0 &&
    nextTo === "planner" &&
    nextEpic === "(none)" &&
    nextTask === "(none)";

  if (pristine) {
    return {
      classification: "pristine",
      reason: "fresh scaffold with initial planner Next and no emitted EPICs",
      path: rel(target, statePath),
      phase,
      loop,
      runnableNext,
      epicCount: 0,
      liveEpicCount: 0,
    };
  }

  if (loop) {
    return {
      classification: "active",
      reason: "loop is true",
      path: rel(target, statePath),
      phase,
      loop,
      runnableNext,
      epicCount: epicHeadings.length,
      liveEpicCount,
    };
  }
  if (ambiguousEpic) {
    return {
      classification: "active",
      reason: "EPIC headings and current fields do not line up",
      path: rel(target, statePath),
      phase,
      loop,
      runnableNext,
      epicCount: epicHeadings.length,
      liveEpicCount,
    };
  }
  if (liveEpicCount > 0) {
    return {
      classification: "active",
      reason: "at least one EPIC current field is not terminal",
      path: rel(target, statePath),
      phase,
      loop,
      runnableNext,
      epicCount: epicHeadings.length,
      liveEpicCount,
    };
  }
  if (runnableNext) {
    return {
      classification: "active",
      reason: "runnable Next block outside pristine scaffold",
      path: rel(target, statePath),
      phase,
      loop,
      runnableNext,
      epicCount: epicHeadings.length,
      liveEpicCount,
    };
  }
  return {
    classification: "halted",
    reason: "loop is false, no runnable Next remains, and every EPIC is terminal",
    path: rel(target, statePath),
    phase,
    loop,
    runnableNext,
    epicCount: epicHeadings.length,
    liveEpicCount,
  };
}

function parseRegistryLine(line: string): Omit<RegistryPair, "evidence"> | null {
  const match = line.match(
    /^-\s+([a-z0-9][a-z0-9-]*)\s*:\s*producer\s+`([^`]+)`\s*↔\s*(?:reviewer\s+`([^`]+)`|reviewers\s+\[([^\]]*)\])\s*,\s*skill\s+`([^`]+)`/,
  );
  if (!match) return null;
  const reviewers = match[3]
    ? [match[3]]
    : [...(match[4] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  return {
    pair: match[1],
    producer: match[2],
    reviewers,
    skill: match[5],
    sourceLine: line,
  };
}

async function pairEvidence(target: string, loomDir: string, pair: Omit<RegistryPair, "evidence">): Promise<RegistryPair["evidence"]> {
  const skillPath = join(loomDir, "skills", pair.skill);
  const producerPath = join(loomDir, "agents", `${pair.producer}.md`);
  const reviewerPaths = pair.reviewers.map((reviewer) => join(loomDir, "agents", `${reviewer}.md`));
  const skillPresent = await exists(skillPath);
  const producerPresent = await exists(producerPath);
  const reviewersPresent: string[] = [];
  const missing: string[] = [];
  if (!skillPresent) missing.push(rel(target, skillPath));
  if (!producerPresent) missing.push(rel(target, producerPath));
  for (let i = 0; i < pair.reviewers.length; i++) {
    if (await exists(reviewerPaths[i])) reviewersPresent.push(pair.reviewers[i]);
    else missing.push(rel(target, reviewerPaths[i]));
  }
  return { skillPresent, producerPresent, reviewersPresent, missing };
}

async function summarizeRegistry(target: string, loomDir: string): Promise<RegistrySummary> {
  const registryPath = join(loomDir, "registry.md");
  if (!(await exists(registryPath))) {
    return { status: "absent", path: null, pairCount: 0, pairs: [], unparsedLines: [] };
  }
  const body = await readFile(registryPath, "utf8");
  const registered = section(body, "Registered pairs");
  if (registered === null) {
    return {
      status: "unparsable",
      path: rel(target, registryPath),
      pairCount: 0,
      pairs: [],
      unparsedLines: ["missing ## Registered pairs section"],
    };
  }
  const pairs: RegistryPair[] = [];
  const unparsedLines: string[] = [];
  for (const rawLine of registered.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) continue;
    const parsed = parseRegistryLine(line);
    if (!parsed || parsed.reviewers.length === 0) {
      unparsedLines.push(line);
      continue;
    }
    pairs.push({ ...parsed, evidence: await pairEvidence(target, loomDir, parsed) });
  }
  return {
    status: unparsedLines.length > 0 ? "unparsable" : "present",
    path: rel(target, registryPath),
    pairCount: pairs.length,
    pairs,
    unparsedLines,
  };
}

function taskPreview(body: string): string | null {
  const task = section(body, "Task");
  if (!task) return null;
  const lines = task
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  return lines.length > 0 ? lines.join(" ") : null;
}

async function summarizeFinalizer(target: string, loomDir: string): Promise<FinalizerSummary> {
  const finalizerPath = join(loomDir, "agents", "harness-finalizer.md");
  if (!(await exists(finalizerPath))) {
    return {
      status: "absent",
      path: null,
      customized: false,
      signals: [],
      taskPreview: null,
      recommendation: "No finalizer was found; keep the installed safe no-op unless repo evidence justifies concrete cycle-end work.",
    };
  }
  let body: string;
  try {
    body = await readFile(finalizerPath, "utf8");
  } catch {
    return {
      status: "unreadable",
      path: rel(target, finalizerPath),
      customized: false,
      signals: ["read-failed"],
      taskPreview: null,
      recommendation: "Finalizer could not be read; inspect the snapshot before authoring cycle-end work.",
    };
  }

  let template = "";
  try {
    template = await readFile(FINALIZER_TEMPLATE, "utf8");
  } catch {
    template = "";
  }
  if (normalize(body) === normalize(template)) {
    return {
      status: "default-noop",
      path: rel(target, finalizerPath),
      customized: false,
      signals: ["safe-no-op"],
      taskPreview: taskPreview(body),
      recommendation: "Finalizer is the default safe no-op; add concrete cycle-end work only when repo evidence supports it.",
    };
  }

  const signals: string[] = [];
  for (const [label, re] of [
    ["docs", /\bdocs?\b|README|CHANGELOG/i],
    ["release", /\brelease\b|version|tag/i],
    ["verification", /\btest\b|verify|coverage|audit/i],
    ["out-of-cycle-writes", /Files created|Files modified|write|update/i],
  ] as const) {
    if (re.test(body)) signals.push(label);
  }
  if (signals.length === 0) signals.push("material-body-differs-from-default");
  return {
    status: "customized",
    path: rel(target, finalizerPath),
    customized: true,
    signals,
    taskPreview: taskPreview(body),
    recommendation: "Use the snapshot finalizer as intent evidence and rewrite it on the current harness-finalizer skeleton before running cycles.",
  };
}

async function repoSignals(target: string): Promise<RepoSignals> {
  const fileCandidates = [
    "README.md",
    "CHANGELOG.md",
    "package.json",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "pubspec.yaml",
  ];
  const dirCandidates = ["src", "app", "lib", "tests", "test", "docs", ".github/workflows"];
  const files: string[] = [];
  const directories: string[] = [];
  for (const file of fileCandidates) {
    const path = join(target, file);
    if ((await exists(path)) && (await stat(path)).isFile()) files.push(file);
  }
  for (const dir of dirCandidates) {
    const path = join(target, dir);
    if ((await exists(path)) && (await stat(path)).isDirectory()) directories.push(dir);
  }

  const evidence: string[] = [];
  if (files.includes("README.md") || directories.includes("docs")) evidence.push("documentation surface");
  if (directories.includes("tests") || directories.includes("test")) evidence.push("test surface");
  if (files.includes("package.json") || files.includes("pnpm-workspace.yaml")) evidence.push("node workspace");
  if (files.includes("pyproject.toml")) evidence.push("python workspace");
  if (files.includes("go.mod")) evidence.push("go workspace");
  if (files.includes("Cargo.toml")) evidence.push("rust workspace");
  if (files.includes("pubspec.yaml")) evidence.push("dart/flutter workspace");
  if (directories.includes(".github/workflows")) evidence.push("ci workflow surface");
  if (directories.some((dir) => ["src", "app", "lib"].includes(dir))) evidence.push("implementation surface");
  return { files, directories, evidence };
}

function pairRecommendationDetails(
  registry: RegistrySummary,
  signals: RepoSignals,
  runMode: RunMode,
  targetState: TargetState,
  loomExists: boolean,
): PairRecommendationDetail[] {
  if (runMode === "setup" && targetState === "existing" && !loomExists) {
    return [
      {
        pair: null,
        command: null,
        rationale:
          "Existing .harness/cycle state was detected without .harness/loom; setup leaves it untouched. Run --migration to repair or refresh the foundation before pair/finalizer authoring or sync.",
        evidence: [...signals.files, ...signals.directories, ...signals.evidence],
      },
    ];
  }

  if (runMode === "setup" && targetState === "existing") {
    const roster =
      registry.pairCount > 0
        ? `Existing registry already contains ${registry.pairCount} pair(s); the script phase leaves them unchanged. Continue with LLM project analysis and author only additive pair/finalizer changes unless the user requests an improvement pass. Use --migration to refresh existing foundation contracts.`
        : "Existing harness state was detected, but no registered pairs were found; the script phase leaves the foundation unchanged. Continue with LLM project analysis or focused user clarification, then author the needed pair/finalizer configuration. Use --migration to refresh or repair the existing foundation.";
    return [
      {
        pair: null,
        command: null,
        rationale: roster,
        evidence: [
          ...registry.pairs.map((pair) => pair.sourceLine),
          ...signals.files,
          ...signals.directories,
          ...signals.evidence,
        ],
      },
    ];
  }

  if (registry.pairCount > 0) {
    return registry.pairs.map((pair) => {
      const reviewers = pair.reviewers.map((reviewer) => ` --reviewer ${reviewer}`).join("");
      const missing =
        pair.evidence.missing.length > 0
          ? ` Missing evidence: ${pair.evidence.missing.join(", ")}.`
          : "";
      return {
        pair: pair.pair,
        command: `/harness-pair-dev --add ${pair.pair} "Refresh ${pair.pair} against current repo evidence and contracts"${reviewers}`,
        rationale: `Registered pair topology was found in .harness/loom/registry.md.${missing}`,
        evidence: [pair.sourceLine, ...pair.evidence.missing.map((path) => `missing: ${path}`)],
      };
    });
  }

  const supportSignals = signals.evidence.filter((signal) =>
    ["documentation surface", "test surface", "ci workflow surface"].includes(signal),
  );
  return [
    {
      pair: null,
      command: null,
      rationale:
        supportSignals.length > 0
          ? `Only script-level support surfaces were detected (${supportSignals.join(", ")}); perform LLM project analysis or focused user clarification before authoring pair axes.`
          : "No deterministic script signal can identify project-specific pair axes; perform LLM project analysis or focused user clarification before authoring pairs.",
      evidence: [...signals.files, ...signals.directories, ...signals.evidence],
    },
  ];
}

function pairRecommendations(
  registry: RegistrySummary,
  signals: RepoSignals,
  runMode: RunMode,
  targetState: TargetState,
  loomExists: boolean,
): string[] {
  return pairRecommendationDetails(registry, signals, runMode, targetState, loomExists).map((detail) =>
    detail.command ? `${detail.rationale} Suggested command: ${detail.command}` : detail.rationale,
  );
}

function finalizerRecommendation(
  finalizer: FinalizerSummary,
  signals: RepoSignals,
  runMode: RunMode,
  targetState: TargetState,
  loomExists: boolean,
): string {
  if (runMode === "setup" && targetState === "existing" && !loomExists) {
    return "No .harness/loom foundation is present; run --migration to repair or refresh the foundation before authoring finalizer work or running sync.";
  }
  if (runMode === "setup" && targetState === "existing") {
    if (finalizer.customized) {
      return "Existing customized finalizer is left unchanged during the script phase; change it only if project analysis or the user selects new cycle-end work. Use --migration to refresh contract-owned finalizer surfaces.";
    }
    return "Existing finalizer is left unchanged during the script phase; author concrete cycle-end work during setup only after project analysis or user clarification. Use --migration to refresh the foundation.";
  }
  if (finalizer.customized) return finalizer.recommendation;
  if (signals.evidence.includes("documentation surface") && signals.evidence.includes("test surface")) {
    return "Consider a finalizer that checks goal coverage, summarizes verification, and refreshes release/docs notes at cycle end.";
  }
  if (signals.evidence.includes("documentation surface")) {
    return "Consider a finalizer that refreshes docs or changelog notes only when the cycle goal declares that duty.";
  }
  if (signals.evidence.includes("test surface") || signals.evidence.includes("ci workflow surface")) {
    return "Consider a finalizer that performs a cycle-end verification summary only when the goal requires it.";
  }
  return finalizer.recommendation;
}

function renderGenericPairSkill(pair: RegistryPair, signals: RepoSignals): string {
  const signalLine =
    signals.evidence.length > 0 ? signals.evidence.join(", ") : "the repository's current visible work surface";
  return [
    renderSkillFrontmatter(
      pair.skill,
      `Use when \`/harness-orchestrate\` dispatches the \`${pair.pair}\` pair in this project. Shared rubric for the producer and its reviewer(s).`,
    ),
    "",
    `# ${titleFromSlug(pair.pair)}`,
    "",
    "## Design Thinking",
    "",
    `${titleFromSlug(pair.pair)} owns a concrete project workstream inside the current repository. Migration keeps its user-authored guidance where possible while refreshing only the load-bearing runtime surface.`,
    "",
    "## Methodology",
    "",
    "1. Read the orchestrator envelope and current repo files before editing.\n" +
      "2. Keep work inside the registered pair boundary and current project evidence.\n" +
      `3. Use ${signalLine} as the current repo context for this pair.\n` +
      "4. Surface ownership or contract ambiguity instead of widening the pair silently.\n" +
      "5. Report concrete files, verification, and blocked follow-up.",
    "",
    "## Evaluation Criteria",
    "",
    "- The pair stays inside its declared ownership boundary.\n" +
      "- Current files, tests, or docs are cited when behavior changes.\n" +
      "- Producer and reviewer output follow the current runtime contract.\n" +
      "- Structural uncertainty is surfaced rather than hidden in a PASS.",
    "",
    "## Taboos",
    "",
    "- Do not copy stale snapshot files over current templates.\n" +
      "- Do not edit `.harness/cycle/` or derived provider trees.\n" +
      "- Do not broaden this pair into unrelated repository ownership.",
    "",
  ].join("\n");
}

function addUsage(map: Map<string, string[]>, slug: string, owner: string): void {
  const current = map.get(slug) ?? [];
  current.push(owner);
  map.set(slug, current);
}

function collectArtifactUsage(pairs: RegistryPair[]): ArtifactUsage {
  const usage: ArtifactUsage = {
    agents: new Map(),
    skills: new Map(),
  };
  for (const pair of pairs) {
    addUsage(usage.skills, pair.skill, pair.pair);
    addUsage(usage.agents, pair.producer, `${pair.pair}:producer`);
    for (const reviewer of pair.reviewers) addUsage(usage.agents, reviewer, `${pair.pair}:reviewer`);
  }
  return usage;
}

function uniqueOwners(owners: string[]): string[] {
  return [...new Set(owners)];
}

function sharedArtifactReason(kind: "agent" | "skill", slug: string, owners: string[]): string | null {
  const unique = uniqueOwners(owners);
  if (unique.length <= 1) return null;
  const scope = kind === "agent" ? "pair roles" : "pair entries";
  return `${kind} slug is shared by multiple ${scope} and cannot be safely migrated: ${slug} (${unique.join(", ")})`;
}

function validatePairBasics(pair: RegistryPair, seen: Set<string>): string | null {
  if (seen.has(pair.pair)) return `duplicate pair slug in snapshot registry: ${pair.pair}`;
  seen.add(pair.pair);
  for (const [label, value] of [
    ["pair", pair.pair],
    ["producer", pair.producer],
    ["skill", pair.skill],
  ] as const) {
    if (!HARNESS_SLUG_RE.test(value)) return `${label} slug is outside current harness namespace: ${value}`;
    if (FOUNDATION_SLUGS.has(value)) return `${label} slug is reserved for a foundation or singleton role: ${value}`;
  }
  if (pair.reviewers.length === 0) return "pair has no reviewer";
  const reviewerSeen = new Set<string>();
  for (const reviewer of pair.reviewers) {
    if (!HARNESS_SLUG_RE.test(reviewer)) return `reviewer slug is outside current harness namespace: ${reviewer}`;
    if (FOUNDATION_SLUGS.has(reviewer)) return `reviewer slug is reserved for a foundation or singleton role: ${reviewer}`;
    if (reviewer === pair.producer) return `producer and reviewer share the same agent slug: ${reviewer}`;
    if (reviewerSeen.has(reviewer)) return `duplicate reviewer slug: ${reviewer}`;
    reviewerSeen.add(reviewer);
  }
  return null;
}

function validatePairArtifacts(pair: RegistryPair, usage: ArtifactUsage): string | null {
  const skillReason = sharedArtifactReason("skill", pair.skill, usage.skills.get(pair.skill) ?? []);
  if (skillReason) return skillReason;
  const producerReason = sharedArtifactReason("agent", pair.producer, usage.agents.get(pair.producer) ?? []);
  if (producerReason) return producerReason;
  for (const reviewer of pair.reviewers) {
    const reviewerReason = sharedArtifactReason("agent", reviewer, usage.agents.get(reviewer) ?? []);
    if (reviewerReason) return reviewerReason;
  }
  return null;
}

async function readOptional(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function renderProducerAgent(pair: RegistryPair): string {
  const raw = loadTemplateSync(PRODUCER_TEMPLATE).replace(
    "name: {{PAIR_SLUG}}-producer",
    "name: {{PRODUCER_SLUG}}",
  );
  return renderTemplate(raw, {
    PAIR_SLUG: pair.pair,
    PRODUCER_SLUG: pair.producer,
    SKILL_SLUG: pair.skill,
    PRODUCER_ROLE_NAME: titleFromSlug(pair.producer),
    IDENTITY_PARAGRAPH:
      `${titleFromSlug(pair.producer)} is the producer for the registered \`${pair.pair}\` harness pair. It turns the orchestrator envelope, the shared pair skill, and current project evidence into one reviewed work artifact.`,
    PRINCIPLE_1: "Ground work in the envelope. Reason: the orchestrator owns task boundaries and runtime state.",
    PRINCIPLE_2: "Use snapshot intent carefully. Reason: old files explain responsibility but do not define the current contract.",
    PRINCIPLE_3: "Prefer narrow filesystem changes. Reason: convergence should not expand this pair's authority by accident.",
    PRINCIPLE_4: "Verify concrete effects. Reason: reviewers need paths, diffs, and command evidence rather than intent claims.",
    PRINCIPLE_5: "Surface structural uncertainty. Reason: split, ownership, or contract gaps belong in planner-visible escalation.",
    TASK_STEPS:
      "1. Read the dispatch envelope and the `harness-context` authority rules.\n" +
      `2. Load the shared \`${pair.skill}\` skill and identify the pair responsibility.\n` +
      "3. Inspect current project files named by the task scope.\n" +
      "4. Produce the requested artifact or code change inside scope.\n" +
      "5. Run the smallest relevant verification command available.\n" +
      "6. Report changed files, verification, and any blocked or out-of-scope items in the Producer Output Format.",
  });
}

function renderReviewerAgent(pair: RegistryPair, reviewer: string): string {
  const raw = loadTemplateSync(REVIEWER_TEMPLATE).replace(
    "name: {{PAIR_SLUG}}-reviewer",
    "name: {{REVIEWER_SLUG}}",
  );
  return renderTemplate(raw, {
    PAIR_SLUG: pair.pair,
    REVIEWER_SLUG: reviewer,
    SKILL_SLUG: pair.skill,
    REVIEWER_ROLE_NAME: titleFromSlug(reviewer),
    IDENTITY_PARAGRAPH:
      `${titleFromSlug(reviewer)} is a reviewer for the registered \`${pair.pair}\` harness pair. It grades the paired producer artifact against the shared skill, current contracts, and concrete filesystem evidence.`,
    PRINCIPLE_1: "Review by evidence. Reason: verdicts must cite concrete files, lines, diffs, or command results.",
    PRINCIPLE_2: "Preserve the pair boundary. Reason: this reviewer grades its registered workstream, not adjacent ownership.",
    PRINCIPLE_3: "Check contract freshness. Reason: migrated pairs must follow current templates and harness-context law.",
    PRINCIPLE_4: "Treat missing tests honestly. Reason: a PASS without regression evidence can hide broken convergence.",
    PRINCIPLE_5: "Escalate structural gaps. Reason: invalid planning or ownership cannot be repaired by reviewer optimism.",
    TASK_STEPS:
      "1. Read the producer task artifact and linked diff evidence.\n" +
      `2. Load the shared \`${pair.skill}\` skill and evaluate its criteria.\n` +
      "3. Check that changed files stay inside the envelope scope.\n" +
      "4. Verify the producer used current contracts rather than stale snapshot copies.\n" +
      "5. Inspect stated tests or explain why regression evidence is insufficient.\n" +
      "6. Emit the Reviewer Output Format with PASS or FAIL.",
  });
}

async function writePairArtifacts(
  target: string,
  pair: RegistryPair,
  skillBody: string,
  producerBody: string,
  reviewerBodies: Record<string, string>,
): Promise<string[]> {
  const filesWritten: string[] = [];
  const skillDir = join(target, ".harness", "loom", "skills", pair.skill);
  const agentsDir = join(target, ".harness", "loom", "agents");
  await mkdir(skillDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  const skillFile = join(skillDir, "SKILL.md");
  await writeFile(skillFile, skillBody);
  filesWritten.push(rel(target, skillFile));

  const producerFile = join(agentsDir, `${pair.producer}.md`);
  await writeFile(producerFile, producerBody);
  filesWritten.push(rel(target, producerFile));

  for (const reviewer of pair.reviewers) {
    const reviewerFile = join(agentsDir, `${reviewer}.md`);
    await writeFile(reviewerFile, reviewerBodies[reviewer]);
    filesWritten.push(rel(target, reviewerFile));
  }
  return filesWritten;
}

function migratedSkillBody(pair: RegistryPair, sourceBody: string | null, signals: RepoSignals): string {
  const base = renderGenericPairSkill(pair, signals);
  const source = sourceBody ?? base;
  const description = sourceBody ? frontmatterDescription(sourceBody) : null;
  const title = topHeading(source) ?? topHeading(base) ?? titleFromSlug(pair.pair);
  const body = bodyAfterTopHeading(source) ?? bodyAfterTopHeading(base) ?? "";
  return [
    renderSkillFrontmatter(
      pair.skill,
      description ?? frontmatterDescription(base) ?? `Use when \`/harness-orchestrate\` dispatches the \`${pair.pair}\` pair in this project.`,
    ),
    "",
    `# ${title}`,
    "",
    body.trimEnd(),
    "",
  ].join("\n");
}

function migratedAgentBody(
  pair: RegistryPair,
  slug: string,
  sourceBody: string | null,
  templateBody: string,
  role: "producer" | "reviewer",
): string {
  const requiredSkills = [pair.skill, "harness-context"];
  const skills = [...requiredSkills, ...preservedExtraSkills(sourceBody ?? "", requiredSkills)];
  const source = sourceBody ?? templateBody;
  const description =
    (sourceBody && frontmatterDescription(sourceBody)) ||
    frontmatterDescription(templateBody) ||
    `Use when \`/harness-orchestrate\` dispatches the \`${pair.pair}\` ${role} turn.`;
  const model = sourceBody ? frontmatterScalar(sourceBody, "model") : null;
  const title = topHeading(source) || topHeading(templateBody) || titleFromSlug(slug);
  const outputFormat = (section(templateBody, "Output Format") || "").trim();
  const tail = bodyAfterTopHeading(source) ?? bodyAfterTopHeading(templateBody) ?? "";
  const body = replaceTopLevelSection([`# ${title}`, "", tail.trimEnd(), ""].join("\n"), "Output Format", outputFormat);
  return [
    renderAgentFrontmatter(slug, description, skills, model),
    "",
    body.trimEnd(),
    "",
  ].join("\n");
}

function migratedFinalizerBody(sourceBody: string): string {
  const template = loadTemplateSync(FINALIZER_TEMPLATE);
  const description =
    frontmatterDescription(sourceBody) ??
    frontmatterDescription(template) ??
    "Use when the orchestrator dispatches the cycle-end finalizer turn.";
  const model = frontmatterScalar(sourceBody, "model");
  const title = topHeading(sourceBody) ?? topHeading(template) ?? "Finalizer";
  const outputFormat = finalizerOutputFormatContract(template).trim();
  const tail = bodyAfterTopHeading(sourceBody) ?? bodyAfterTopHeading(template) ?? "";
  const body = replaceTopLevelSection(
    removeTopLevelSection([`# ${title}`, "", tail.trimEnd(), ""].join("\n"), "Structural Issue"),
    "Output Format",
    outputFormat,
  );
  return [
    renderAgentFrontmatter("harness-finalizer", description, ["harness-context"], model),
    "",
    body.trimEnd(),
    "",
  ].join("\n");
}

function snapshotLocator(snapshotPath: string, pair: string): string {
  return `snapshot:${basename(snapshotPath)}/${pair}`;
}

function runPairDevPrepareAdd(
  target: string,
  pair: RegistryPair,
  purpose: string,
  fromLocator: string,
): {
  from: {
    kind: "live" | "snapshot" | "archive";
    locator: string;
    registryPath: string;
    pair: string;
    producer: string;
    reviewers: string[];
    skill: string;
    skillPath: string | null;
    producerPath: string | null;
    reviewerPaths: Record<string, string | null>;
    missingArtifacts: string[];
  };
} {
  const args = [PAIR_DEV_SCRIPT, "--add", pair.pair, purpose, "--from", fromLocator];
  for (const reviewer of pair.reviewers) args.push("--reviewer", reviewer);
  const result = spawnSync(process.execPath, args, { encoding: "utf8", cwd: target });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "pair-dev prepare-add failed";
    die(`migration prepare failed for ${pair.pair}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    die(`migration prepare for ${pair.pair} did not return JSON`);
  }
}

function loadTemplateSync(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    die(`missing template: ${path}`);
  }
}

function runRegisterPair(target: string, pair: RegistryPair): unknown {
  const args = [
    REGISTER_PAIR_SCRIPT,
    "--target",
    target,
    "--pair",
    pair.pair,
    "--producer",
    pair.producer,
    "--skill",
    pair.skill,
  ];
  for (const reviewer of pair.reviewers) args.push("--reviewer", reviewer);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "registration failed";
    die(`pair migration registration failed for ${pair.pair}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout.trim();
  }
}

async function migratePairs(
  target: string,
  snapshotPath: string | null,
  registry: RegistrySummary,
  signals: RepoSignals,
): Promise<PairMigrationResult> {
  if (!snapshotPath || registry.pairCount === 0) return { operations: [], migrationPlanPairs: [] };
  const out: PairOperation[] = [];
  const migrationPlanPairs: MigrationPlanPair[] = [];
  const seen = new Set<string>();
  const basicInvalidReasons = registry.pairs.map((pair) => validatePairBasics(pair, seen));
  const artifactUsage = collectArtifactUsage(registry.pairs.filter((_, index) => !basicInvalidReasons[index]));

  for (const [index, pair] of registry.pairs.entries()) {
    const invalidReason = basicInvalidReasons[index] ?? validatePairArtifacts(pair, artifactUsage);
    if (invalidReason) {
      out.push({
        pair: pair.pair,
        status: "skipped",
        reason: invalidReason,
        producer: pair.producer,
        reviewers: pair.reviewers,
        skill: pair.skill,
        filesWritten: [],
        registry: null,
        evidenceLines: [],
        preserved: [],
        replaced: [],
        manualReview: [],
        source: null,
        convergence: {
          improvementPasses: 0,
          stopReason: "invalid migration source",
          qualityVerdict: "manual-review",
        },
      });
      continue;
    }

    const prepared = runPairDevPrepareAdd(
      target,
      pair,
      `Migrate ${pair.pair} to the current runtime contract while preserving project-specific guidance.`,
      snapshotLocator(snapshotPath, pair.pair),
    );
    const sourceSkillBody =
      prepared.from.skillPath ? await readOptional(join(target, prepared.from.skillPath)) : null;
    const sourceProducerBody =
      prepared.from.producerPath ? await readOptional(join(target, prepared.from.producerPath)) : null;
    const sourceReviewerBodies = await Promise.all(
      pair.reviewers.map(async (reviewer) => [
        reviewer,
        prepared.from.reviewerPaths[reviewer]
          ? await readOptional(join(target, prepared.from.reviewerPaths[reviewer]!))
          : null,
      ] as const),
    );
    const reviewerBodies = Object.fromEntries(
      sourceReviewerBodies.map(([reviewer, body]) => [
        reviewer,
        migratedAgentBody(pair, reviewer, body, renderReviewerAgent(pair, reviewer), "reviewer"),
      ]),
    );
    const filesWritten = await writePairArtifacts(
      target,
      pair,
      migratedSkillBody(pair, sourceSkillBody, signals),
      migratedAgentBody(pair, pair.producer, sourceProducerBody, renderProducerAgent(pair), "producer"),
      reviewerBodies,
    );
    const registration = runRegisterPair(target, pair);
    const userSurfaces = [
      ...h2Headings(sourceSkillBody).map((heading) => `skill:${heading}`),
      ...h2Headings(sourceProducerBody).map((heading) => `producer:${heading}`),
      ...sourceReviewerBodies.flatMap(([reviewer, body]) =>
        h2Headings(body).map((heading) => `${reviewer}:${heading}`),
      ),
    ].filter((surface) => !surface.endsWith(":Output Format"));
    const preserved = [
      ...h2Headings(sourceSkillBody).map((heading) => `skill ${heading}`),
      ...(sourceProducerBody && introAfterHeading(sourceProducerBody) ? ["producer identity paragraph"] : []),
      ...h2Headings(sourceProducerBody)
        .filter((heading) => heading !== "Output Format")
        .map((heading) => `producer ${heading}`),
      ...sourceReviewerBodies.flatMap(([reviewer, body]) =>
        h2Headings(body)
          .filter((heading) => heading !== "Output Format")
          .map((heading) => `${reviewer} ${heading}`),
      ),
    ];
    const manualReview = [...prepared.from.missingArtifacts];
    if (!sourceSkillBody) manualReview.push(`missing migration source skill for ${pair.skill}`);
    if (!sourceProducerBody) manualReview.push(`missing migration source producer for ${pair.producer}`);
    migrationPlanPairs.push({
      pair: pair.pair,
      source: {
        skillPath: prepared.from.skillPath,
        producerPath: prepared.from.producerPath,
        reviewerPaths: prepared.from.reviewerPaths,
        missingArtifacts: prepared.from.missingArtifacts,
      },
      target: {
        skillPath: `.harness/loom/skills/${pair.skill}/SKILL.md`,
        producerPath: `.harness/loom/agents/${pair.producer}.md`,
        reviewerPaths: Object.fromEntries(
          pair.reviewers.map((reviewer) => [reviewer, `.harness/loom/agents/${reviewer}.md`]),
        ),
      },
      overlayMethodology: "plugins/harness-loom/skills/harness-pair-dev/references/authoring/from-overlay.md",
      contractSurfaces: ["frontmatter name", "frontmatter skills", "role Output Format"],
      userSurfaces,
      manualReviewNotes: [...new Set(manualReview)],
    });

    out.push({
      pair: pair.pair,
      status: "migrated",
      reason: "migration mode preserved source guidance while refreshing contract-owned surfaces",
      producer: pair.producer,
      reviewers: pair.reviewers,
      skill: pair.skill,
      filesWritten,
      registry: registration,
      evidenceLines: [
        `Migration source: ${prepared.from.locator}`,
        ...prepared.from.missingArtifacts.map((path) => `Missing source artifact: ${path}`),
      ],
      preserved,
      replaced: [
        "frontmatter name",
        "frontmatter skills",
        "current Output Format",
      ],
      manualReview: [...new Set(manualReview)],
      source: {
        kind: prepared.from.kind,
        locator: prepared.from.locator,
      },
      convergence: {
        improvementPasses: 0,
        stopReason:
          manualReview.length > 0
            ? "migration completed with manual-review notes"
            : "migration contract refreshed without extra improve pass",
        qualityVerdict: manualReview.length > 0 ? "manual-review" : "acceptable",
      },
    });
  }
  return { operations: out, migrationPlanPairs };
}

function finalizerEvidence(body: string, summary: FinalizerSummary): string[] {
  const marked = markedEvidence(body);
  if (marked && marked.length > 0) return marked;
  const out: string[] = [];
  if (summary.signals.length > 0) out.push(`Signals: ${summary.signals.join(", ")}`);
  const preview = taskPreview(body);
  if (preview) out.push(`Prior task: ${preview}`);
  out.push(...evidenceFromMarkdown(body, ["Task", "Principles"], "Prior finalizer"));
  return uniqueCapped(out, 10);
}

async function authorSetupFinalizer(
  target: string,
  signals: RepoSignals,
): Promise<FinalizerOperation> {
  const finalizerPath = join(target, ".harness", "loom", "agents", "harness-finalizer.md");
  return {
    status: "default-noop",
    reason: "fresh setup keeps the installed safe no-op until a concrete project cycle-end duty is selected",
    path: rel(target, finalizerPath),
    filesWritten: [],
    evidenceLines: signals.evidence.map((signal) => `Repo signal: ${signal}`),
    preserved: [],
    replaced: [],
    manualReview: [],
    convergence: {
      improvementPasses: 0,
      stopReason: "repo signals are recommendation evidence, not enough proof for script-authored finalizer work",
      qualityVerdict: "fallback",
    },
  };
}

async function migrateFinalizer(
  target: string,
  snapshotPath: string | null,
  summary: FinalizerSummary,
): Promise<FinalizerOperation> {
  const finalizerPath = join(target, ".harness", "loom", "agents", "harness-finalizer.md");
  if (summary.status === "absent") {
    return {
      status: "missing",
      reason: "no prior finalizer existed; current default no-op remains",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
      preserved: [],
      replaced: [],
      manualReview: [],
      convergence: {
        improvementPasses: 0,
        stopReason: "no prior finalizer to migrate",
        qualityVerdict: "fallback",
      },
    };
  }
  if (summary.status === "default-noop") {
    return {
      status: "default-noop",
      reason: "prior finalizer was already the safe no-op; current default remains",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
      preserved: [],
      replaced: [],
      manualReview: [],
      convergence: {
        improvementPasses: 0,
        stopReason: "default no-op required no migration",
        qualityVerdict: "acceptable",
      },
    };
  }
  if (!snapshotPath) {
    return {
      status: "skipped",
      reason: "migration mode needs snapshot evidence to preserve the finalizer body",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
      preserved: [],
      replaced: [],
      manualReview: ["missing snapshot path for migration finalizer"],
      convergence: {
        improvementPasses: 0,
        stopReason: "missing snapshot path",
        qualityVerdict: "manual-review",
      },
    };
  }
  const snapshotFinalizer = join(snapshotPath, "loom", "agents", "harness-finalizer.md");
  const sourceBody = await readOptional(snapshotFinalizer);
  if (!sourceBody) {
    return {
      status: "skipped",
      reason: "migration source finalizer body was not readable",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
      preserved: [],
      replaced: [],
      manualReview: [rel(target, snapshotFinalizer)],
      convergence: {
        improvementPasses: 0,
        stopReason: "missing migration finalizer source body",
        qualityVerdict: "manual-review",
      },
    };
  }
  await writeFile(finalizerPath, migratedFinalizerBody(sourceBody));
  return {
    status: "migrated",
    reason: "migration mode preserved finalizer duties while refreshing contract-owned surfaces",
    path: rel(target, finalizerPath),
    filesWritten: [rel(target, finalizerPath)],
    evidenceLines: finalizerEvidence(sourceBody, summary),
    preserved: [
      ...(introAfterHeading(sourceBody) ? ["finalizer intro"] : []),
      ...(section(sourceBody, "Principles") ? ["finalizer Principles"] : []),
      ...(section(sourceBody, "Task") ? ["finalizer Task"] : []),
    ],
    replaced: ["frontmatter skills", "current Output Format", "current Structural Issue block"],
    manualReview: [],
    convergence: {
      improvementPasses: 0,
      stopReason: "migration preserved finalizer body with current contract surfaces",
      qualityVerdict: "acceptable",
    },
  };
}

function finalizerMigrationPlan(
  target: string,
  snapshotPath: string | null,
  summary: FinalizerSummary,
): MigrationPlanFinalizer | null {
  const targetPath = ".harness/loom/agents/harness-finalizer.md";
  if (summary.status === "absent" || summary.status === "default-noop") return null;
  const sourcePath = snapshotPath ? rel(target, join(snapshotPath, "loom", "agents", "harness-finalizer.md")) : null;
  return {
    required: summary.status === "customized",
    source: { agentPath: sourcePath },
    target: { agentPath: targetPath },
    overlayMethodology: "plugins/harness-loom/skills/harness-auto-setup/references/finalizer-overlay.md",
    contractSurfaces: ["frontmatter name", "frontmatter skills", "Output Format", "Structural Issue contract"],
    userSurfaces: ["intro", "Principles", "Task", "compatible custom H2 sections"],
    manualReviewNotes:
      summary.status === "customized" ? [] : [`finalizer status is ${summary.status}; inspect snapshot before migration`],
  };
}

async function createSnapshot(
  target: string,
  createdAt: string,
  runMode: RunMode,
  targetState: TargetState,
  activeCycle: ActiveCycleSummary,
  registrySummary: RegistrySummary,
  finalizerSummary: FinalizerSummary,
  recommendations: { pairs: string[]; finalizer: string; sync: string },
): Promise<{ created: boolean; path: string; manifestPath: string; copiedNamespaces: string[] }> {
  const snapshotPath = await allocateSnapshotDir(target, createdAt);
  const harnessDir = join(target, ".harness");
  const copiedNamespaces: string[] = [];
  const copies = [
    { ns: ".harness/cycle", src: join(harnessDir, "cycle"), dst: join(snapshotPath, "cycle") },
    { ns: ".harness/loom", src: join(harnessDir, "loom"), dst: join(snapshotPath, "loom") },
  ];
  for (const copySpec of copies) {
    if (await exists(copySpec.src)) {
      await cp(copySpec.src, copySpec.dst, { recursive: true });
      copiedNamespaces.push(copySpec.ns);
    }
  }
  copiedNamespaces.sort();

  const manifest: Manifest = {
    schemaVersion: 1,
    tool: "harness-auto-setup",
    targetPath: target,
    createdAt,
    snapshotPath,
    copiedNamespaces,
    activeCycle,
    registrySummary,
    finalizerSummary,
    nextAction: "Foundation refresh will reseed .harness/loom and .harness/cycle; valid registered pairs and customized finalizer intent will be migrated after refresh, then explicit sync remains a user-run command.",
    runMode,
    targetState,
    recommendations: {
      mode: runMode,
      pairs: recommendations.pairs,
      finalizer: recommendations.finalizer,
      sync: recommendations.sync,
    },
  };
  const manifestPath = join(snapshotPath, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { created: true, path: snapshotPath, manifestPath, copiedNamespaces };
}

function runInstall(target: string): InstallResult {
  const result = spawnSync(process.execPath, [INSTALL_SCRIPT], { encoding: "utf8", cwd: target });
  let summary: unknown = null;
  if (result.stdout.trim()) {
    try {
      summary = JSON.parse(result.stdout);
    } catch {
      summary = null;
    }
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    summary,
  };
}

function skippedInstall(reason: string): InstallResult {
  return { status: null, stdout: "", stderr: "", summary: null, skipped: true, reason };
}

function skippedExistingSetupFinalizer(path: string | null): FinalizerOperation {
  return {
    status: "skipped",
    reason: "setup script phase leaves existing finalizer files unchanged; author cycle-end changes only after project analysis or user clarification",
    path,
    filesWritten: [],
    evidenceLines: [],
    preserved: [],
    replaced: [],
    manualReview: [],
    convergence: {
      improvementPasses: 0,
      stopReason: "existing setup script phase is inspection-only; assistant authoring follows when needed",
      qualityVerdict: "acceptable",
    },
  };
}

function convergenceMode(runMode: RunMode, targetState: TargetState, loomExists: boolean): string {
  if (runMode === "migration") return "protected-migration-overlay";
  if (targetState === "fresh") return "setup-bootstrap-authoring-required";
  if (!loomExists) return "setup-cycle-only-migration-required";
  return "setup-inspection-authoring-required";
}

function convergenceNote(runMode: RunMode, targetState: TargetState, loomExists: boolean): string {
  if (runMode === "migration") {
    return "Migration mode snapshots existing harness state, refreshes foundation contracts, preserves compatible source sections, and emits an explicit migration plan.";
  }
  if (targetState === "fresh") {
    return "Setup script phase installs the foundation on fresh targets; the assistant must continue with project analysis or focused user clarification before authoring concrete pair/finalizer configuration.";
  }
  if (!loomExists) {
    return "Setup script phase detected .harness/cycle without .harness/loom and left cycle state untouched; run --migration to repair or refresh the foundation before pair/finalizer authoring or sync.";
  }
  return "Setup script phase detected an existing harness and left the foundation untouched; the assistant must continue with project analysis or focused user clarification before authoring additive pair/finalizer configuration. Use --migration for foundation refresh.";
}

function setupAuthoringSummary(
  runMode: RunMode,
  targetState: TargetState,
  loomExists: boolean,
  providers: string[],
): unknown {
  if (runMode !== "setup") return null;
  if (targetState === "existing" && !loomExists) {
    return {
      required: false,
      blocked: true,
      scriptPhaseOnly: true,
      mayAskUser: false,
      reason: ".harness/cycle exists but .harness/loom is missing, so setup cannot safely author pairs/finalizer or offer sync.",
      expectedNextWork: `Run ${autoSetupCommand("migration", providers)} to repair or refresh the foundation before pair/finalizer authoring or sync.`,
      stopCondition: "Stop setup-mode authoring until the foundation has been repaired or refreshed.",
    };
  }
  return {
    required: true,
    scriptPhaseOnly: true,
    mayAskUser: true,
    questionPolicy: "Ask at most three concise questions only when repo evidence cannot determine project purpose, workflow boundary, or review axes.",
    expectedNextWork:
      targetState === "fresh"
        ? "Inspect the project, then author the initial registered pair roster and customize the singleton finalizer only when a concrete cycle-end duty is selected."
        : "Inspect the project and existing roster, then author additive registered pairs or finalizer changes without refreshing existing foundation state.",
    stopCondition: "Stop without authoring only when the project is effectively blank or the user declines to choose a workflow boundary.",
  };
}

function nextAction(runMode: RunMode, targetState: TargetState, loomExists: boolean, command: string, providers: string[]): string {
  if (runMode === "migration") {
    return `From the target root, run \`${command}\` for any platform trees you want to refresh.`;
  }
  if (targetState === "fresh") {
    return `Continue setup by inspecting the project, asking focused questions only if needed, and authoring the initial pair/finalizer configuration under .harness/loom; after that authoring is complete, run \`${command}\` for any platform trees you want to refresh.`;
  }
  if (!loomExists) {
    return `Run \`${autoSetupCommand("migration", providers)}\` before authoring pairs/finalizer or running sync; setup left existing .harness/cycle untouched because .harness/loom is missing.`;
  }
  return `Continue setup by inspecting the project and existing roster, then author only additive pair/finalizer changes under .harness/loom unless the user requested improvement; after that authoring is complete, run \`${command}\` for any platform trees you want to refresh.`;
}

function pairOwnedLoomEntries(registry: RegistrySummary): { skills: Set<string>; agents: Set<string> } {
  const skills = new Set<string>();
  const agents = new Set<string>();
  for (const pair of registry.pairs) {
    skills.add(pair.skill);
    agents.add(`${pair.producer}.md`);
    for (const reviewer of pair.reviewers) agents.add(`${reviewer}.md`);
  }
  return { skills, agents };
}

async function restoreCustomLoomEntries(
  target: string,
  snapshotPath: string | null,
  registry: RegistrySummary,
): Promise<RestoredCustomEntries> {
  const restored: RestoredCustomEntries = { skills: [], agents: [], skipped: [] };
  if (!snapshotPath) return restored;
  const snapshotLoom = join(snapshotPath, "loom");
  if (!(await exists(snapshotLoom))) return restored;
  const owned = pairOwnedLoomEntries(registry);

  const skillsRoot = join(snapshotLoom, "skills");
  if (await exists(skillsRoot)) {
    for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        restored.skipped.push({
          path: `skills/${entry.name}`,
          reason: "custom skill entries must be directories",
        });
        continue;
      }
      if (FOUNDATION_SLUGS.has(entry.name) || owned.skills.has(entry.name)) continue;
      const source = join(skillsRoot, entry.name);
      const targetPath = join(target, ".harness", "loom", "skills", entry.name);
      await cp(source, targetPath, { recursive: true, force: true });
      restored.skills.push(entry.name);
    }
  }

  const agentsRoot = join(snapshotLoom, "agents");
  if (await exists(agentsRoot)) {
    for (const entry of await readdir(agentsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        restored.skipped.push({
          path: `agents/${entry.name}`,
          reason: "custom agent entries must be markdown files",
        });
        continue;
      }
      const slug = entry.name.replace(/\.md$/, "");
      if (FOUNDATION_SLUGS.has(slug) || owned.agents.has(entry.name)) continue;
      const source = join(agentsRoot, entry.name);
      const targetPath = join(target, ".harness", "loom", "agents", entry.name);
      await cp(source, targetPath, { force: true });
      restored.agents.push(entry.name);
    }
  }

  restored.skills.sort();
  restored.agents.sort();
  restored.skipped.sort((a, b) => a.path.localeCompare(b.path));
  for (const skipped of restored.skipped) {
    process.stderr.write(`harness-auto-setup: warning - skipped custom loom entry ${skipped.path}: ${skipped.reason}\n`);
  }
  return restored;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!(await exists(args.target))) die(`target does not exist: ${args.target}`);
  const targetStat = await stat(args.target);
  if (!targetStat.isDirectory()) die(`target is not a directory: ${args.target}`);

  const createdAt = new Date().toISOString();
  const harnessDir = join(args.target, ".harness");
  const loomDir = join(harnessDir, "loom");
  const cycleDir = join(harnessDir, "cycle");
  const loomExists = await exists(loomDir);
  const cycleExists = await exists(cycleDir);
  const targetState: TargetState = loomExists || cycleExists ? "existing" : "fresh";
  if (args.runMode === "migration" && targetState === "fresh") {
    die("--migration requires existing .harness/loom or .harness/cycle state");
  }
  const command = syncCommand(args.providers);

  const activeCycle = await classifyCycle(args.target, cycleDir);
  const registrySummary: RegistrySummary = loomExists
    ? await summarizeRegistry(args.target, loomDir)
    : { status: "absent", path: null, pairCount: 0, pairs: [], unparsedLines: [] };
  const finalizerSummary: FinalizerSummary = loomExists
    ? await summarizeFinalizer(args.target, loomDir)
    : {
        status: "absent",
        path: null,
        customized: false,
        signals: [],
        taskPreview: null,
        recommendation: "No prior finalizer exists; keep the installed safe no-op unless repo evidence justifies concrete cycle-end work.",
      };
  const signals = await repoSignals(args.target);
  const recommendations = {
    pairs: pairRecommendations(registrySummary, signals, args.runMode, targetState, loomExists),
    finalizer: finalizerRecommendation(finalizerSummary, signals, args.runMode, targetState, loomExists),
    sync: command,
  };
  const refreshesFoundation = args.runMode === "migration" || targetState === "fresh";

  const snapshot =
    args.runMode === "migration"
      ? await createSnapshot(
          args.target,
          createdAt,
          args.runMode,
          targetState,
          activeCycle,
          registrySummary,
          finalizerSummary,
          recommendations,
        )
      : { created: false, path: null, manifestPath: null, copiedNamespaces: [] };

  const warnings: string[] = [];
  if (
    refreshesFoundation &&
    (activeCycle.classification === "active" || activeCycle.classification === "unknown")
  ) {
    warnings.push(
      `Existing cycle classified as ${activeCycle.classification}; it was copied to ${snapshot.path} and will be discarded/reseeded by foundation refresh.`,
    );
  }
  for (const warning of warnings) {
    process.stderr.write(`harness-auto-setup: warning - ${warning}\n`);
  }

  const install = refreshesFoundation
    ? runInstall(args.target)
    : skippedInstall("setup mode leaves existing .harness foundation untouched; use --migration to refresh it");
  if (install.stderr) process.stderr.write(install.stderr);
  if (!install.skipped && install.status !== 0) {
    const detail = install.stderr.trim() || install.stdout.trim() || "install failed";
    die(`foundation refresh failed: ${detail}`);
  }

  const restoredCustomEntries =
    args.runMode === "migration"
      ? await restoreCustomLoomEntries(args.target, snapshot.path, registrySummary)
      : { skills: [], agents: [], skipped: [] };

  let pairOperations: PairOperation[] = [];
  let finalizerOperation: FinalizerOperation;
  let migrationPlan: MigrationPlan | null = null;
  if (args.runMode === "migration") {
    const migratedPairs = await migratePairs(args.target, snapshot.path, registrySummary, signals);
    pairOperations = migratedPairs.operations;
    finalizerOperation = await migrateFinalizer(args.target, snapshot.path, finalizerSummary);
    migrationPlan = {
      pairs: migratedPairs.migrationPlanPairs,
      finalizer: finalizerMigrationPlan(args.target, snapshot.path, finalizerSummary),
    };
  } else if (targetState === "existing") {
    pairOperations = [];
    finalizerOperation = skippedExistingSetupFinalizer(finalizerSummary.path);
  } else {
    pairOperations = [];
    finalizerOperation = await authorSetupFinalizer(args.target, signals);
  }

  const summary = {
    schemaVersion: 1,
    tool: "harness-auto-setup",
    targetPath: args.target,
    createdAt,
    mode: args.runMode,
    targetState,
    snapshot,
    activeCycle,
    registrySummary,
    finalizerSummary,
    repoSignals: signals,
    convergence: {
      mode: convergenceMode(args.runMode, targetState, loomExists),
      note: convergenceNote(args.runMode, targetState, loomExists),
      pairOperations,
      finalizerOperation,
      restoredCustomEntries,
      migrationPlan,
      setupAuthoring: setupAuthoringSummary(args.runMode, targetState, loomExists, args.providers),
      pairRecommendations: recommendations.pairs,
      pairRecommendationDetails: pairRecommendationDetails(registrySummary, signals, args.runMode, targetState, loomExists),
      finalizerRecommendation: recommendations.finalizer,
    },
    install: {
      status: install.status,
      summary: install.summary,
      skipped: install.skipped ?? false,
      reason: install.reason ?? null,
    },
    warnings,
    providerTreesWritten: [],
    syncCommand: command,
    nextAction: nextAction(args.runMode, targetState, loomExists, command, args.providers),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
