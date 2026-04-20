#!/usr/bin/env bash
# Purpose: Stop-hook re-entry source for generated harnesses.
#          Installed by skills/harness-init/scripts/install.ts into
#          <target>/.harness/loom/hook.sh.
#          Reads .harness/cycle/state.md; if `loop: true` is set, emits a
#          `{"decision":"block","reason":"<orchestrator-command>"}` JSON
#          payload so the platform re-invokes the orchestrator for the
#          next Producer-Reviewer pair. Otherwise exits 0 silently.
#
# Usage:   bash .harness/loom/hook.sh <platform>
#            wired by sync.ts into:
#              .claude/settings.json   Stop       → bash .harness/loom/hook.sh claude
#              .codex/hooks.json       Stop       → bash .harness/loom/hook.sh codex
#              .gemini/settings.json   AfterAgent → bash .harness/loom/hook.sh gemini
#
# Claude filter: subagent Stop events include a non-null `agent_id` in the
# hook's stdin JSON payload. We skip those so only main-agent stops trigger
# re-entry.
#
# Codex/Gemini have no reliable subagent_id. Loop-invert strategy:
# the orchestrator writes `loop: false` at the start of every turn, keeps it
# false through all subagent completions, and writes `loop: true` only at the
# very end of a response where it intends to re-enter. This makes subagent
# Stop/AfterAgent hooks silent even when the platform cannot identify them.
#
# Logic budget: <= 30 non-comment lines.

set -euo pipefail

state_file=".harness/cycle/state.md"
[[ -f "$state_file" ]] || exit 0

# Claude subagent filter: consume stdin JSON if present, skip when agent_id is non-null.
stdin_payload=""
if [[ ! -t 0 ]]; then
  stdin_payload="$(cat || true)"
fi
if [[ -n "$stdin_payload" ]]; then
  if printf '%s' "$stdin_payload" | grep -Eq '"agent_id"[[:space:]]*:[[:space:]]*"[^"]+"'; then
    exit 0
  fi
fi

# Line-anchored loop field: match only at line start, tolerate leading "- ".
loop_line="$(grep -E '^[[:space:]]*-?[[:space:]]*loop:' "$state_file" | head -n1 || true)"
loop_value="$(printf '%s' "$loop_line" | sed -E 's/.*loop:[[:space:]]*([A-Za-z]+).*/\1/' | tr '[:upper:]' '[:lower:]')"
[[ "$loop_value" == "true" ]] || exit 0

# Orchestrator invocation syntax differs per platform:
#   claude  → /harness-orchestrate   (slash command)
#   codex   → $harness-orchestrate   (skill mention; /name is reserved for built-ins)
#   gemini  → /harness-orchestrate   (slash command; AfterAgent event)
# Platform is passed as $1 by each platform's hook config (sync.ts writes it
# explicitly). Missing/unknown platforms are a configuration bug, not a
# silent-fallback case.
platform="${1:-}"
case "$platform" in
  claude|gemini) reason='/harness-orchestrate' ;;
  codex)         reason='$harness-orchestrate' ;;
  "")            printf 'hook.sh: platform argument required (claude|codex|gemini)\n' >&2; exit 2 ;;
  *)             printf 'hook.sh: unknown platform: %s\n' "$platform" >&2; exit 2 ;;
esac
printf '{"decision":"block","reason":"%s"}\n' "$reason"
