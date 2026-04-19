#!/usr/bin/env node
// Purpose: Install the harness runtime into a target project directory.
//          Creates `<target>/.harness/` (state.md, events.md, hook.sh, epics/)
//          and scaffolds the canonical `.claude/` tree (skills + planner agent
//          + Stop hook wiring) — and only that. Non-claude providers
//          (.codex/, .gemini/) are deployed by `/harness-sync` on explicit
//          user request, never by install.
//
// Usage:   node skills/harness-init/scripts/install.ts [<target-project-path>] [--force]
//          Target defaults to process.cwd() when omitted.
//
// Related: skills/harness-init/scripts/hook.sh    — copied into <target>/.harness/hook.sh
//          skills/harness-init/scripts/init.ts    — cycle reset once a Goal arrives
//          skills/harness-pair-dev/scripts/sync.ts — `/harness-sync` and pair-dev
//                                                   call this to deploy non-claude
//                                                   providers from canonical.
//
// Design notes:
//   - `.claude/` is canonical. install does NOT touch `.codex/` or `.gemini/`.
//     Multi-platform users opt in with `/harness-sync --provider codex,gemini`
//     after install. Claude-only users do nothing extra.
//   - state.md / events.md bodies come from
//     `skills/harness-init/references/runtime/{state,events}.template.md`
//     with `{{PLACEHOLDER}}` substitution.
//   - Re-invoking orchestrator on Stop is implemented via the
//     `{"decision":"block","reason":"<slash-command>"}` contract emitted by hook.sh.

import { mkdir, writeFile, readFile, copyFile, access, chmod, rm, stat, readdir } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HOOK_SOURCE = join(SCRIPT_DIR, "hook.sh");
// Runtime templates live under harness-init references/, but their filenames
// end with `.template.md` so recursive skill scanners do not register them as
// standalone factory skills while still keeping the deployment source close to
// the installer that owns it.
const TEMPLATES_DIR = resolve(SCRIPT_DIR, "..", "references", "runtime");
const STATE_TEMPLATE = join(TEMPLATES_DIR, "state.template.md");
const EVENTS_TEMPLATE = join(TEMPLATES_DIR, "events.template.md");
const ORCHESTRATE_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-orchestrate");
const PLANNING_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-planning");
const CONTEXT_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-context");
const PLANNER_AGENT_TEMPLATE = join(TEMPLATES_DIR, "harness-planner.template.md");

// Only the canonical `.claude` pin lives here. sync.ts owns the codex/gemini
// pins and applies them when deriving from canonical.
const CLAUDE_MODEL_PIN = "inherit";

interface Args {
  target: string;
  force: boolean;
}

