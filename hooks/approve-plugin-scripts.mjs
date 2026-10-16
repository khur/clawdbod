#!/usr/bin/env node

/**
 * clawdbod PreToolUse hook (Bash)
 *
 * Auto-approves Bash calls that run this plugin's own scripts, so a fitness
 * break or /clawdbod:status never ends in a permission prompt. A skill's
 * `allowed-tools` grant is scoped to the turn that invoked it, which is not
 * guaranteed to cover the turn a Stop-hook block starts — this hook is.
 *
 * Approves only:   node <this plugin>/scripts/<known script>.mjs [plain args]
 * Never approves:  shell operators, substitutions, redirects, other paths,
 *                  the export script, or --data-dir (writes outside ~/.claude/clawdbod).
 * Anything else gets no output, which leaves the normal permission flow alone.
 */

import { readFileSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
// export-workouts.mjs writes a file wherever it is run, so it keeps the normal prompt.
const SCRIPTS = new Set(["log-workout.mjs", "stats.mjs", "state.mjs"]);
const WRITES_ELSEWHERE = new Set(["--data-dir"]);

/** Split on whitespace, honouring '…' and "…" quotes. Null if quotes are unbalanced. */
function tokenize(cmd) {
  const TOKEN = /(?:'[^']*'|"[^"]*"|[^\s'"])+/g;
  // Anything left besides whitespace means a stray, unbalanced quote.
  if (cmd.replace(TOKEN, "").trim()) return null;
  const raw = cmd.match(TOKEN) ?? [];
  return raw.map((t) => t.replace(/'([^']*)'|"([^"]*)"/g, (_, a, b) => a ?? b));
}

export function isOwnScriptCall(command) {
  if (typeof command !== "string" || !command.trim()) return false;
  // No operators, substitutions, redirects, escapes, globs, or newlines anywhere.
  if (/[;&|`$<>\\(){}*?\n\r]/.test(command)) return false;
  const tokens = tokenize(command);
  if (!tokens || tokens.length < 2 || tokens[0] !== "node") return false;
  const script = resolve(tokens[1]);
  if (dirname(script) !== resolve(SCRIPTS_DIR)) return false;
  if (!SCRIPTS.has(basename(script))) return false;
  return !tokens.slice(2).some((t) => WRITES_ELSEWHERE.has(t) || t.startsWith("--data-dir="));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(0, "utf-8"));
    if (input?.tool_name === "Bash" && isOwnScriptCall(input?.tool_input?.command)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: "ClawdBod: running its own local script",
        },
      }));
    }
  } catch {
    // stay silent — normal permission flow applies
  }
  process.exit(0);
}
