// Global state (onboarding flag, pause) and per-session cadence state.
// Layout under the data dir:
//   state.json                  { onboarded, pausedUntil? }
//   sessions/<session_id>.json  { promptCount, lastBreakAt, startedAt, updatedAt }
//   lastBreakAt / startedAt are ms timestamps; 0 means unset.

import { readdirSync, statSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from "./paths.mjs";

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const GLOBAL_DEFAULTS = { onboarded: false };
const SESSION_DEFAULTS = { promptCount: 0, lastBreakAt: 0, startedAt: 0 };

export function readGlobalState(dir) {
  return { ...GLOBAL_DEFAULTS, ...(readJson(join(dir, "state.json"), {}) ?? {}) };
}

export function writeGlobalState(dir, state) {
  writeJson(join(dir, "state.json"), state);
}

/** Longest pause the CLI allows; anything further out is clock skew, not intent. */
export const MAX_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

/** pausedUntil: -1 = indefinite, positive ms timestamp = until then. */
export function isPaused(state, now = Date.now()) {
  const p = state?.pausedUntil;
  return p === -1 || (typeof p === "number" && Number.isFinite(p) && p > now && p <= now + MAX_PAUSE_MS + 60_000);
}

function sanitizeId(id) {
  const s = String(id ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
  return s || "default";
}

export function sessionPath(dir, id) {
  return join(dir, "sessions", `${sanitizeId(id)}.json`);
}

export function readSession(dir, id) {
  const raw = readJson(sessionPath(dir, id), {}) ?? {};
  return {
    promptCount: Number.isInteger(raw.promptCount) ? raw.promptCount : SESSION_DEFAULTS.promptCount,
    lastBreakAt: Number.isFinite(raw.lastBreakAt) ? raw.lastBreakAt : SESSION_DEFAULTS.lastBreakAt,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : SESSION_DEFAULTS.startedAt,
  };
}

export function writeSession(dir, id, session) {
  writeJson(sessionPath(dir, id), { ...session, updatedAt: Date.now() });
}

/** Delete session files not modified within maxAgeMs. Returns count removed. Never throws. */
export function pruneSessions(dir, maxAgeMs = SESSION_MAX_AGE_MS, now = Date.now()) {
  const sessionsDir = join(dir, "sessions");
  if (!existsSync(sessionsDir)) return 0;
  let removed = 0;
  try {
    for (const name of readdirSync(sessionsDir)) {
      if (!name.endsWith(".json")) continue;
      const p = join(sessionsDir, name);
      try {
        if (statSync(p).mtimeMs < now - maxAgeMs) {
          unlinkSync(p);
          removed++;
        }
      } catch {
        // file vanished or unreadable — skip
      }
    }
  } catch {
    // readdir failed — nothing to prune
  }
  return removed;
}
