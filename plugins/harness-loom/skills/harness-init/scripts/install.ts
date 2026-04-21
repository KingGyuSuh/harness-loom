#!/usr/bin/env node
// Purpose: Install the harness into a target project as two parallel
//          sub-namespaces under `<target>/.harness/`:
//
//            .harness/loom/   — canonical staging (skills, agents, hook.sh,
//                                sync.ts). install/sync own this tree; the
//                                orchestrator never writes here.
//            .harness/cycle/  — runtime cycle state (state.md, events.md,
//                                epics/, finalizer/). orchestrator owns this
//                                tree; install only seeds it on first install
//                                (or --force). The epics/ subtree holds pair
//                                artifacts per EPIC slug; the finalizer/tasks/
//                                subtree holds the singleton cycle-end artifact.
//
//          install never touches `<target>/.claude/`, `<target>/.codex/`, or
//          `<target>/.gemini/`. Those platform trees are produced by
//          `node .harness/loom/sync.ts --provider <list>` on explicit user
//          opt-in.
//
// Usage:   node skills/harness-init/scripts/install.ts [<target-project-path>] [--force]
//          Target defaults to process.cwd() when omitted.
//
// Related: skills/harness-init/scripts/hook.sh — copied into <target>/.harness/loom/hook.sh
//          skills/harness-init/scripts/sync.ts — copied into <target>/.harness/loom/sync.ts
//                                                (platform-tree derivation)
//          Both copies keep the target self-contained for re-entry and platform
//          deploys. Cycle reset is not a script; the orchestrator performs it
//          directly per harness-orchestrate SKILL §Goal entry (archive + reseed
//          using the schema in references/state-md-schema.md).
//
// Design notes:
//   - default re-run: refresh `.harness/loom/` only; `.harness/cycle/` is
//     preserved verbatim so the current cycle's audit trail survives a
//     plugin upgrade. `--force` wipes both.
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
// sync.ts is copied verbatim into `.harness/loom/` so the target can derive
// platform trees without depending on this plugin on disk.
const SYNC_SOURCE = join(SCRIPT_DIR, "sync.ts");
// Runtime templates live under harness-init references/, but their filenames
// end with `.template.md` so recursive skill scanners do not register them as
// standalone factory skills while still keeping the deployment source close to
// the installer that owns it.
const TEMPLATES_DIR = resolve(SCRIPT_DIR, "..", "references", "runtime");
const STATE_TEMPLATE = join(TEMPLATES_DIR, "state.template.md");
const EVENTS_TEMPLATE = join(TEMPLATES_DIR, "events.template.md");
const REGISTRY_TEMPLATE = join(TEMPLATES_DIR, "registry.md");
const ORCHESTRATE_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-orchestrate");
const PLANNING_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-planning");
const CONTEXT_SKILL_TEMPLATE = join(TEMPLATES_DIR, "harness-context");
const FINALIZER_AGENT_TEMPLATE = join(TEMPLATES_DIR, "harness-finalizer.template.md");
const PLANNER_AGENT_TEMPLATE = join(TEMPLATES_DIR, "harness-planner.template.md");

// Pin lives in sync.ts's PIN table now. install.ts only scaffolds canonical
// staging — it does not render a platform-specific frontmatter pin.

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
          "  Platform deploy is opt-in via `node .harness/loom/sync.ts --provider claude,codex,gemini`.\n",
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

// ---------------------------------------------------------------- foundation set

// The canonical-foundation entries scaffoldLoomCanonical() re-creates on every
// install run. Anything else under `.harness/loom/{skills,agents}/` is user
// work (pair-dev output) that default rerun is about to wipe — we surface it
// as a warning so the loss is not silent.
const FOUNDATION_SKILL_NAMES = new Set([
  "harness-orchestrate",
  "harness-planning",
  "harness-context",
]);
const FOUNDATION_AGENT_FILES = new Set([
  "harness-planner.md",
  "harness-finalizer.md",
]);

