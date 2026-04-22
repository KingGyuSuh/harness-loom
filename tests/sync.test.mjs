import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanupDir,
  runNode,
  INSTALL_SCRIPT,
  SYNC_SCRIPT,
} from "./helpers.mjs";

function installTo(target) {
  const r = runNode(INSTALL_SCRIPT, [target]);
  assert.equal(r.status, 0, r.stderr);
}

// Snapshot every file under a directory recursively, keyed by relative path.
function snapshotTree(root) {
  const out = new Map();
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.set(rel, readFileSync(full, "utf8"));
    }
  }
  if (existsSync(root)) walk(root, "");
  return out;
}

test("sync --provider claude derives .claude/{agents, skills, settings.json} from loom/", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(SYNC_SCRIPT, ["--provider", "claude"], { cwd: target });
    assert.equal(r.status, 0, r.stderr);

    // Agents and skills mirror canonical staging.
    assert.ok(existsSync(join(target, ".claude/agents/harness-planner.md")));
    assert.ok(existsSync(join(target, ".claude/skills/harness-orchestrate/SKILL.md")));
    assert.ok(existsSync(join(target, ".claude/skills/harness-planning/SKILL.md")));
    assert.ok(existsSync(join(target, ".claude/skills/harness-context/SKILL.md")));
    const planner = readFileSync(join(target, ".claude/agents/harness-planner.md"), "utf8");
    assert.match(planner, /^skills:\n  - harness-planning\n  - harness-context$/m);
    assert.doesNotMatch(planner, /Required Skill Loading/);

    // settings.json hook wires the loom hook.sh rather than a cycle-owned path.
    const settings = JSON.parse(readFileSync(join(target, ".claude/settings.json"), "utf8"));
    const command = settings.hooks.Stop[0].hooks[0].command;
    assert.equal(command, "bash .harness/loom/hook.sh claude");
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider codex writes nested hooks.json shape pointing at .harness/loom/hook.sh", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const r = runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target });
    assert.equal(r.status, 0, r.stderr);

    const hooks = JSON.parse(readFileSync(join(target, ".codex/hooks.json"), "utf8"));
    assert.ok(hooks.hooks, "top-level 'hooks' key required by codex-rs");
    assert.ok(Array.isArray(hooks.hooks.Stop), "hooks.Stop must be array");
    const item = hooks.hooks.Stop[0].hooks[0];
    assert.equal(item.type, "command");
    assert.equal(item.command, "bash .harness/loom/hook.sh codex");
    assert.equal(item.timeout, 30);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider codex writes [features] codex_hooks = true", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target }).status, 0);

    const toml = readFileSync(join(target, ".codex/config.toml"), "utf8");
    assert.match(toml, /\[features\]/);
    assert.match(toml, /codex_hooks\s*=\s*true/);
  } finally {
    cleanupDir(target);
  }
});

