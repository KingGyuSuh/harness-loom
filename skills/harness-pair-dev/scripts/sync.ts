#!/usr/bin/env node
// Purpose: Deploy canonical `.claude/` source (agents + skills) into the
//          derived platform directories `.codex/` and `.gemini/`. Sync is
//          strictly one-way: canonical → derived. It never writes to
//          `.claude/` (canonical is read-only from sync's perspective);
//          re-normalize claude with `/harness-init --force` instead.
//
// Usage:
//   node skills/harness-pair-dev/scripts/sync.ts [--provider codex,gemini]
//   node skills/harness-pair-dev/scripts/sync.ts [--codex] [--gemini]
//
//   When `--provider` is omitted the script auto-detects derived providers
//   already on disk (`.codex/` / `.gemini/`). First-time codex/gemini setup
//   requires explicit `--provider codex,gemini` so the user opts in. Passing
//   `--provider claude` (or `--claude`) is a hard error — sync does not
//   touch canonical.
//
// Platform contract (verified against official specs):
//   - Codex subagents pin `model = "gpt-5.4"`, `model_reasoning_effort = "xhigh"`.
//     Agent body goes in `developer_instructions = """..."""` — NOT `prompt`.
//     Skills are referenced via repeated `[[skills.config]]` tables.
//     Source: developers.openai.com/codex/subagents
//   - Claude agents pin `model: inherit`.
//   - Gemini agents pin `model: gemini-3.1-pro-preview`. Frontmatter is
//     `.strict()` and rejects unknown keys (including `skills`). Skills are
//     auto-loaded globally from `.gemini/skills/` and surfaced to every agent
//     via progressive disclosure — no per-agent reference needed.
//     Source: github.com/google-gemini/gemini-cli (packages/core/src/agents/agentLoader.ts)
//   - Codex + Gemini do NOT duplicate skills under `.{platform}/agents/*/`;
//     skills deploy once to `.{platform}/skills/`.
//   - Codex deploy writes `.codex/hooks.json` (Stop event); Gemini deploy
//     writes `.gemini/settings.json` (AfterAgent event). Both wire to
//     `.harness/hook.sh`. Claude hook wiring is install.ts territory and
//     sync never touches `.claude/settings.json`.
//
// Library API:
//   import { runSync, detectDeployedProviders } from "./sync.ts"
//   await runSync({ targetRoot, providers });
//
// Idempotency: All writes rewrite whole files. Stale `.claude/agents/*.md`,
// `.codex/agents/*.toml`, `.gemini/agents/*.md` that do not map back to a
// canonical agent are deleted.

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

export type Platform = "claude" | "codex" | "gemini";

interface PlatformPin {
  model: string;
  reasoning?: string;
}

