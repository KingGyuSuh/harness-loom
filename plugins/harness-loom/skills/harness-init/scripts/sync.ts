#!/usr/bin/env node
// Purpose: Deploy canonical staging `<target>/.harness/loom/` (agents +
//          skills) into the platform trees `.claude/`, `.codex/`, and/or
//          `.gemini/`. Sync is strictly one-way: loom → platform. It NEVER
//          writes to `.harness/loom/` (the canonical staging is read-only
//          from sync's perspective) and never reads or writes
//          `.harness/cycle/` (the orchestrator owns that namespace).
//
// Usage:
//   node .harness/loom/sync.ts [--provider claude,codex,gemini]
//   node .harness/loom/sync.ts [--claude] [--codex] [--gemini]
//
//   This script is also installed at the canonical plugin path and may be
//   invoked there during development:
//     node skills/harness-init/scripts/sync.ts ...
//   Both call sites resolve the target as `process.cwd()`.
//
//   Deploy is always an explicit opt-in: a bare invocation with no
//   `--provider` / `--claude` / `--codex` / `--gemini` is an error. The
//   script never auto-detects platform trees from disk — a pre-existing
//   `.claude/` may belong to the user, not to a prior harness deploy, and
//   silently overwriting it would clobber unrelated settings.
//
// Wipe-and-overwrite contract:
//   For each selected platform, sync deletes only files/directories under
//   `agents/` and `skills/` whose name (or basename) starts with `harness-`
//   before reseeding from `.harness/loom/`. Non-harness assets the user
//   placed in those directories (`team-reviewer.md`, custom skills) are
//   preserved verbatim.
//
// Platform contract (verified against official specs, last bumped 2026-04-26):
//   - Codex subagents pin `model = "gpt-5.5"`, `model_reasoning_effort = "xhigh"`.
//     gpt-5.5 is OpenAI's newest GA frontier model (introduced 2026-04-23) and
//     the recommended starting point per developers.openai.com/codex/models;
//     xhigh keeps the reasoning ceiling we already rely on for harness pairs.
//     Agent body goes in `developer_instructions = """..."""` — NOT `prompt`.
//     Required skill bodies are loaded through explicit `$skill-name` mentions
//     prepended to developer_instructions; sync does not emit `[[skills.config]]`.
//     Source: developers.openai.com/codex/subagents, developers.openai.com/codex/models
//   - Claude agents pin `model: inherit`. Skills are loaded by directory.
//   - Gemini agents pin `model: gemini-3.1-pro-preview`. As of 2026-04-26 no
//     GA Gemini 3 line exists — every Gemini 3 variant ships as preview, and
//     gemini-cli ≥ v0.31.0 enables 3.1 Pro Preview by default (the predecessor
//     `gemini-3-pro-preview` was shut down 2026-03-26). Frontmatter is
//     `.strict()` and rejects unknown keys (including `skills`). Skills are
//     mirrored globally under `.gemini/skills/`; required skill names are
//     prepended to the agent body so the runtime can activate them explicitly.
//     Source: github.com/google-gemini/gemini-cli (packages/core/src/agents/agentLoader.ts), ai.google.dev/gemini-api/docs/models
//   - Each platform's hook setting wires to `bash .harness/loom/hook.sh
//     <platform>` (Stop for claude/codex, AfterAgent for gemini).
//
// Library API:
//   import { runSync } from "./sync.ts"
//   await runSync({ targetRoot, providers: ["claude"] });

import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  stat,
  copyFile,
  access,
} from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, dirname, relative } from "node:path";
import process from "node:process";

// All supported platform trees are derived deploy targets. `.harness/loom/`
// remains the only canonical staging source.
export type Platform = "claude" | "codex" | "gemini";

interface PlatformPin {
  model: string;
  reasoning?: string;
}

const PIN: Record<Platform, PlatformPin> = {
  claude: { model: "inherit" },
  codex: { model: "gpt-5.5", reasoning: "xhigh" },
  gemini: { model: "gemini-3.1-pro-preview" },
};

