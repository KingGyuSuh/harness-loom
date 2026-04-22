#!/usr/bin/env node
// Purpose: Snapshot existing target harness state, classify cycle risk, then
//          delegate foundation refresh to harness-init's installer. Valid
//          registered pairs and customized finalizer intent are reconstructed
//          from snapshot evidence on top of current templates; stale harness
//          files are never blind-copied and platform sync is never run.

import { spawnSync } from "node:child_process";
import { constants as FS, readFileSync } from "node:fs";
import { access, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const INSTALL_SCRIPT = resolve(SCRIPT_DIR, "../../harness-init/scripts/install.ts");
const FINALIZER_TEMPLATE = resolve(
  SCRIPT_DIR,
  "../../harness-init/references/runtime/harness-finalizer.template.md",
);
const PAIR_DEV_DIR = resolve(SCRIPT_DIR, "../../harness-pair-dev");
const REGISTER_PAIR_SCRIPT = resolve(PAIR_DEV_DIR, "scripts/register-pair.ts");
const PRODUCER_TEMPLATE = resolve(PAIR_DEV_DIR, "templates/producer-agent.md");
const REVIEWER_TEMPLATE = resolve(PAIR_DEV_DIR, "templates/reviewer-agent.md");
const PAIR_SKILL_TEMPLATE = resolve(PAIR_DEV_DIR, "templates/pair-skill.md");
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

interface Args {
  target: string;
  providers: string[];
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
  recommendations: {
    mode: string;
    pairs: string[];
    finalizer: string;
    sync: string;
  };
}

interface PairIntent {
  skillPath: string | null;
  producerPath: string | null;
  reviewerPaths: Record<string, string | null>;
  evidenceLines: string[];
}

interface PairReconstruction {
  pair: string;
  status: "reconstructed" | "skipped";
  reason: string;
  producer: string;
  reviewers: string[];
  skill: string;
  filesWritten: string[];
  registry: unknown;
  evidenceLines: string[];
}

interface ArtifactUsage {
  agents: Map<string, string[]>;
  skills: Map<string, string[]>;
}

interface FinalizerReconstruction {
  status: "reconstructed" | "default-noop" | "missing" | "skipped";
  reason: string;
  path: string | null;
  filesWritten: string[];
  evidenceLines: string[];
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
  const positional: string[] = [];
  let providers = ["claude", "codex", "gemini"];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-auto-setup/scripts/auto-setup.ts [<target-project-path>] [--provider <claude,codex,gemini>]\n" +
          "  Target defaults to process.cwd() when omitted.\n" +
          "  The provider list is only used to print the explicit sync handoff; sync is not run.\n",
      );
      process.exit(0);
    } else if (arg === "--provider") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) die("--provider requires a comma-separated list");
      providers = parseProviders(value);
    } else if (arg.startsWith("--")) {
      die(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) die("at most one <target-project-path> accepted");
  const targetArg = positional[0] ?? process.cwd();
  const target = isAbsolute(targetArg) ? targetArg : resolve(process.cwd(), targetArg);
  return { target, providers };
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

function replaceSection(body: string, heading: string, replacement: string): string {
  const normalized = body.replace(/\r\n/g, "\n");
  const headingLine = `## ${heading}`;
  const headingIdxLineStart = normalized.indexOf(`\n${headingLine}\n`);
  const headingIdx =
    headingIdxLineStart !== -1
      ? headingIdxLineStart + 1
      : normalized.startsWith(`${headingLine}\n`)
      ? 0
      : -1;
  const sectionBody = replacement.trimEnd() + "\n";
  if (headingIdx === -1) {
    const sep = normalized.endsWith("\n") ? "" : "\n";
    return `${normalized}${sep}\n${headingLine}\n\n${sectionBody}`;
  }
  const bodyStart = normalized.indexOf("\n", headingIdx) + 1;
  const nextHeading = normalized.indexOf("\n## ", bodyStart);
  const bodyEnd = nextHeading === -1 ? normalized.length : nextHeading;
  return normalized.slice(0, bodyStart) + sectionBody + normalized.slice(bodyEnd);
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

function frontmatterDescription(body: string): string | null {
  const normalized = body.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n[\s\S]*?\ndescription:\s*"?([^"\n]+)"?[\s\S]*?\n---/);
  return match ? match[1].trim() : null;
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

function pairRecommendations(registry: RegistrySummary, signals: RepoSignals): string[] {
  if (registry.pairCount > 0) {
    return registry.pairs.map((pair) => {
      const reviewers = pair.reviewers.map((reviewer) => ` --reviewer ${reviewer}`).join("");
      const missing =
        pair.evidence.missing.length > 0
          ? ` Missing evidence: ${pair.evidence.missing.join(", ")}.`
          : "";
      return `Re-author ${pair.pair} from snapshot evidence with current templates: /harness-pair-dev --add ${pair.pair} "Refresh ${pair.pair} against current repo evidence and contracts"${reviewers}.${missing}`;
    });
  }

  const out: string[] = [];
  if (signals.evidence.includes("documentation surface")) {
    out.push(
      'Repo has documentation evidence; consider /harness-pair-dev --add harness-document "Maintain user-facing docs and pointer-doc alignment" --reviewer harness-document-reviewer.',
    );
  }
  if (signals.evidence.includes("test surface") || signals.evidence.includes("ci workflow surface")) {
    out.push(
      'Repo has verification evidence; consider /harness-pair-dev --add harness-verification "Maintain regression tests and smoke checks" --reviewer harness-verification-reviewer.',
    );
  }
  if (signals.evidence.includes("implementation surface")) {
    out.push(
      'Repo has implementation surfaces; inspect ownership boundaries before adding a producer-reviewer implementation pair.',
    );
  }
  if (out.length === 0) {
    out.push("No strong repo-grounded pair recommendation found; leave registry empty until concrete workstreams are identified.");
  }
  return out;
}

function finalizerRecommendation(finalizer: FinalizerSummary, signals: RepoSignals): string {
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
  return `${kind} slug is shared by multiple ${scope} and cannot be safely reconstructed: ${slug} (${unique.join(", ")})`;
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

async function collectPairIntent(target: string, snapshotPath: string, pair: RegistryPair): Promise<PairIntent> {
  const snapshotLoom = join(snapshotPath, "loom");
  const skillPath = join(snapshotLoom, "skills", pair.skill, "SKILL.md");
  const producerPath = join(snapshotLoom, "agents", `${pair.producer}.md`);
  const reviewerPaths: Record<string, string | null> = {};
  const evidenceLines: string[] = [];

  const skillBody = await readOptional(skillPath);
  const skillMarkedEvidence = skillBody ? markedEvidence(skillBody) : null;
  if (skillMarkedEvidence && skillMarkedEvidence.length > 0) {
    for (const reviewer of pair.reviewers) {
      const reviewerPath = join(snapshotLoom, "agents", `${reviewer}.md`);
      reviewerPaths[reviewer] = (await exists(reviewerPath)) ? reviewerPath : null;
    }
    return {
      skillPath,
      producerPath: (await exists(producerPath)) ? producerPath : null,
      reviewerPaths,
      evidenceLines: skillMarkedEvidence,
    };
  }
  if (skillBody) {
    evidenceLines.push(...evidenceFromMarkdown(skillBody, ["Design Thinking", "Methodology", "Task"], "Prior skill"));
  } else {
    evidenceLines.push(`Prior skill missing: ${rel(target, skillPath)}`);
  }

  const producerBody = await readOptional(producerPath);
  if (producerBody) {
    evidenceLines.push(...evidenceFromMarkdown(producerBody, ["Task", "Principles"], "Prior producer"));
  } else {
    evidenceLines.push(`Prior producer missing: ${rel(target, producerPath)}`);
  }

  for (const reviewer of pair.reviewers) {
    const reviewerPath = join(snapshotLoom, "agents", `${reviewer}.md`);
    reviewerPaths[reviewer] = (await exists(reviewerPath)) ? reviewerPath : null;
    const reviewerBody = await readOptional(reviewerPath);
    if (reviewerBody) {
      evidenceLines.push(
        ...evidenceFromMarkdown(reviewerBody, ["Task", "Principles"], `Prior reviewer ${reviewer}`),
      );
    } else {
      evidenceLines.push(`Prior reviewer missing: ${rel(target, reviewerPath)}`);
    }
  }

  return {
    skillPath: skillBody ? skillPath : null,
    producerPath: producerBody ? producerPath : null,
    reviewerPaths,
    evidenceLines: uniqueCapped(evidenceLines, 10),
  };
}

function evidenceBulletBlock(lines: string[]): string {
  const body = lines.length > 0 ? lines : ["No readable prior body evidence; preserve only registry topology."];
  return body.map((line) => `- ${line}`).join("\n");
}

function renderPairSkill(pair: RegistryPair, intent: PairIntent, signals: RepoSignals): string {
  const evidence = evidenceBulletBlock(intent.evidenceLines);
  const signalLine =
    signals.evidence.length > 0
      ? signals.evidence.join(", ")
      : "no strong repo surface signal beyond the preserved harness registry";
  return renderTemplate(
    // The current pair-dev template owns section order and frontmatter shape.
    // Auto-setup only fills it with conservative convergence prose.
    loadTemplateSync(PAIR_SKILL_TEMPLATE).replace("name: {{PAIR_SLUG}}", "name: {{SKILL_SLUG}}"),
    {
      PAIR_SLUG: pair.pair,
      SKILL_SLUG: pair.skill,
      PAIR_TITLE: titleFromSlug(pair.pair),
      DESIGN_THINKING_PARAGRAPH:
        `${titleFromSlug(pair.pair)} preserves the target's registered producer-reviewer responsibility while refreshing the body against the current harness contract. The snapshot evidence below is intent input, not restored runtime law.`,
      METHODOLOGY_BODY:
        `### Preserved Snapshot Intent\n\n${evidence}\n\n` +
        `### Repo Evidence\n\n- Detected surfaces: ${signalLine}.\n\n` +
        "### Convergence Workflow\n\n" +
        "1. Read the orchestrator envelope and the shared `harness-context` law before touching files.\n" +
        "2. Use the preserved snapshot intent to identify the workstream this pair owns.\n" +
        "3. Inspect current project files instead of assuming the snapshot body is still correct.\n" +
        "4. Keep writes inside the envelope `Scope` and report every changed path.\n" +
        "5. Treat split, reorder, or ownership ambiguity as a structural issue for planning.",
      EVAL_CRITERIA_BULLETS:
        "- The producer output satisfies the envelope goal and stays inside the declared scope.\n" +
        "- Snapshot intent is used as evidence, not as a copied contract.\n" +
        "- Current project files and tests are cited when behavior changes.\n" +
        "- The reviewer can verify filesystem effects and regression evidence.\n" +
        "- Structural ambiguity is surfaced instead of hidden in a PASS.",
      TABOO_BULLETS:
        "- Do not restore stale snapshot files by copying them over current templates.\n" +
        "- Do not edit `.harness/cycle/`; only the orchestrator owns runtime state.\n" +
        "- Do not write derived provider trees; use explicit sync after convergence.\n" +
        "- Do not broaden this pair into unrelated repository ownership.",
    },
  );
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
      "6. Report changed files, verification, and remaining work in the Producer Output Format.",
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
    PRINCIPLE_3: "Check contract freshness. Reason: reconstructed pairs must follow current templates and harness-context law.",
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
    die(`pair reconstruction failed for ${pair.pair}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout.trim();
  }
}

async function reconstructPairs(
  target: string,
  snapshotPath: string | null,
  registry: RegistrySummary,
  signals: RepoSignals,
): Promise<PairReconstruction[]> {
  if (!snapshotPath || registry.pairCount === 0) return [];
  const out: PairReconstruction[] = [];
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
      });
      continue;
    }
    const intent = await collectPairIntent(target, snapshotPath, pair);
    const filesWritten: string[] = [];
    const skillDir = join(target, ".harness", "loom", "skills", pair.skill);
    const agentsDir = join(target, ".harness", "loom", "agents");
    await mkdir(skillDir, { recursive: true });
    await mkdir(agentsDir, { recursive: true });

    const skillFile = join(skillDir, "SKILL.md");
    await writeFile(skillFile, renderPairSkill(pair, intent, signals));
    filesWritten.push(rel(target, skillFile));

    const producerFile = join(agentsDir, `${pair.producer}.md`);
    await writeFile(producerFile, renderProducerAgent(pair));
    filesWritten.push(rel(target, producerFile));

    for (const reviewer of pair.reviewers) {
      const reviewerFile = join(agentsDir, `${reviewer}.md`);
      await writeFile(reviewerFile, renderReviewerAgent(pair, reviewer));
      filesWritten.push(rel(target, reviewerFile));
    }

    const registration = runRegisterPair(target, pair);
    out.push({
      pair: pair.pair,
      status: "reconstructed",
      reason: "current pair-dev templates rendered from snapshot evidence",
      producer: pair.producer,
      reviewers: pair.reviewers,
      skill: pair.skill,
      filesWritten,
      registry: registration,
      evidenceLines: intent.evidenceLines,
    });
  }
  return out;
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

function renderFinalizerFromTemplate(template: string, evidenceLines: string[]): string {
  const evidence = evidenceBulletBlock(evidenceLines);
  const task =
    "\n" +
    "This finalizer was reconstructed by `/harness-auto-setup` from snapshot evidence. The preserved intent below is evidence, not restored contract text.\n\n" +
    "### Preserved Intent Evidence\n\n" +
    `${evidence}\n\n` +
    "### Current Contract Task\n\n" +
    "1. Read the envelope and confirm the concrete cycle-end scope.\n" +
    "2. Use preserved intent evidence to decide which cycle-end duty applies.\n" +
    "3. Inspect project files and cycle artifacts named by the envelope.\n" +
    "4. Perform only writes justified by scope, current contracts, and project evidence.\n" +
    "5. Run the smallest relevant verification for the cycle-end duty.\n" +
    "6. Emit the Output Format block with concrete paths, verification, and remaining items.\n\n" +
    "If the preserved intent no longer matches the current goal or project contract, emit the Structural Issue block and return `Status: FAIL`.\n";
  return replaceSection(template, "Task", task);
}

async function reconstructFinalizer(
  target: string,
  snapshotPath: string | null,
  summary: FinalizerSummary,
): Promise<FinalizerReconstruction> {
  const finalizerPath = join(target, ".harness", "loom", "agents", "harness-finalizer.md");
  if (summary.status === "absent") {
    return {
      status: "missing",
      reason: "no prior finalizer existed; installed default skeleton left unchanged",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
    };
  }
  if (summary.status !== "customized") {
    return {
      status: summary.status === "default-noop" ? "default-noop" : "skipped",
      reason: `${summary.status} finalizer does not require reconstruction`,
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
    };
  }
  if (!snapshotPath) {
    return {
      status: "skipped",
      reason: "customized finalizer was detected but no snapshot path is available",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
    };
  }
  const snapshotFinalizer = join(snapshotPath, "loom", "agents", "harness-finalizer.md");
  const body = await readOptional(snapshotFinalizer);
  if (!body) {
    return {
      status: "skipped",
      reason: "customized finalizer evidence was not readable from snapshot",
      path: rel(target, finalizerPath),
      filesWritten: [],
      evidenceLines: [],
    };
  }
  const template = await readFile(FINALIZER_TEMPLATE, "utf8");
  const evidenceLines = finalizerEvidence(body, summary);
  await writeFile(finalizerPath, renderFinalizerFromTemplate(template, evidenceLines));
  return {
    status: "reconstructed",
    reason: "current finalizer skeleton rendered with preserved intent evidence",
    path: rel(target, finalizerPath),
    filesWritten: [rel(target, finalizerPath)],
    evidenceLines,
  };
}

async function createSnapshot(
  target: string,
  createdAt: string,
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
    nextAction: "Foundation refresh will reseed .harness/loom and .harness/cycle; valid registered pairs and customized finalizer intent will be reconstructed after refresh, then explicit sync remains a user handoff.",
    recommendations: {
      mode: "reconstruct-after-refresh",
      pairs: recommendations.pairs,
      finalizer: recommendations.finalizer,
      sync: recommendations.sync,
    },
  };
  const manifestPath = join(snapshotPath, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { created: true, path: snapshotPath, manifestPath, copiedNamespaces };
}

function runInstall(target: string): { status: number | null; stdout: string; stderr: string; summary: unknown } {
  const result = spawnSync(process.execPath, [INSTALL_SCRIPT, target], { encoding: "utf8" });
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
  const mode = loomExists || cycleExists ? "existing" : "fresh";
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
    pairs: pairRecommendations(registrySummary, signals),
    finalizer: finalizerRecommendation(finalizerSummary, signals),
    sync: command,
  };

  const snapshot =
    mode === "existing"
      ? await createSnapshot(args.target, createdAt, activeCycle, registrySummary, finalizerSummary, recommendations)
      : { created: false, path: null, manifestPath: null, copiedNamespaces: [] };

  const warnings: string[] = [];
  if (activeCycle.classification === "active" || activeCycle.classification === "unknown") {
    warnings.push(
      `Existing cycle classified as ${activeCycle.classification}; it was copied to ${snapshot.path} and will be discarded/reseeded by foundation refresh.`,
    );
  }
  for (const warning of warnings) {
    process.stderr.write(`harness-auto-setup: warning - ${warning}\n`);
  }

  const install = runInstall(args.target);
  if (install.stderr) process.stderr.write(install.stderr);
  if (install.status !== 0) {
    const detail = install.stderr.trim() || install.stdout.trim() || "install failed";
    die(`foundation refresh failed: ${detail}`);
  }

  const pairReconstructions = await reconstructPairs(args.target, snapshot.path, registrySummary, signals);
  const finalizerReconstruction = await reconstructFinalizer(args.target, snapshot.path, finalizerSummary);

  const summary = {
    schemaVersion: 1,
    tool: "harness-auto-setup",
    targetPath: args.target,
    createdAt,
    mode,
    snapshot,
    activeCycle,
    registrySummary,
    finalizerSummary,
    repoSignals: signals,
    convergence: {
      mode: "current-contract-reconstruction",
      note:
        "Pair/finalizer files were not blind-copied. Valid registered pairs and customized finalizer intent were regenerated against current templates from snapshot evidence.",
      pairReconstructions,
      finalizerReconstruction,
      pairRecommendations: recommendations.pairs,
      finalizerRecommendation: recommendations.finalizer,
    },
    install: {
      status: install.status,
      summary: install.summary,
    },
    warnings,
    providerTreesWritten: [],
    syncCommand: command,
    nextAction: `From the target root, run \`${command}\` for any platform trees you want to refresh.`,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