function die(message: string, code = 1): never {
  process.stderr.write(`install: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let force = false;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--force") force = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-init/scripts/install.ts [<target-project-path>] [--force]\n" +
          "  Target defaults to process.cwd() when omitted.\n" +
          "  Multi-platform deploy is opt-in via `/harness-sync --provider codex,gemini`.\n",
      );
      process.exit(0);
    } else if (arg.startsWith("--")) die(`unknown flag: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length > 1) die("at most one <target-project-path> accepted");
  const targetArg = positional[0] ?? process.cwd();
  const target = isAbsolute(targetArg) ? targetArg : resolve(process.cwd(), targetArg);
  return { target, force };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- templates

function applyPlaceholders(raw: string, vars: Record<string, string>): string {
  let out = raw;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

async function loadTemplate(path: string): Promise<string> {
  if (!(await exists(path))) die(`missing template: ${path}`);
  return readFile(path, "utf8");
}

async function initialStateMd(): Promise<string> {
  const raw = await loadTemplate(STATE_TEMPLATE);
  return applyPlaceholders(raw, {
    GOAL_SOURCE: "<none yet>",
    GOAL_BODY: "(empty — awaiting /harness-orchestrate <file.md> invocation)",
    TIMESTAMP: new Date().toISOString(),
  });
}

async function initialEventsMd(): Promise<string> {
  const raw = await loadTemplate(EVENTS_TEMPLATE);
  return applyPlaceholders(raw, {
    TIMESTAMP: new Date().toISOString(),
    GOAL_SOURCE: "<none yet>",
    GOAL_BODY: "",
  });
}

// ---------------------------------------------------------------- fs helpers

function renderTemplateFilename(name: string): string {
  return name.endsWith(".template.md") ? name.replace(".template.md", ".md") : name;
}

async function copyTree(src: string, dst: string, copied: string[]): Promise<void> {
  const st = await stat(src);
  if (st.isDirectory()) {
    await mkdir(dst, { recursive: true });
    const entries = await readdir(src);
    for (const e of entries) {
      await copyTree(join(src, e), join(dst, renderTemplateFilename(e)), copied);
    }
  } else if (st.isFile()) {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
    copied.push(dst);
  }
}

// ---------------------------------------------------------------- frontmatter / TOML

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

function renderMarkdownFrontmatter(fm: Record<string, unknown>): string {
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

// Codex/Gemini hook wiring + agent rendering live in sync.ts
// (`skills/harness-pair-dev/scripts/sync.ts`). install.ts only writes the
// canonical `.claude/` Stop hook; multi-platform setup is opt-in via
// `/harness-sync`.

// ---------------------------------------------------------------- claude hook wiring

async function writeClaudeSettings(target: string, force: boolean): Promise<string> {
  const settingsPath = join(target, ".claude", "settings.json");
  await mkdir(dirname(settingsPath), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (await exists(settingsPath)) {
    try {
      existing = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      if (!force) die(`${settingsPath} exists but is not valid JSON (use --force to overwrite)`);
      existing = {};
    }
  }
  const hooks = (existing.hooks as Record<string, unknown>) ?? {};
  hooks.Stop = [
    {
      hooks: [{ type: "command", command: "bash .harness/hook.sh claude" }],
    },
  ];
  existing.hooks = hooks;
  await writeFile(settingsPath, JSON.stringify(existing, null, 2) + "\n");
  return settingsPath;
}

// ---------------------------------------------------------------- skill/agent scaffold

async function scaffoldClaudeFoundation(target: string, copied: string[]): Promise<void> {
  const skillsRoot = join(target, ".claude", "skills");
  const agentsRoot = join(target, ".claude", "agents");
  await mkdir(skillsRoot, { recursive: true });
  await mkdir(agentsRoot, { recursive: true });
  if (await exists(ORCHESTRATE_SKILL_TEMPLATE)) {
    await copyTree(ORCHESTRATE_SKILL_TEMPLATE, join(skillsRoot, "harness-orchestrate"), copied);
  }
  if (await exists(PLANNING_SKILL_TEMPLATE)) {
    await copyTree(PLANNING_SKILL_TEMPLATE, join(skillsRoot, "harness-planning"), copied);
  }
  if (await exists(CONTEXT_SKILL_TEMPLATE)) {
    await copyTree(CONTEXT_SKILL_TEMPLATE, join(skillsRoot, "harness-context"), copied);
  }
  if (await exists(PLANNER_AGENT_TEMPLATE)) {
    const raw = await readFile(PLANNER_AGENT_TEMPLATE, "utf8");
    const { fm, body } = parseFrontmatter(raw);
    fm.model = CLAUDE_MODEL_PIN;
    const out = renderMarkdownFrontmatter(fm) + body;
    const dst = join(agentsRoot, "harness-planner.md");
    await writeFile(dst, out);
    copied.push(dst);
  }
}

// install.ts is canonical-only — it scaffolds `.claude/` and stops.
// Multi-platform deploy is owned by `/harness-sync` (sync.ts).

async function scaffoldFoundation(target: string): Promise<string[]> {
  const copied: string[] = [];
  await scaffoldClaudeFoundation(target, copied);
  return copied;
}

// ---------------------------------------------------------------- main

async function main() {
  const { target, force } = parseArgs(process.argv);

  if (!(await exists(target))) die(`target does not exist: ${target}`);
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) die(`target is not a directory: ${target}`);

  const harnessDir = join(target, ".harness");
  if (await exists(harnessDir)) {
    if (!force) {
      die(
        `${harnessDir} already exists. Re-run with --force to overwrite, ` +
          `or use skills/harness-init/scripts/init.ts for in-place cycle reset.`,
      );
    }
    await rm(harnessDir, { recursive: true, force: true });
  }

  await mkdir(join(harnessDir, "epics"), { recursive: true });

  const stateMdPath = join(harnessDir, "state.md");
  const eventsMdPath = join(harnessDir, "events.md");
  await writeFile(stateMdPath, await initialStateMd());
  await writeFile(eventsMdPath, await initialEventsMd());

  const hookDest = join(harnessDir, "hook.sh");
  if (!(await exists(HOOK_SOURCE))) die(`missing source hook script: ${HOOK_SOURCE}`);
  await copyFile(HOOK_SOURCE, hookDest);
  await chmod(hookDest, 0o755);

  const claudeSettingsPath = await writeClaudeSettings(target, force);
  const scaffolded = await scaffoldFoundation(target);

  const verification = await verifyInstall(target, {
    stateMd: stateMdPath,
    eventsMd: eventsMdPath,
    hook: hookDest,
    scaffolded,
  });

  const summary = {
    target,
    harnessDir,
    stateMd: stateMdPath,
    eventsMd: eventsMdPath,
    hook: hookDest,
    claudeSettings: claudeSettingsPath,
    scaffolded,
    verification,
    nextStep:
      "Run `/harness-sync --provider codex,gemini` if you need Codex or Gemini deploys; " +
      "otherwise start authoring pairs with `/harness-pair-dev --add ...`.",
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (!verification.ok) {
    die(`install verification failed — see summary.verification.failures`);
  }
}

// Deterministic post-install validation. Replaces the human `ls` check in
// the skill body so every install run returns a machine-checked integrity
// report in its JSON output.
async function verifyInstall(
  target: string,
  ctx: { stateMd: string; eventsMd: string; hook: string; scaffolded: string[] },
): Promise<{ ok: boolean; checks: Record<string, boolean>; failures: string[]; placeholderResidue: string[] }> {
  const checks: Record<string, boolean> = {};
  const failures: string[] = [];

  const expect = async (label: string, path: string, mode?: "dir" | "file") => {
    const present = await exists(path);
    let ok = present;
    if (ok && mode) {
      try {
        const st = await stat(path);
        ok = mode === "dir" ? st.isDirectory() : st.isFile();
      } catch {
        ok = false;
      }
    }
    checks[label] = ok;
    if (!ok) failures.push(`${label} missing or wrong type: ${path}`);
  };

  // Core `.harness/` runtime files.
  await expect(".harness/state.md", ctx.stateMd, "file");
  await expect(".harness/events.md", ctx.eventsMd, "file");
  await expect(".harness/hook.sh", ctx.hook, "file");
  await expect(".harness/epics/", join(target, ".harness", "epics"), "dir");

  // hook executable bit.
  try {
    const st = await stat(ctx.hook);
    const exec = (st.mode & 0o111) !== 0;
    checks["hook.sh executable"] = exec;
    if (!exec) failures.push(`hook.sh not executable: ${ctx.hook}`);
  } catch {
    checks["hook.sh executable"] = false;
  }

  // Canonical `.claude/` scaffold check (only platform install touches).
  const claudeRoot = join(target, ".claude");
  await expect("claude/skills/harness-orchestrate/SKILL.md", join(claudeRoot, "skills", "harness-orchestrate", "SKILL.md"), "file");
  await expect("claude/skills/harness-planning/SKILL.md", join(claudeRoot, "skills", "harness-planning", "SKILL.md"), "file");
  await expect("claude/skills/harness-context/SKILL.md", join(claudeRoot, "skills", "harness-context", "SKILL.md"), "file");
  await expect("claude/agents/harness-planner.md", join(claudeRoot, "agents", "harness-planner.md"), "file");
  await expect("claude/settings.json", join(claudeRoot, "settings.json"), "file");

  // Placeholder residue: every scaffolded file must have its `{{FOO}}` markers
  // substituted. Residue signals a template-loading bug.
  const placeholderResidue: string[] = [];
  const placeholderRe = /\{\{[A-Z_]+\}\}/;
  for (const path of ctx.scaffolded) {
    try {
      const body = await readFile(path, "utf8");
      if (placeholderRe.test(body)) placeholderResidue.push(path);
    } catch {
      placeholderResidue.push(path);
    }
  }
  if (placeholderResidue.length > 0) {
    failures.push(`placeholder residue in ${placeholderResidue.length} file(s)`);
  }
  checks["no placeholder residue"] = placeholderResidue.length === 0;

  return { ok: failures.length === 0, checks, failures, placeholderResidue };
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