interface AgentFile {
  name: string;
  sourcePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

interface SkillDir {
  name: string;
  sourcePath: string;
}

interface ParsedArgs {
  providers: Set<Platform>;
}

function die(message: string, code = 1): never {
  process.stderr.write(`sync: ${message}\n`);
  process.exit(code);
}

function parseProvidersFromArgs(argv: string[]): ParsedArgs {
  const rest = argv.slice(2);
  const providers = new Set<Platform>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node .harness/loom/sync.ts " +
          "--provider <claude,codex,gemini>     (any subset, comma-separated)\n" +
          "   or: node .harness/loom/sync.ts --claude [--codex] [--gemini]\n" +
          "  Sync derives `.claude/`, `.codex/`, `.gemini/` from canonical\n" +
          "  staging `.harness/loom/`. Every platform is an explicit opt-in;\n" +
          "  there is no auto-detection. Sync never writes to `.harness/loom/`\n" +
          "  and never touches `.harness/cycle/`.\n",
      );
      process.exit(0);
    }
    if (arg === "--claude") providers.add("claude");
    else if (arg === "--codex") providers.add("codex");
    else if (arg === "--gemini") providers.add("gemini");
    else if (arg === "--provider") {
      const value = rest[++i];
      if (!value) die("--provider requires a value");
      for (const t of value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        if (t === "claude" || t === "codex" || t === "gemini") providers.add(t);
        else die(`unknown provider: ${t}`);
      }
    } else die(`unknown flag: ${arg}`);
  }
  return { providers };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Read an existing JSON file that sync is about to merge into and overwrite.