test("sync preserves existing [features] section when writing codex_hooks", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    mkdirSync(join(target, ".codex"), { recursive: true });
    writeFileSync(
      join(target, ".codex/config.toml"),
      "[features]\nsome_other_flag = true\n",
    );
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target }).status, 0);

    const toml = readFileSync(join(target, ".codex/config.toml"), "utf8");
    assert.match(toml, /some_other_flag\s*=\s*true/);
    assert.match(toml, /codex_hooks\s*=\s*true/);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider gemini writes AfterAgent settings.json pointing at .harness/loom/hook.sh", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "gemini"], { cwd: target }).status, 0);

    const settings = JSON.parse(readFileSync(join(target, ".gemini/settings.json"), "utf8"));
    assert.ok(Array.isArray(settings.hooks.AfterAgent), "hooks.AfterAgent must be array");
    const item = settings.hooks.AfterAgent[0].hooks[0];
    assert.equal(item.type, "command");
    assert.equal(item.command, "bash .harness/loom/hook.sh gemini");
    assert.equal(item.timeout, 60000);
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider gemini strips skills frontmatter but injects required skill loading into agent bodies", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "gemini"], { cwd: target }).status, 0);

    const planner = readFileSync(join(target, ".gemini/agents/harness-planner.md"), "utf8");
    const finalizer = readFileSync(join(target, ".gemini/agents/harness-finalizer.md"), "utf8");

    assert.doesNotMatch(planner, /^skills:/m);
    assert.match(planner, /^## Required Skill Loading$/m);
    assert.match(planner, /activate and follow these skill bodies by name: harness-planning, harness-context\./);
    assert.match(planner, /\$harness-planning, \$harness-context/);
    assert.match(planner, /^# Planner$/m);

    assert.doesNotMatch(finalizer, /^skills:/m);
    assert.match(finalizer, /activate and follow these skill bodies by name: harness-context\./);
    assert.match(finalizer, /\$harness-context/);
    assert.doesNotMatch(finalizer, /\$harness-planning/);

    assert.ok(existsSync(join(target, ".gemini/skills/harness-planning/SKILL.md")));
    assert.ok(existsSync(join(target, ".gemini/skills/harness-context/SKILL.md")));
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider claude,codex,gemini produces all three platform trees in one run", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(
      runNode(SYNC_SCRIPT, ["--provider", "claude,codex,gemini"], { cwd: target }).status,
      0,
    );

    assert.ok(existsSync(join(target, ".claude/settings.json")));
    assert.ok(existsSync(join(target, ".codex/hooks.json")));
    assert.ok(existsSync(join(target, ".codex/config.toml")));
    assert.ok(existsSync(join(target, ".gemini/settings.json")));
  } finally {
    cleanupDir(target);
  }
});

test("sync never writes into .harness/loom/ (canonical staging is read-only)", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const before = snapshotTree(join(target, ".harness/loom"));
    assert.equal(
      runNode(SYNC_SCRIPT, ["--provider", "claude,codex,gemini"], { cwd: target }).status,
      0,
    );
    const after = snapshotTree(join(target, ".harness/loom"));
    assert.equal(after.size, before.size, "sync must not add/remove files under .harness/loom/");
    for (const [path, body] of before) {
      assert.equal(after.get(path), body, `sync must not mutate .harness/loom/${path}`);
    }
  } finally {
    cleanupDir(target);
  }
});

test("sync never reads or writes .harness/cycle/ (orchestrator-owned)", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    const before = snapshotTree(join(target, ".harness/cycle"));
    assert.equal(
      runNode(SYNC_SCRIPT, ["--provider", "claude,codex,gemini"], { cwd: target }).status,
      0,
    );
    const after = snapshotTree(join(target, ".harness/cycle"));
    assert.equal(after.size, before.size, "sync must not add/remove files under .harness/cycle/");
    for (const [path, body] of before) {
      assert.equal(after.get(path), body, `sync must not mutate .harness/cycle/${path}`);
    }
  } finally {
    cleanupDir(target);
  }
});

test("sync wipes stale harness-* artifacts in platform agents/ before redeploy", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    // Pre-seed each platform with a stale harness-* file the sync must remove.
    for (const platform of [".claude", ".codex", ".gemini"]) {
      const ext = platform === ".codex" ? ".toml" : ".md";
      mkdirSync(join(target, platform, "agents"), { recursive: true });
      writeFileSync(
        join(target, platform, "agents", `harness-old-pair-producer${ext}`),
        "stale",
      );
    }
    assert.equal(
      runNode(SYNC_SCRIPT, ["--provider", "claude,codex,gemini"], { cwd: target }).status,
      0,
    );
    assert.ok(!existsSync(join(target, ".claude/agents/harness-old-pair-producer.md")));
    assert.ok(!existsSync(join(target, ".codex/agents/harness-old-pair-producer.toml")));
    assert.ok(!existsSync(join(target, ".gemini/agents/harness-old-pair-producer.md")));
  } finally {
    cleanupDir(target);
  }
});

