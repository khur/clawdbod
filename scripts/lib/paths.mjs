// Data-directory resolution, safe JSON I/O, and config loading shared by the
// Stop hook and every CLI script.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export const DEFAULTS = { promptsBetweenBreaks: 8, minMinutesBetweenBreaks: 20 };

/** Resolve the data dir: explicit override > CLAWDBOD_DATA_DIR > ~/.claude/clawdbod */
export function dataDir(override) {
  return override || process.env.CLAWDBOD_DATA_DIR || join(homedir(), ".claude", "clawdbod");
}

/** Parse a JSON object file; any failure (missing, malformed, non-object) returns fallback. */
export function readJson(path, fallback = null) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

/** Write JSON atomically (temp file + rename) and create parent dirs. */
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** First candidate that parses to a positive integer, clamped to [min, max]. */
function pickInt(candidates, min, max) {
  for (const c of candidates) {
    const n = Number.parseInt(c, 10);
    if (Number.isInteger(n) && n > 0) return clamp(n, min, max);
  }
  return min; // unreachable in practice: DEFAULTS is always the last candidate
}

/** Load config.json with env overrides, clamping, and defaults. Never throws. */
export function readConfig(dir) {
  const path = join(dir, "config.json");
  const file = readJson(path, {}) ?? {};
  return {
    exists: existsSync(path),
    promptsBetweenBreaks: pickInt(
      [process.env.CLAWDBOD_PROMPTS, file.promptsBetweenBreaks, DEFAULTS.promptsBetweenBreaks],
      1,
      1000
    ),
    minMinutesBetweenBreaks: pickInt(
      [process.env.CLAWDBOD_MINUTES, file.minMinutesBetweenBreaks, DEFAULTS.minMinutesBetweenBreaks],
      1,
      1440
    ),
    profile: file.profile !== null && typeof file.profile === "object" ? file.profile : null,
  };
}