// On parse failure (or non-object top level) we refuse to proceed instead of
// silently replacing user-owned settings with `{}`. The caller is expected to
// have already confirmed the file exists.
async function readJsonObjectOrThrow(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `refusing to overwrite malformed ${path}: ${msg}. Fix or remove the file, then re-run sync.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const shape = Array.isArray(parsed) ? "array" : parsed === null ? "null" : typeof parsed;
    throw new Error(
      `refusing to overwrite ${path}: expected top-level JSON object, got ${shape}. Fix or remove the file, then re-run sync.`,
    );
  }
  return parsed as Record<string, unknown>;
}

// ---------------------------------------------------------------- frontmatter

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---\n")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { fm: {}, body: raw };
  const header = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const fm: Record<string, unknown> = {};
  const lines = header.split("\n");
  let currentKey: string | null = null;
  for (const line of lines) {
    if (/^\s+-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s+/, "").trim();
      const arr = (fm[currentKey] as string[]) ?? [];
      arr.push(val);
      fm[currentKey] = arr;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    currentKey = key;
    const val = rawVal.trim();
    if (val === "") fm[key] = [];
    else fm[key] = stripQuotes(val);
  }
  return { fm, body };
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

function renderClaudeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v as string[]) lines.push(`  - ${item}`);
    } else {
      const str = String(v);
      if (str.includes(":") || str.includes('"')) lines.push(`${k}: ${JSON.stringify(str)}`);
      else lines.push(`${k}: ${str}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

function injectModelIntoFrontmatter(fm: Record<string, unknown>, pin: PlatformPin): Record<string, unknown> {
  const out = { ...fm };
  out.model = pin.model;
  return out;
}

function uniqueSkills(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    if (typeof skill !== "string") continue;
    const slug = skill.trim();
    if (slug.length === 0 || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function skillLoadingBlock(skills: string[], platform: "codex" | "gemini"): string {
  if (skills.length === 0) return "";
  const names = skills.join(", ");
  const mentions = skills.map((skill) => `$${skill}`).join(", ");
  const lines = ["## Required Skill Loading", ""];
  if (platform === "codex") {
    lines.push(
      `Before performing this role, explicitly load and follow these skill bodies: ${mentions}.`,
      "Codex exposes skill metadata by default; these mentions are required so the full SKILL.md bodies enter context.",
      "Do not rely on metadata-only skill visibility.",
    );
  } else {
    lines.push(
      `Before performing this role, activate and follow these skill bodies by name: ${names}.`,
      `If the platform accepts $skill-name mentions, the equivalent mentions are: ${mentions}.`,
      "Do not rely on metadata-only skill visibility.",
    );
  }
  return lines.join("\n");
}

function withSkillLoading(body: string, skills: string[], platform: "codex" | "gemini"): string {
  const block = skillLoadingBlock(skills, platform);
  if (!block) return body.trimEnd();
  return `${block}\n\n${body.trimStart().trimEnd()}`;
}

function renderCodexAgentToml(
  fm: Record<string, unknown>,
  body: string,
  pin: PlatformPin,
): string {
  const name = String(fm.name ?? "");
  const description = String(fm.description ?? "");
  const bodyWithSkillLoading = withSkillLoading(body, uniqueSkills(fm.skills), "codex");
  const tomlLines: string[] = [];
  tomlLines.push(`name = ${JSON.stringify(name)}`);
  tomlLines.push(`description = ${JSON.stringify(description)}`);
  tomlLines.push(`model = ${JSON.stringify(pin.model)}`);
  // Codex spec key is `model_reasoning_effort` (not `reasoning_effort`).
  if (pin.reasoning) tomlLines.push(`model_reasoning_effort = ${JSON.stringify(pin.reasoning)}`);
  // Codex spec puts the agent prompt in `developer_instructions`, not `prompt`.
  tomlLines.push('developer_instructions = """');
  tomlLines.push(bodyWithSkillLoading);
  tomlLines.push('"""');
  tomlLines.push("");
  return tomlLines.join("\n");
}

// ---------------------------------------------------------------- sources

async function loadCanonicalAgents(targetRoot: string): Promise<AgentFile[]> {
  const dir = join(targetRoot, ".harness", "loom", "agents");
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  const agents: AgentFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const sourcePath = join(dir, entry);
    const raw = await readFile(sourcePath, "utf8");
    const { fm, body } = parseFrontmatter(raw);
    agents.push({
      name: entry.replace(/\.md$/, ""),
      sourcePath,
      frontmatter: fm,
      body,
    });
  }
  return agents;
}

async function loadCanonicalSkills(targetRoot: string): Promise<SkillDir[]> {
  const dir = join(targetRoot, ".harness", "loom", "skills");
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  const skills: SkillDir[] = [];
  for (const entry of entries) {
    const p = join(dir, entry);
    const st = await stat(p);
    if (st.isDirectory()) skills.push({ name: entry, sourcePath: p });
  }
  return skills;
}

// ---------------------------------------------------------------- copy helpers

async function copyTree(src: string, dst: string, copied: string[]): Promise<void> {
  const st = await stat(src);
  if (st.isDirectory()) {
    await mkdir(dst, { recursive: true });
    const entries = await readdir(src);
    for (const e of entries) {
      await copyTree(join(src, e), join(dst, e), copied);
    }
  } else if (st.isFile()) {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
    copied.push(dst);
  }
}

// Wipe-and-overwrite step: delete only entries under `dir` whose basename
// starts with `harness-`. Non-harness user assets are left in place. Tracks
// every removed path on `deleted` for the run summary.
async function wipeHarnessEntries(
  dir: string,
  extensionFilter: string | null,
  deleted: string[],
): Promise<void> {
  if (!(await exists(dir))) return;
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isFile()) {
      if (extensionFilter && !entry.endsWith(extensionFilter)) continue;
      const base = extensionFilter ? entry.slice(0, -extensionFilter.length) : entry;
      if (!base.startsWith("harness-")) continue;
      await rm(full, { force: true });
      deleted.push(full);
    } else if (st.isDirectory()) {
      if (!entry.startsWith("harness-")) continue;
      await rm(full, { recursive: true, force: true });
      deleted.push(full);
    }
  }
}

// ---------------------------------------------------------------- hook configs

// All three platforms wire their re-entry hook to `.harness/loom/hook.sh`
// (the self-contained copy seeded by install.ts). The platform name is passed
// as $1 so hook.sh chooses the right slash/skill syntax.

async function writeClaudeSettings(targetRoot: string): Promise<string> {
  const settingsPath = join(targetRoot, ".claude", "settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (await exists(settingsPath)) {
    existing = await readJsonObjectOrThrow(settingsPath);
  }
  const hooks = (existing.hooks as Record<string, unknown>) ?? {};
  hooks.Stop = [
    {
      hooks: [{ type: "command", command: "bash .harness/loom/hook.sh claude" }],
    },
  ];
  existing.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(existing, null, 2) + "\n");
  return settingsPath;
}

