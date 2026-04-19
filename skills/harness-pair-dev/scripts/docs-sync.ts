#!/usr/bin/env node
// Purpose: Maintain the "## Harness Pairs" section in target's CLAUDE.md
//          and AGENTS.md so that pointer docs stay aligned with the agents
//          and skills actually installed under `.claude/agents/` and
//          `.claude/skills/`.
//
// Usage:   node <skill-dir>/scripts/docs-sync.ts
//
// Behaviour:
//   - Parses the "## Registered pairs" section of
//     `<cwd>/.claude/skills/harness-orchestrate/SKILL.md` to discover every
//     live pair. Each line carries slug, producer, reviewer(s) — including
//     1:M pairs whose reviewer list is `reviewers [<r1>, <r2>]` — and the
//     shared skill slug. `register-pair.ts` owns writing that section; this
//     script is read-only against it.
//   - Re-renders a `## Harness Pairs` block in `CLAUDE.md` and/or
//     `AGENTS.md` at the target root; creates the section if missing, or
//     replaces the old block byte-for-byte if present. Other sections
//     remain untouched.
//   - If `CLAUDE.md` or `AGENTS.md` is absent the script skips that file
//     without creating it — pointer docs are the user's property; we
//     only maintain a section we own.
//   - Emits a JSON summary of what changed to stdout. Exits non-zero on
//     IO errors.
//
// Idempotency: running twice in a row produces no further changes.

import { readFile, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const TARGET = process.cwd();
const SECTION_HEADING = "## Harness Pairs";
const REGISTRATION_SOURCE = join(
  TARGET,
  ".claude",
  "skills",
  "harness-orchestrate",
  "SKILL.md",
);

interface Pair {
  slug: string;
  producer: string;
  reviewers: string[];
  skill: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Parse a registration line emitted by register-pair.ts. Supports both 1:1
// (`reviewer \`x\``) and 1:M (`reviewers [\`x\`, \`y\`]`) forms.
function parseRegistrationLine(line: string): Pair | null {
  // Expected shape: `- <pair>: producer \`<p>\` ↔ <reviewer-field>, skill \`<s>\``
  const m = line.match(
    /^-\s+([a-z0-9][a-z0-9-]*)\s*:\s*producer\s+`([^`]+)`\s*↔\s*(.+?),\s*skill\s+`([^`]+)`\s*$/,
  );
  if (!m) return null;
  const [, slug, producer, reviewerField, skill] = m;
  let reviewers: string[] = [];
  const single = reviewerField.match(/^reviewer\s+`([^`]+)`$/);
  const multi = reviewerField.match(/^reviewers\s+\[(.+)\]$/);
  if (single) reviewers = [single[1]];
  else if (multi) {
    reviewers = [...multi[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  } else return null;
  if (reviewers.length === 0) return null;
  return { slug, producer, reviewers, skill };
}

async function discoverPairs(): Promise<Pair[]> {
  if (!(await exists(REGISTRATION_SOURCE))) return [];
  const raw = await readFile(REGISTRATION_SOURCE, "utf8");
  // Extract the `## Registered pairs` section body (up to next `## ` heading).
  const heading = "## Registered pairs";
  const idx = raw.indexOf(heading);
  if (idx < 0) return [];
  const afterHeading = raw.indexOf("\n", idx);
  const nextHeading = raw.indexOf("\n## ", afterHeading + 1);
  const section = raw.slice(afterHeading, nextHeading === -1 ? raw.length : nextHeading);
  const pairs: Pair[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const p = parseRegistrationLine(trimmed);
    if (p) pairs.push(p);
  }
  pairs.sort((a, b) => a.slug.localeCompare(b.slug));
  return pairs;
}

function renderSection(pairs: Pair[]): string {
  const lines: string[] = [SECTION_HEADING, ""];
  if (pairs.length === 0) {
    lines.push("아직 등록된 pair 가 없다. `/harness-pair-dev --add <pair-slug> --purpose \"<text>\"` 로 추가한다.");
  } else {
    for (const p of pairs) {
      const reviewerField =
        p.reviewers.length === 1
          ? `reviewer \`${p.reviewers[0]}\``
          : `reviewers [${p.reviewers.map((r) => `\`${r}\``).join(", ")}]`;
      lines.push(`- \`${p.slug}\` — producer \`${p.producer}\`, ${reviewerField}, skill \`${p.skill}\`.`);
    }
  }
  lines.push("");
  lines.push(
    "> 이 섹션은 `docs-sync.ts` 가 target 의 `harness-orchestrate/SKILL.md` 의 `## Registered pairs` 섹션을 파싱해 유지한다. 수동 편집은 다음 pair 추가/수정 시 덮어쓰인다.",
  );
  return lines.join("\n") + "\n";
}

type UpsertResult = "created" | "replaced" | "unchanged" | "skipped";

async function upsertSection(docPath: string, rendered: string): Promise<UpsertResult> {
  if (!(await exists(docPath))) return "skipped";
  const raw = await readFile(docPath, "utf8");
  // Match "## Harness Pairs" heading and everything up to the next top-level
  // `## ` heading (not `###`) or true end-of-string. No `m` flag — we need
  // end-of-string anchor, not end-of-line.
  const sectionRe = /(^|\n)## Harness Pairs\n[\s\S]*?(?=\n## [^#]|$(?![\s\S]))/;
  let next: string;
  let mode: UpsertResult;
  if (sectionRe.test(raw)) {
    next = raw.replace(sectionRe, (match) => {
      // Preserve the newline that preceded the heading so surrounding spacing stays.
      const lead = match.startsWith("\n") ? "\n" : "";
      // End with a single trailing newline so the next top-level heading sits
      // one blank line away (the captured lookahead supplies that blank line).
      return lead + rendered.trimEnd() + "\n";
    });
    mode = "replaced";
  } else {
    const trimmed = raw.replace(/\s+$/, "");
    next = trimmed + "\n\n" + rendered;
    mode = "created";
  }
  if (next === raw) return "unchanged";
  await writeFile(docPath, next);
  return mode;
}

async function main() {
  const pairs = await discoverPairs();
  const section = renderSection(pairs);
  const summary: Record<string, UpsertResult> = {};
  for (const doc of ["CLAUDE.md", "AGENTS.md"]) {
    summary[doc] = await upsertSection(join(TARGET, doc), section);
  }
  process.stdout.write(
    JSON.stringify({ target: TARGET, pairs: pairs.length, files: summary }, null, 2) + "\n",
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`docs-sync: ${msg}\n`);
  process.exit(1);
});
