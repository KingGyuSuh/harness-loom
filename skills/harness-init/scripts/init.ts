#!/usr/bin/env node
// Purpose: Reset the current harness cycle when a new Goal arrives.
//          Archives the existing state.md / events.md / epics tree into
//          .harness/_archive/{timestamp}[--{slug}]/ and re-seeds fresh
//          state/events/epics files with the Goal body captured from the
//          provided markdown file.
//
// Usage:   node skills/harness-init/scripts/init.ts --goal-source <markdown-path> [--slug <kebab>]
//          (invoked from inside a target project; cwd must contain `.harness/`)
//
// Related: skills/harness-init/scripts/install.ts — first-time install (creates `.harness/`)
//          skills/harness-init/scripts/hook.sh    — Stop-hook re-entry source (unaffected)
//
// Contract notes:
//   - The markdown body (trimmed) becomes the new Goal string verbatim.
//     Load-bearing headers are not required per goal-anchored entry rules.
//   - New state.md starts with loop:false, phase:planner, empty EPIC
//     narrative; the planner's first turn emits the initial EPIC list.
//   - If the archive destination already exists we refuse to clobber it
//     and exit non-zero so the caller can retry with a different slug.

import { mkdir, readFile, writeFile, rename, access, stat } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, resolve, dirname, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// Runtime seed templates live next to harness-init references and use
// `.template.md` filenames so recursive skill scans do not register them.
const TEMPLATES_DIR = resolve(SCRIPT_DIR, "..", "references", "runtime");
const STATE_TEMPLATE = join(TEMPLATES_DIR, "state.template.md");
const EVENTS_TEMPLATE = join(TEMPLATES_DIR, "events.template.md");


interface Args {
  goalSource: string;
  slug?: string;
}

function die(message: string, code = 1): never {
  process.stderr.write(`init: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let goalSource: string | undefined;
  let slug: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node skills/harness-init/scripts/init.ts --goal-source <markdown-path> [--slug <kebab>]\n",
      );
      process.exit(0);
    } else if (arg === "--goal-source") goalSource = rest[++i];
    else if (arg === "--slug") slug = rest[++i];
    else die(`unknown argument: ${arg}`);
  }
  if (!goalSource) die("--goal-source <markdown-path> is required");
  if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    die(`--slug must be kebab-case (got: ${slug})`);
  }
  return { goalSource, slug };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

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

async function freshStateMd(goal: string, goalSource: string): Promise<string> {
  const raw = await loadTemplate(STATE_TEMPLATE);
  return applyPlaceholders(raw, {
    GOAL_SOURCE: goalSource,
    GOAL_BODY: goal,
    TIMESTAMP: new Date().toISOString(),
  });
}

async function freshEventsMd(goalSource: string): Promise<string> {
  const raw = await loadTemplate(EVENTS_TEMPLATE);
  return applyPlaceholders(raw, {
    TIMESTAMP: new Date().toISOString(),
    GOAL_SOURCE: goalSource,
    GOAL_BODY: "",
  });
}

async function main() {
  const { goalSource, slug } = parseArgs(process.argv);

  const sourcePath = isAbsolute(goalSource) ? goalSource : resolve(process.cwd(), goalSource);
  if (!(await exists(sourcePath))) die(`goal source not found: ${sourcePath}`);
  const srcStat = await stat(sourcePath);
  if (!srcStat.isFile()) die(`goal source is not a file: ${sourcePath}`);

  const harnessDir = resolve(process.cwd(), ".harness");
  if (!(await exists(harnessDir))) {
    die(
      `no .harness/ directory in cwd (${process.cwd()}). Run skills/harness-init/scripts/install.ts first.`,
    );
  }

  const goalRaw = await readFile(sourcePath, "utf8");
  const goalBody = goalRaw.trim();
  if (!goalBody) die(`goal source is empty: ${sourcePath}`);

  const ts = timestamp();
  const archiveName = slug ? `${ts}--${slug}` : ts;
  const archiveDest = join(harnessDir, "_archive", archiveName);

  if (await exists(archiveDest)) {
    die(`archive destination already exists: ${archiveDest} (wait a second or pass --slug)`);
  }
  await mkdir(archiveDest, { recursive: true });

  const movedPaths: string[] = [];
  const movables = [
    { src: join(harnessDir, "state.md"), name: "state.md" },
    { src: join(harnessDir, "events.md"), name: "events.md" },
    { src: join(harnessDir, "epics"), name: "epics" },
  ];
  for (const { src, name } of movables) {
    if (await exists(src)) {
      const dst = join(archiveDest, name);
      await rename(src, dst);
      movedPaths.push(dst);
    }
  }

  await mkdir(join(harnessDir, "epics"), { recursive: true });
  const stateMdPath = join(harnessDir, "state.md");
  const eventsMdPath = join(harnessDir, "events.md");
  const relSource = relative(process.cwd(), sourcePath) || sourcePath;
  await writeFile(stateMdPath, await freshStateMd(goalBody, relSource));
  await writeFile(eventsMdPath, await freshEventsMd(relSource));

  const summary = {
    archived: movedPaths,
    archiveDest,
    goalSource: sourcePath,
    stateMd: stateMdPath,
    eventsMd: eventsMdPath,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
});
