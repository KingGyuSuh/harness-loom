import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");

export const INSTALL_SCRIPT = join(REPO_ROOT, "plugins/harness-loom/skills/harness-init/scripts/install.ts");
export const INIT_SCRIPT = join(REPO_ROOT, "plugins/harness-loom/skills/harness-init/scripts/init.ts");
export const SYNC_SCRIPT = join(REPO_ROOT, "plugins/harness-loom/skills/harness-pair-dev/scripts/sync.ts");
export const REGISTER_PAIR_SCRIPT = join(REPO_ROOT, "plugins/harness-loom/skills/harness-pair-dev/scripts/register-pair.ts");

export function makeTempDir(prefix = "harness-loom-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupDir(path) {
  rmSync(path, { recursive: true, force: true });
}

export function runNode(script, args = [], opts = {}) {
  return spawnSync("node", [script, ...args], {
    encoding: "utf8",
    ...opts,
  });
}

export function runBash(script, args = [], opts = {}) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    ...opts,
  });
}
