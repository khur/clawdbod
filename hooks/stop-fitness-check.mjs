#!/usr/bin/env node

/**
 * clawdbod Stop hook
 *
 * Fires every time Claude finishes responding.
 * Tracks prompt count via a temp file and decides whether to block
 * Claude from stopping so it can inject a fitness challenge.
 *
 * Returning { "decision": "block", "reason": "..." } prevents Claude
 * from stopping and feeds the reason back as context, which the
 * clawdbod skill then picks up to run the interactive challenge.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Wrap everything — a hook crash should never break the user's session
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const STATE_DIR = join(tmpdir(), "clawdbod");
  const STATE_FILE = join(STATE_DIR, "state.json");

  // Ensure state directory exists
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  // --- Config -----------------------------------------------------------
  // Priority: env vars > config.json > defaults
  const defaults = { promptsBetweenBreaks: 8, minMinutesBetweenBreaks: 20 };

  let fileConfig = {};
  const configPath = join(__dirname, "..", "config.json");
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      // bad config file, use defaults
    }
  }

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const PROMPTS_BETWEEN_BREAKS = clamp(
    parseInt(process.env.CLAWDBOD_PROMPTS, 10) ||
      fileConfig.promptsBetweenBreaks ||
      defaults.promptsBetweenBreaks,
    1,
    1000
  );

  const MIN_MINUTES_BETWEEN_BREAKS = clamp(
    parseInt(process.env.CLAWDBOD_MINUTES, 10) ||
      fileConfig.minMinutesBetweenBreaks ||
      defaults.minMinutesBetweenBreaks,
    1,
    1440
  );
  // ----------------------------------------------------------------------

  // Read stdin safely
  let input;
  try {
    input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } catch {
    process.exit(0);
  }

  // If we already blocked once (stop_hook_active), don't loop forever
  if (input.stop_hook_active) {
    process.exit(0);
  }

  // Load or init state
  let state = {
    promptCount: 0,
    lastBreakAt: 0,
    setupComplete: false,
  };
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      if (typeof raw === "object" && raw !== null) {
        state = { ...state, ...raw };
      }
    } catch {
      // corrupted file, reset
    }
  }

  function saveState() {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  // --- First-run setup ---------------------------------------------------
  if (!state.setupComplete) {
    state.setupComplete = true;
    state.lastBreakAt = Date.now();
    saveState();

    const leaderboardNote = fileConfig.leaderboard
      ? ""
      : [
          "",
          "Also mention they can opt into the global leaderboard:",
          "  /clawdbod:config leaderboard on",
        ].join("\n");

    const result = {
      decision: "block",
      reason: [
        "🏋️ CLAWDBOD SETUP",
        "",
        "This is the first time ClawdBod is running in this session.",
        "",
        "Use the clawdbod skill to walk the user through setup.",
        "Show them the current config and ask if they want to customize:",
        `  - Prompts between breaks: ${PROMPTS_BETWEEN_BREAKS}`,
        `  - Minutes between breaks: ${MIN_MINUTES_BETWEEN_BREAKS}`,
        "",
        "If they want to change anything, update the config file at:",
        `  ${configPath}`,
        "",
        "If they're happy with defaults, just confirm and move on.",
        "Keep it brief — don't interrupt their flow for long.",
        leaderboardNote,
      ].join("\n"),
    };

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
  // -----------------------------------------------------------------------

  state.promptCount += 1;

  const now = Date.now();
  const minutesSinceLastBreak = (now - state.lastBreakAt) / 1000 / 60;
  const shouldBreak =
    state.promptCount >= PROMPTS_BETWEEN_BREAKS &&
    minutesSinceLastBreak >= MIN_MINUTES_BETWEEN_BREAKS;

  if (shouldBreak) {
    state.promptCount = 0;
    state.lastBreakAt = now;
    saveState();

    const result = {
      decision: "block",
      reason: [
        "🏋️ FITNESS BREAK TIME!",
        "",
        `You've been coding for a while (${Math.round(minutesSinceLastBreak)} min since last break).`,
        "",
        "Use the clawdbod skill to give the user a quick exercise challenge.",
        "Pick a random exercise and ask them how many reps they can do before they quit.",
        "Wait for their response, cheer them on, log the reps, then continue with the task.",
      ].join("\n"),
    };

    process.stdout.write(JSON.stringify(result));
  } else {
    saveState();
    process.exit(0);
  }
} catch {
  // If anything goes wrong, exit silently — never break the user's session
  process.exit(0);
}
