#!/usr/bin/env node

/**
 * clawdbod Stop hook
 *
 * Fires every time Claude finishes responding. Counts prompts per session and
 * decides whether to block Claude from stopping so it can inject a fitness
 * challenge. Returning { decision: "block", reason } feeds the reason back as
 * context, which the clawdbod skill picks up.
 *
 * Storage (all under ~/.claude/clawdbod/, override with CLAWDBOD_DATA_DIR):
 *   config.json                 cadence + profile (user-owned)
 *   state.json                  { onboarded, pausedUntil? }  — global
 *   sessions/<session_id>.json  { promptCount, lastBreakAt } — per session
 *
 * This file must never exit non-zero and never print anything but a decision.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dataDir as resolveDataDir, readConfig } from "../scripts/lib/paths.mjs";
import {
  readGlobalState, writeGlobalState, isPaused,
  readSession, writeSession, pruneSessions,
} from "../scripts/lib/state.mjs";

try {
  const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const LOG_SCRIPT = join(PLUGIN_ROOT, "scripts", "log-workout.mjs");

  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    process.exit(0);
  }
  if (!input || typeof input !== "object" || input.stop_hook_active) process.exit(0);

  const dir = resolveDataDir();
  const sessionId = input.session_id;
  const config = readConfig(dir);
  const configPath = join(dir, "config.json");
  const global = readGlobalState(dir);
  const now = Date.now();

  const emit = (reason) => process.stdout.write(JSON.stringify({ decision: "block", reason }));

  // --- Onboarding: once per machine ------------------------------------
  if (!global.onboarded) {
    global.onboarded = true;
    writeGlobalState(dir, global);
    if (!config.exists) {
      emit([
        "🏋️ CLAWDBOD SETUP",
        "",
        "This is the first time ClawdBod is running on this machine.",
        "",
        "Use the clawdbod skill to walk the user through setup.",
        "Show them the current config and ask if they want to customize:",
        `  - Prompts between breaks: ${config.promptsBetweenBreaks}`,
        `  - Minutes between breaks: ${config.minMinutesBetweenBreaks}`,
        "",
        "If they want to change anything, update the config file at:",
        `  ${configPath}`,
        "",
        "If they're happy with defaults, just confirm and move on.",
        "Keep it brief — don't interrupt their flow for long.",
        "",
        "Also mention they can set up a profile for calorie estimates:",
        "  /clawdbod:setup",
      ].join("\n"));
      process.exit(0);
    }
  }

  // --- Pause (global) --------------------------------------------------
  const session = readSession(dir, sessionId);
  if ("pausedUntil" in global) {
    if (isPaused(global, now)) {
      session.promptCount += 1;
      writeSession(dir, sessionId, session);
      process.exit(0);
    }
    delete global.pausedUntil;
    writeGlobalState(dir, global);
  }

  // --- Cadence (per session) -------------------------------------------
  // The cooldown runs from the last break, or from session start before the
  // first one. Timestamps in the future mean the clock moved backwards; clamp
  // them so breaks aren't suppressed until the clock catches up.
  if (!(session.startedAt > 0) || session.startedAt > now) session.startedAt = now;
  if (session.lastBreakAt > now) session.lastBreakAt = now;
  const hadBreak = session.lastBreakAt > 0;
  const minutesSince = (now - (hadBreak ? session.lastBreakAt : session.startedAt)) / 60000;

  session.promptCount += 1;
  const shouldBreak =
    session.promptCount >= config.promptsBetweenBreaks &&
    minutesSince >= config.minMinutesBetweenBreaks;

  if (shouldBreak) {
    session.promptCount = 0;
    session.lastBreakAt = now;
  }
  writeSession(dir, sessionId, session);

  try { pruneSessions(dir); } catch { /* best effort */ }

  if (!shouldBreak) process.exit(0);

  emit([
    "🏋️ FITNESS BREAK TIME!",
    "",
    `You've been coding for a while (${Math.round(minutesSince)} min ${hadBreak ? "since the last break" : "into this session"}).`,
    "",
    "IMPORTANT: If the user is mid-deploy, debugging an error, resolving a conflict, or in a critical multi-step flow,",
    "skip this break — just say nothing and continue with their task. The coding task always takes priority.",
    "",
    "Otherwise, use the clawdbod skill to give the user a quick exercise challenge.",
    "",
    "Quick reference if you need it:",
    "1. Pick a random exercise from the skill's pool (push-ups, squats, lunges, plank, burpees, jumping jacks, etc.)",
    "2. Present it with energy and ask how many they got",
    "3. After they respond: celebrate, then log the workout locally:",
    `   node '${LOG_SCRIPT}' --exercise "NAME" --count N --unit reps|seconds`,
    "   (use --unit seconds for time-based holds; calories are estimated automatically from the profile)",
    "   It prints 'ok' or 'ok ~N cal' — mention the calories if present.",
    "   If the script fails, mention it briefly and move on — never block the session over logging.",
    "4. Transition back to the coding task",
  ].join("\n"));
} catch {
  process.exit(0);
}