// Codex hook config shape (verified against codex-rs/hooks/src/engine/config.rs):
//   { hooks: { Stop: [ { hooks: [ { type: "command", command, timeout } ] } ] } }
// The shorthand { Stop: [ { command } ] } is a hard parse error under serde.
// `codex_hooks = true` feature flag in .codex/config.toml is required for the
// engine to load hooks.json at all (developers.openai.com/codex/hooks).
async function writeCodexHookConfig(targetRoot: string): Promise<string> {
  const hooksPath = join(targetRoot, ".codex", "hooks.json");
  await mkdir(dirname(hooksPath), { recursive: true });
  let payload: Record<string, unknown> = {};
  if (await exists(hooksPath)) {
    payload = await readJsonObjectOrThrow(hooksPath);
  }
  const hooks = (payload.hooks as Record<string, unknown>) ?? {};
  hooks.Stop = [
    {
      hooks: [
        { type: "command", command: "bash .harness/loom/hook.sh codex", timeout: 30 },
      ],
    },
  ];
  payload.hooks = hooks;
  await writeFile(hooksPath, JSON.stringify(payload, null, 2) + "\n");
  return hooksPath;
}

async function writeCodexConfigToml(targetRoot: string): Promise<string> {
  const configPath = join(targetRoot, ".codex", "config.toml");
  await mkdir(dirname(configPath), { recursive: true });
  let content = "";
  if (await exists(configPath)) content = await readFile(configPath, "utf8");
  const flagRegex = /(^|\n)[ \t]*codex_hooks[ \t]*=[ \t]*(true|false)/;
  if (flagRegex.test(content)) {
    content = content.replace(flagRegex, "$1codex_hooks = true");
  } else if (/(^|\n)\[features\][^\S\n]*\n/.test(content)) {
    content = content.replace(
      /(^|\n)\[features\]([^\n]*)\n/,
      `$1[features]$2\ncodex_hooks = true\n`,
    );
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += (content.length > 0 ? "\n" : "") + "[features]\ncodex_hooks = true\n";
  }
  await writeFile(configPath, content);
  return configPath;
}

async function writeGeminiHookConfig(targetRoot: string): Promise<string> {
  const settingsPath = join(targetRoot, ".gemini", "settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (await exists(settingsPath)) {
    existing = await readJsonObjectOrThrow(settingsPath);
  }
  const hooks = (existing.hooks as Record<string, unknown>) ?? {};
  // Gemini hook schema (docs/hooks/reference.md): 2-layer nested
  //   { hooks: { AfterAgent: [ { hooks: [ { type, command, timeout } ] } ] } }
  // The flat shorthand { AfterAgent: [{ command }] } is rejected by the loader.
  hooks.AfterAgent = [
    {
      hooks: [
        { type: "command", command: "bash .harness/loom/hook.sh gemini", timeout: 60000 },
      ],
    },
  ];
  existing.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(existing, null, 2) + "\n");
  return settingsPath;
}

// ---------------------------------------------------------------- deploy

async function deployClaude(targetRoot: string, agents: AgentFile[], skills: SkillDir[]) {
  const root = join(targetRoot, ".claude");
  const agentsDir = join(root, "agents");
  const skillsDir = join(root, "skills");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  const copied: string[] = [];
  const deleted: string[] = [];
  // Wipe `harness-*` only — user-owned non-harness agents/skills survive.
  await wipeHarnessEntries(agentsDir, ".md", deleted);
  await wipeHarnessEntries(skillsDir, null, deleted);
  for (const a of agents) {
    const fm = injectModelIntoFrontmatter(a.frontmatter, PIN.claude);
    const out = renderClaudeFrontmatter(fm) + a.body;
    const dst = join(agentsDir, `${a.name}.md`);
    await writeFile(dst, out);
    copied.push(dst);
  }
  for (const s of skills) {
    await copyTree(s.sourcePath, join(skillsDir, s.name), copied);
  }
  copied.push(await writeClaudeSettings(targetRoot));
  return { copied, deleted };
}