async function collectNonFoundationLoomEntries(loomDir: string): Promise<string[]> {
  const found: string[] = [];
  const skillsDir = join(loomDir, "skills");
  if (await exists(skillsDir)) {
    for (const entry of await readdir(skillsDir)) {
      if (!FOUNDATION_SKILL_NAMES.has(entry)) found.push(`skills/${entry}`);
    }
  }
  const agentsDir = join(loomDir, "agents");
  if (await exists(agentsDir)) {
    for (const entry of await readdir(agentsDir)) {
      if (!FOUNDATION_AGENT_FILES.has(entry)) found.push(`agents/${entry}`);
    }
  }
  return found.sort();
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

// install never writes platform settings (`.claude/settings.json`,
// `.codex/hooks.json`, `.gemini/settings.json`). Hook wiring is sync.ts's
// job and only fires when the user opts into a platform deploy.

// ---------------------------------------------------------------- loom canonical scaffold

async function scaffoldLoomCanonical(loomRoot: string, copied: string[]): Promise<void> {
  const skillsRoot = join(loomRoot, "skills");
  const agentsRoot = join(loomRoot, "agents");
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
  // Agent templates are authored platform-neutral (no `model:` line); sync.ts
  // injects the per-platform pin at deploy time. Copy them verbatim.
  if (await exists(PLANNER_AGENT_TEMPLATE)) {
    const dst = join(agentsRoot, "harness-planner.md");
    await copyFile(PLANNER_AGENT_TEMPLATE, dst);
    copied.push(dst);
  }
  if (await exists(FINALIZER_AGENT_TEMPLATE)) {
    const dst = join(agentsRoot, "harness-finalizer.md");
    await copyFile(FINALIZER_AGENT_TEMPLATE, dst);
    copied.push(dst);
  }
  // Registry lives at loom root because both the orchestrator (read) and
  // pair-authoring tooling (write) consume it; placing it under any single
  // skill's subtree would create a weak ownership boundary.
  if (await exists(REGISTRY_TEMPLATE)) {
    const dst = join(loomRoot, "registry.md");
    await copyFile(REGISTRY_TEMPLATE, dst);
    copied.push(dst);
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const { target, force } = parseArgs(process.argv);

  if (!(await exists(target))) die(`target does not exist: ${target}`);
  const targetStat = await stat(target);
  if (!targetStat.isDirectory()) die(`target is not a directory: ${target}`);

  const harnessDir = join(target, ".harness");
  const loomDir = join(harnessDir, "loom");
  const cycleDir = join(harnessDir, "cycle");

  // Scan for user-authored pair files before we wipe loom/ so the loss is not
  // silent. `--force` is an explicit reset, so suppress the warning there; on
  // default rerun we emit a stderr warning and surface the list in the JSON
  // summary as `wipedPairs`.
  const cyclePreExisted = await exists(cycleDir);
  const loomPreExisted = await exists(loomDir);
  const wipedPairs = loomPreExisted ? await collectNonFoundationLoomEntries(loomDir) : [];
  if (!force && wipedPairs.length > 0) {
    process.stderr.write(
      `install: warning — default rerun is about to wipe ${wipedPairs.length} non-foundation entr${wipedPairs.length === 1 ? "y" : "ies"} under .harness/loom/:\n`,
    );
    for (const p of wipedPairs) process.stderr.write(`  - ${p}\n`);
    process.stderr.write(
      "install: re-author pair content with /harness-pair-dev --add after install, " +
        "or back up .harness/loom/ first if you need to preserve it.\n",
    );
  }

  // Behaviour split:
  //   --force  : wipe both sub-namespaces and reseed everything.
  //   default  : refresh `.harness/loom/` (wipe-and-reseed) and preserve
  //              `.harness/cycle/` verbatim if present. The cycle's audit trail
  //              survives plugin upgrades that reuse this script.
  //
  // Registry preservation: `.harness/loom/registry.md` holds volatile pair
  // and finalizer registrations the user (or pair-dev tooling) has accumulated.
  // Default rerun would otherwise clobber it along with the rest of loom/, so
  // we back it up before wipe and restore it after the canonical scaffold.
  // `--force` is an explicit reset, so it discards the backup deliberately.
  const registryPath = join(loomDir, "registry.md");
  let registryBackup: string | null = null;
  if (!force && loomPreExisted && (await exists(registryPath))) {
    registryBackup = await readFile(registryPath, "utf8");
  }
  if (force) {
    if (loomPreExisted) await rm(loomDir, { recursive: true, force: true });
    if (cyclePreExisted) await rm(cycleDir, { recursive: true, force: true });
  } else if (loomPreExisted) {
    await rm(loomDir, { recursive: true, force: true });
  }

  // cycleAction tells the caller what happened to `.harness/cycle/`:
  //   seeded     — cycle/ was absent and is now written fresh
  //   preserved  — cycle/ already existed and default rerun left it intact
  //   wiped      — --force removed the prior cycle/; it is now reseeded fresh
  const cycleAction: "seeded" | "preserved" | "wiped" = force
    ? (cyclePreExisted ? "wiped" : "seeded")
    : (cyclePreExisted ? "preserved" : "seeded");

  const stateMdPath = join(cycleDir, "state.md");
  const eventsMdPath = join(cycleDir, "events.md");
  if (cycleAction !== "preserved") {
    // Pair artifacts live under `.harness/cycle/epics/EP-N--<slug>/{tasks,reviews}/`
    // (slug-nested). Finalizer artifacts live under
    // `.harness/cycle/finalizer/tasks/` (flat, singleton). Seed both subtree
    // roots up front so the orchestrator never has to branch on "does this
    // cycle dir exist yet" at dispatch time, and so the goal-reset archive
    // procedure has a symmetric pair/finalizer pair to move.
    await mkdir(join(cycleDir, "epics"), { recursive: true });
    await mkdir(join(cycleDir, "finalizer", "tasks"), { recursive: true });
    await writeFile(stateMdPath, await initialStateMd());
    await writeFile(eventsMdPath, await initialEventsMd());
  }

  // Seed .harness/loom/ fresh on every run (default rerun or --force).
  await mkdir(loomDir, { recursive: true });
  const hookDest = join(loomDir, "hook.sh");
  if (!(await exists(HOOK_SOURCE))) die(`missing source hook script: ${HOOK_SOURCE}`);
  await copyFile(HOOK_SOURCE, hookDest);
  await chmod(hookDest, 0o755);

  // Self-contained sync.ts copy so the target runtime can invoke
  // `node .harness/loom/sync.ts` without depending on the plugin tree.
  const syncDest = join(loomDir, "sync.ts");
  if (!(await exists(SYNC_SOURCE))) die(`missing source sync script: ${SYNC_SOURCE}`);
  await copyFile(SYNC_SOURCE, syncDest);

  const scaffolded: string[] = [];
  await scaffoldLoomCanonical(loomDir, scaffolded);

  // Restore the user's registry from the pre-wipe backup so default rerun
  // does not silently clobber accumulated pair/finalizer registrations.
  // `--force` already discarded the backup above (registryBackup stays null),
  // so this branch is a no-op on explicit reset.
  let registryRestored = false;
  if (registryBackup !== null) {
    await writeFile(registryPath, registryBackup);
    registryRestored = true;
  }

  const verification = await verifyInstall(target, {
    stateMd: stateMdPath,
    eventsMd: eventsMdPath,
    hook: hookDest,
    sync: syncDest,
    scaffolded,
  });

  const summary = {
    target,
    harnessDir,
    loomDir,
    cycleDir,
    cycleAction,
    wipedPairs,
    registryRestored,
    stateMd: stateMdPath,
    eventsMd: eventsMdPath,
    hook: hookDest,
    sync: syncDest,
    scaffolded,
    verification,
    nextStep:
      "Run `node .harness/loom/sync.ts --provider claude,codex,gemini` (any subset) to deploy platform trees. " +
      "Then author pairs with `/harness-pair-dev --add ...`.",
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
  ctx: { stateMd: string; eventsMd: string; hook: string; sync: string; scaffolded: string[] },
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

  // Cycle namespace: runtime state seeded (or preserved) by install.
  await expect(".harness/cycle/state.md", ctx.stateMd, "file");
  await expect(".harness/cycle/events.md", ctx.eventsMd, "file");
  await expect(".harness/cycle/epics/", join(target, ".harness", "cycle", "epics"), "dir");
  await expect(".harness/cycle/finalizer/tasks/", join(target, ".harness", "cycle", "finalizer", "tasks"), "dir");

  // Loom namespace: canonical staging written fresh each run.
  await expect(".harness/loom/hook.sh", ctx.hook, "file");
  await expect(".harness/loom/sync.ts", ctx.sync, "file");
  await expect(".harness/loom/skills/harness-orchestrate/SKILL.md", join(target, ".harness", "loom", "skills", "harness-orchestrate", "SKILL.md"), "file");
  await expect(".harness/loom/skills/harness-planning/SKILL.md", join(target, ".harness", "loom", "skills", "harness-planning", "SKILL.md"), "file");
  await expect(".harness/loom/skills/harness-context/SKILL.md", join(target, ".harness", "loom", "skills", "harness-context", "SKILL.md"), "file");
  await expect(".harness/loom/agents/harness-planner.md", join(target, ".harness", "loom", "agents", "harness-planner.md"), "file");
  await expect(".harness/loom/agents/harness-finalizer.md", join(target, ".harness", "loom", "agents", "harness-finalizer.md"), "file");
  await expect(".harness/loom/registry.md", join(target, ".harness", "loom", "registry.md"), "file");

  // hook executable bit.
  try {
    const st = await stat(ctx.hook);
    const exec = (st.mode & 0o111) !== 0;
    checks["hook.sh executable"] = exec;
    if (!exec) failures.push(`hook.sh not executable: ${ctx.hook}`);
  } catch {
    checks["hook.sh executable"] = false;
  }

  // Platform trees (.claude/, .codex/, .gemini/) are out of install's scope.
  // Install writes only under `.harness/`, so an existing platform tree —
  // which a real Claude Code project is very likely to already have — is not
  // a failure signal. sync.ts is solely responsible for deploying there.

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