test("sync preserves user-owned non-harness agents/skills under platform dirs", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    // Pre-seed a non-harness user agent and skill that sync must not touch.
    mkdirSync(join(target, ".claude/agents"), { recursive: true });
    writeFileSync(join(target, ".claude/agents/team-reviewer.md"), "USER ASSET\n");
    mkdirSync(join(target, ".claude/skills/user-skill"), { recursive: true });
    writeFileSync(join(target, ".claude/skills/user-skill/SKILL.md"), "USER SKILL\n");

    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "claude"], { cwd: target }).status, 0);

    assert.equal(
      readFileSync(join(target, ".claude/agents/team-reviewer.md"), "utf8"),
      "USER ASSET\n",
    );
    assert.equal(
      readFileSync(join(target, ".claude/skills/user-skill/SKILL.md"), "utf8"),
      "USER SKILL\n",
    );
  } finally {
    cleanupDir(target);
  }
});

test("sync errors on bare invocation — deploy is always an explicit opt-in", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    // Bare invocation: no flags, no providers. Must error, not silently scan.
    const bare = runNode(SYNC_SCRIPT, [], { cwd: target });
    assert.notEqual(bare.status, 0);
    assert.match(bare.stderr, /no providers selected/);
    assert.match(bare.stderr, /--provider/);

    // Explicit --provider still works on the same target.
    const r = runNode(SYNC_SCRIPT, ["--provider", "claude"], { cwd: target });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(target, ".claude/agents/harness-planner.md")));
  } finally {
    cleanupDir(target);
  }
});

test("sync --provider codex omits skills.config and injects required skill mentions into agent bodies", () => {
  const target = makeTempDir();
  try {
    installTo(target);
    assert.equal(runNode(SYNC_SCRIPT, ["--provider", "codex"], { cwd: target }).status, 0);

    const planner = readFileSync(join(target, ".codex/agents/harness-planner.toml"), "utf8");
    const finalizer = readFileSync(join(target, ".codex/agents/harness-finalizer.toml"), "utf8");

    assert.doesNotMatch(planner, /\[\[skills\.config\]\]/);
    assert.doesNotMatch(planner, /^path\s*=\s*"/m);
    assert.match(planner, /^developer_instructions = """$/m);
    assert.match(planner, /^## Required Skill Loading$/m);
    assert.match(planner, /\$harness-planning, \$harness-context/);
    assert.match(planner, /Codex exposes skill metadata by default/);
    assert.match(planner, /^# Planner$/m);

    assert.doesNotMatch(finalizer, /\[\[skills\.config\]\]/);
    assert.match(finalizer, /\$harness-context/);
    assert.doesNotMatch(finalizer, /\$harness-planning/);

    assert.ok(existsSync(join(target, ".codex/skills/harness-planning/SKILL.md")));
    assert.ok(existsSync(join(target, ".codex/skills/harness-context/SKILL.md")));
  } finally {
    cleanupDir(target);
  }
});

test("sync does not deploy to a pre-existing .claude/ without explicit --provider", () => {
  const target = makeTempDir();
  try {
    installTo(target);

    // Simulate a user-owned .claude/ that predates any harness sync.
    mkdirSync(join(target, ".claude"), { recursive: true });
    writeFileSync(
      join(target, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }, null, 2),
    );

    const bare = runNode(SYNC_SCRIPT, [], { cwd: target });
    assert.notEqual(bare.status, 0, "bare invocation must refuse, not touch user assets");

    // User's pre-existing settings.json survives untouched.
    const settings = JSON.parse(readFileSync(join(target, ".claude/settings.json"), "utf8"));
    assert.deepEqual(settings.permissions.allow, ["Bash(ls)"]);
    assert.equal(settings.hooks, undefined, "harness Stop hook must not have been injected");

    // No harness-* artifacts were dropped into the user's directory.
    assert.ok(!existsSync(join(target, ".claude/agents/harness-planner.md")));
    assert.ok(!existsSync(join(target, ".claude/skills/harness-orchestrate")));
  } finally {
    cleanupDir(target);
  }
});