async function deployCodex(targetRoot: string, agents: AgentFile[], skills: SkillDir[]) {
  const root = join(targetRoot, ".codex");
  const agentsDir = join(root, "agents");
  const skillsDir = join(root, "skills");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  const copied: string[] = [];
  const deleted: string[] = [];
  await wipeHarnessEntries(agentsDir, ".toml", deleted);
  await wipeHarnessEntries(skillsDir, null, deleted);
  for (const a of agents) {
    const toml = renderCodexAgentToml(a.frontmatter, a.body, PIN.codex);
    const dst = join(agentsDir, `${a.name}.toml`);
    await writeFile(dst, toml);
    copied.push(dst);
  }
  // Codex does NOT duplicate skills under .codex/agents/**; the CLI reads
  // skill trees from the platform root. Mirror them once under .codex/skills/
  // so platform surface matches canonical skill paths for citation.
  for (const s of skills) {
    await copyTree(s.sourcePath, join(skillsDir, s.name), copied);
  }
  copied.push(await writeCodexHookConfig(targetRoot));
  copied.push(await writeCodexConfigToml(targetRoot));
  return { copied, deleted };
}

async function deployGemini(targetRoot: string, agents: AgentFile[], skills: SkillDir[]) {
  const root = join(targetRoot, ".gemini");
  const agentsDir = join(root, "agents");
  const skillsDir = join(root, "skills");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  const copied: string[] = [];
  const deleted: string[] = [];
  await wipeHarnessEntries(agentsDir, ".md", deleted);
  await wipeHarnessEntries(skillsDir, null, deleted);
  for (const a of agents) {
    const fm = injectModelIntoFrontmatter(a.frontmatter, PIN.gemini);
    // Gemini's localAgentSchema is .strict() and rejects unknown keys like
    // `skills` (which is a Claude-canonical field). Mirror skills globally
    // under `.gemini/skills/`, then inject the required skill names into the
    // body so the agent can explicitly activate them.
    const bodyWithSkillLoading = withSkillLoading(a.body, uniqueSkills(fm.skills), "gemini");
    delete fm.skills;
    const out = renderClaudeFrontmatter(fm) + bodyWithSkillLoading + "\n";
    const dst = join(agentsDir, `${a.name}.md`);
    await writeFile(dst, out);
    copied.push(dst);
  }
  // Gemini does NOT duplicate skills under .gemini/agents/**; mirror once
  // under .gemini/skills/.
  for (const s of skills) {
    await copyTree(s.sourcePath, join(skillsDir, s.name), copied);
  }
  copied.push(await writeGeminiHookConfig(targetRoot));
  return { copied, deleted };
}

// ---------------------------------------------------------------- library entry

export interface SyncReport {
  [provider: string]: { copied: string[]; deleted: string[] };
}

export async function runSync(opts: {
  targetRoot: string;
  providers: Platform[];
}): Promise<SyncReport> {
  if (opts.providers.length === 0) {
    return {};
  }
  const agents = await loadCanonicalAgents(opts.targetRoot);
  if (agents.length === 0) {
    throw new Error(
      `no canonical agents found in ${join(opts.targetRoot, ".harness", "loom", "agents")}`,
    );
  }
  const skills = await loadCanonicalSkills(opts.targetRoot);
  const summary: SyncReport = {};
  for (const t of opts.providers) {
    if (t === "claude") summary.claude = await deployClaude(opts.targetRoot, agents, skills);
    else if (t === "codex") summary.codex = await deployCodex(opts.targetRoot, agents, skills);
    else if (t === "gemini") summary.gemini = await deployGemini(opts.targetRoot, agents, skills);
  }
  return summary;
}

// ---------------------------------------------------------------- CLI entry

async function main() {
  const { providers } = parseProvidersFromArgs(process.argv);
  const targetRoot = process.cwd();

  if (providers.size === 0) {
    die(
      "no providers selected. Pass `--provider claude,codex,gemini` (any subset) or the individual flags `--claude` / `--codex` / `--gemini`.\n" +
        "Deploy is always an explicit opt-in — sync does not auto-detect platform trees, because a directory like `.claude/` may predate the harness and overwriting it silently would clobber user settings.",
    );
  }
  const selected: Platform[] = [...providers];

  let summary: SyncReport;
  try {
    summary = await runSync({ targetRoot, providers: selected });
  } catch (err) {
    die(err instanceof Error ? err.message : String(err));
  }

  const rel = (paths: string[]) => paths.map((p) => relative(targetRoot, p));
  const report = Object.fromEntries(
    Object.entries(summary).map(([k, v]) => [
      k,
      { copied: rel(v.copied), deleted: rel(v.deleted) },
    ]),
  );
  const out = { providers: selected, ...report };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

// Only run CLI when invoked as main module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    die(msg);
  });
}
