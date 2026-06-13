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
 *
 * User data (config + workout log) lives in ~/.claude/clawdbod/ so it
 * survives plugin updates. Session cadence state lives in the OS tmpdir.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir, homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Wrap everything — a hook crash should never break the user's session
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_ROOT = join(__dirname, "..");
  const DATA_DIR = join(homedir(), ".claude", "clawdbod");
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
  const configPath = join(DATA_DIR, "config.json");
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
    state.lastBreakAt = 0; // Don't start cooldown — let first break trigger on prompt count alone
    saveState();

    const profileNote = fileConfig.profile
      ? ""
      : [
          "",
          "Also mention they can set up a profile for calorie estimates:",
          "  /clawdbod:setup",
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
        profileNote,
      ].join("\n"),
    };

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
  // -----------------------------------------------------------------------

  // --- Pause check -------------------------------------------------------
  if (state.pausedUntil) {
    const pauseExpiry = state.pausedUntil;
    if (pauseExpiry === -1 || pauseExpiry > Date.now()) {
      // Still paused — skip break logic, still count prompts
      state.promptCount += 1;
      saveState();
      process.exit(0);
    }
    // Pause expired — clear it and continue
    delete state.pausedUntil;
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
        "IMPORTANT: If the user is mid-deploy, debugging an error, resolving a conflict, or in a critical multi-step flow,",
        "skip this break — just say nothing and continue with their task. The coding task always takes priority.",
        "",
        "Otherwise, use the clawdbod skill to give the user a quick exercise challenge.",
        "",
        "Quick reference if you need it:",
        `1. Read ${configPath} for break settings and profile`,
        "2. Pick a random exercise (push-ups, squats, lunges, plank, burpees, jumping jacks, etc.)",
        "3. Present it with energy and ask how many they got",
        "4. After they respond: celebrate, estimate calories if profile exists, then log the workout locally:",
        `   node '${join(PLUGIN_ROOT, "scripts", "log-workout.mjs")}' --exercise "NAME" --count N --unit reps|seconds --calories CAL`,
        "   (omit --calories if no profile; use --unit seconds for time-based holds)",
        "   If the script fails, mention it briefly and move on — never block the session over logging.",
        "5. Transition back to the coding task",
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