const PIN: Record<Platform, PlatformPin> = {
  claude: { model: "inherit" },
  codex: { model: "gpt-5.4", reasoning: "xhigh" },
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

// Only derived providers (codex, gemini) are valid sync targets. Claude is
// canonical and read-only from sync's perspective.
type DerivedPlatform = Exclude<Platform, "claude">;

interface ParsedArgs {
  providers: Set<DerivedPlatform>;
}

function die(message: string, code = 1): never {
  process.stderr.write(`sync: ${message}\n`);
  process.exit(code);
}

function parseProvidersFromArgs(argv: string[]): ParsedArgs {
  const rest = argv.slice(2);
  const providers = new Set<DerivedPlatform>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-pair-dev/scripts/sync.ts " +
          "[--provider codex,gemini] [--codex] [--gemini]\n" +
          "  Sync derives `.codex/` and `.gemini/` from canonical `.claude/`.\n" +
          "  Sync never writes to `.claude/` (use `/harness-init --force` for that).\n",
      );
      process.exit(0);
    }
    if (arg === "--claude") die("claude is canonical; sync never writes to .claude/. Use /harness-init or edit .claude/ directly.");
    else if (arg === "--codex") providers.add("codex");
    else if (arg === "--gemini") providers.add("gemini");
    else if (arg === "--provider") {
      const value = rest[++i];
      if (!value) die("--provider requires a value");
      for (const t of value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        if (t === "claude") die("claude is canonical; sync never writes to .claude/. Pass codex/gemini only.");
        if (t === "codex" || t === "gemini") providers.add(t);
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

// `.claude/` is canonical and read-only from sync's perspective — sync never
// writes to it. Detection therefore returns ONLY derived providers (codex,
// gemini) that already exist on disk. First-time codex/gemini setup must come
// from explicit `--provider`.
export async function detectDeployedProviders(targetRoot: string): Promise<Platform[]> {
  const present: Platform[] = [];
  if (await exists(join(targetRoot, ".codex"))) present.push("codex");
  if (await exists(join(targetRoot, ".gemini"))) present.push("gemini");
  return present;
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

function renderCodexAgentToml(fm: Record<string, unknown>, body: string, pin: PlatformPin): string {
  const name = String(fm.name ?? "");
  const description = String(fm.description ?? "");
  const skills = Array.isArray(fm.skills) ? (fm.skills as string[]) : [];
  const tomlLines: string[] = [];
  tomlLines.push(`name = ${JSON.stringify(name)}`);
  tomlLines.push(`description = ${JSON.stringify(description)}`);
  tomlLines.push(`model = ${JSON.stringify(pin.model)}`);
  // Codex spec key is `model_reasoning_effort` (not `reasoning_effort`).
  if (pin.reasoning) tomlLines.push(`model_reasoning_effort = ${JSON.stringify(pin.reasoning)}`);
  // Codex spec puts the agent prompt in `developer_instructions`, not `prompt`.
  tomlLines.push('developer_instructions = """');
  tomlLines.push(body.trimEnd());
  tomlLines.push('"""');
  tomlLines.push("");
  // Codex loads skills via repeated `[[skills.config]]` tables, one per
  // skill — not a single `skills = [...]` array. Each entry points at the
  // mirrored skill body under `.codex/skills/<slug>/SKILL.md`.
  for (const skill of skills) {
    tomlLines.push("[[skills.config]]");
    tomlLines.push(`path = ${JSON.stringify(`.codex/skills/${skill}/SKILL.md`)}`);
    tomlLines.push("enabled = true");
    tomlLines.push("");
  }
  return tomlLines.join("\n");
}

// ---------------------------------------------------------------- sources

async function loadCanonicalAgents(targetRoot: string): Promise<AgentFile[]> {
  const dir = join(targetRoot, ".claude", "agents");
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
  const dir = join(targetRoot, ".claude", "skills");
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

async function cleanStaleAgents(
  platformAgentsDir: string,
  canonicalNames: Set<string>,
  extension: string,
  deleted: string[],
): Promise<void> {
  if (!(await exists(platformAgentsDir))) return;
  const entries = await readdir(platformAgentsDir);
  for (const entry of entries) {
    const full = join(platformAgentsDir, entry);
    const st = await stat(full);
    if (!st.isFile()) continue;
    if (!entry.endsWith(extension)) continue;
    const base = entry.replace(new RegExp(`${extension}$`), "");
    if (!canonicalNames.has(base)) {
      await rm(full, { force: true });
      deleted.push(full);
    }
  }
}

// ---------------------------------------------------------------- hook configs

// sync.ts owns codex/gemini hook wiring as part of deploy. Claude is wired by
// install.ts; sync never touches `.claude/settings.json` (user property).
async function writeCodexHookConfig(targetRoot: string): Promise<string> {
  const hooksPath = join(targetRoot, ".codex", "hooks.json");
  await mkdir(dirname(hooksPath), { recursive: true });
  let payload: Record<string, unknown> = {};
  if (await exists(hooksPath)) {
    try {
      payload = JSON.parse(await readFile(hooksPath, "utf8")) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }
  payload.Stop = [{ command: "bash .harness/hook.sh" }];
  await writeFile(hooksPath, JSON.stringify(payload, null, 2) + "\n");
  return hooksPath;
}

async function writeGeminiHookConfig(targetRoot: string): Promise<string> {
  const settingsPath = join(targetRoot, ".gemini", "settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (await exists(settingsPath)) {
    try {
      existing = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const hooks = (existing.hooks as Record<string, unknown>) ?? {};
  hooks.AfterAgent = [{ command: "bash .harness/hook.sh" }];
  existing.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(existing, null, 2) + "\n");
  return settingsPath;
}

// ---------------------------------------------------------------- deploy

async function deployCodex(targetRoot: string, agents: AgentFile[], skills: SkillDir[]) {
  const root = join(targetRoot, ".codex");
  const agentsDir = join(root, "agents");
  const skillsDir = join(root, "skills");
  await mkdir(agentsDir, { recursive: true });
  const copied: string[] = [];
  const deleted: string[] = [];
  for (const a of agents) {
    const toml = renderCodexAgentToml(a.frontmatter, a.body, PIN.codex);
    const dst = join(agentsDir, `${a.name}.toml`);
    await writeFile(dst, toml);
    copied.push(dst);
  }
  const canonical = new Set(agents.map((a) => a.name));
  await cleanStaleAgents(agentsDir, canonical, ".toml", deleted);
  // Codex does NOT duplicate skills under .codex/agents/**; the CLI reads
  // skill trees from the platform root. Mirror them once under .codex/skills/
  // so platform surface matches canonical skill paths for citation.
  if (skills.length > 0) {
    if (await exists(skillsDir)) await rm(skillsDir, { recursive: true, force: true });
    for (const s of skills) {
      await copyTree(s.sourcePath, join(skillsDir, s.name), copied);
    }
  }
  copied.push(await writeCodexHookConfig(targetRoot));
  return { copied, deleted };
}

async function deployGemini(targetRoot: string, agents: AgentFile[], skills: SkillDir[]) {
  const root = join(targetRoot, ".gemini");
  const agentsDir = join(root, "agents");
  const skillsDir = join(root, "skills");
  await mkdir(agentsDir, { recursive: true });
  const copied: string[] = [];
  const deleted: string[] = [];
  for (const a of agents) {
    const fm = injectModelIntoFrontmatter(a.frontmatter, PIN.gemini);
    // Gemini's localAgentSchema is .strict() and rejects unknown keys like
    // `skills` (which is a Claude-canonical field). Skills load globally from
    // `.gemini/skills/` and surface to every agent via progressive disclosure
    // — there is no per-agent `skills` reference in Gemini frontmatter.
    delete fm.skills;
    const out = renderClaudeFrontmatter(fm) + a.body;
    const dst = join(agentsDir, `${a.name}.md`);
    await writeFile(dst, out);
    copied.push(dst);
  }
  const canonical = new Set(agents.map((a) => a.name));
  await cleanStaleAgents(agentsDir, canonical, ".md", deleted);
  // Gemini does NOT duplicate skills under .gemini/agents/**; mirror once
  // under .gemini/skills/.
  if (await exists(skillsDir)) await rm(skillsDir, { recursive: true, force: true });
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
  providers: DerivedPlatform[];
}): Promise<SyncReport> {
  if (opts.providers.length === 0) {
    return {};
  }
  const agents = await loadCanonicalAgents(opts.targetRoot);
  if (agents.length === 0) {
    throw new Error(
      `no canonical agents found in ${join(opts.targetRoot, ".claude", "agents")}`,
    );
  }
  const skills = await loadCanonicalSkills(opts.targetRoot);
  const summary: SyncReport = {};
  for (const t of opts.providers) {
    if (t === "codex") summary.codex = await deployCodex(opts.targetRoot, agents, skills);
    else if (t === "gemini") summary.gemini = await deployGemini(opts.targetRoot, agents, skills);
  }
  return summary;
}

// ---------------------------------------------------------------- CLI entry

async function main() {
  const { providers } = parseProvidersFromArgs(process.argv);
  const targetRoot = process.cwd();
  const selected: DerivedPlatform[] = providers.size > 0
    ? [...providers]
    : await detectDeployedProviders(targetRoot);

  if (selected.length === 0) {
    process.stdout.write(
      JSON.stringify(
        {
          providers: [],
          note: "No derived providers detected (.codex/, .gemini/). Pass `--provider codex,gemini` to opt in.",
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

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
