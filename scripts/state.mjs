#!/usr/bin/env node

// Pause / resume fitness breaks and print a local status report.
//
// Usage:
//   node state.mjs pause [minutes] [--data-dir DIR]   → "paused indefinitely" | "paused until <time>"
//   node state.mjs resume          [--data-dir DIR]   → "resumed" | "not_paused"
//   node state.mjs status          [--data-dir DIR]   → multi-line status block
//
// Pause is global (all sessions). Cadence counters are per session and are
// not touched here.

import { homedir } from "os";
import { dataDir as resolveDataDir, readConfig } from "./lib/paths.mjs";
import { readGlobalState, writeGlobalState, isPaused } from "./lib/state.mjs";
import { readWorkouts } from "./lib/workouts.mjs";

const argv = process.argv.slice(2);
const positional = [];
let dataDirArg;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--data-dir") {
    dataDirArg = argv[++i];
  } else {
    positional.push(argv[i]);
  }
}
const [cmd, arg] = positional;
const dataDir = resolveDataDir(dataDirArg);

const USAGE = "usage: state.mjs pause [minutes] | resume | status";
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function pause() {
  let until = -1;
  if (arg !== undefined) {
    const minutes = Number.parseInt(arg, 10);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
      console.error("error: minutes must be a positive integer (max 10080)");
      process.exit(1);
    }
    until = Date.now() + minutes * 60 * 1000;
  }
  const state = readGlobalState(dataDir);
  writeGlobalState(dataDir, { ...state, pausedUntil: until });
  console.log(until === -1 ? "paused indefinitely" : `paused until ${fmtTime(until)}`);
}

function resume() {
  const state = readGlobalState(dataDir);
  const wasPaused = "pausedUntil" in state;
  delete state.pausedUntil;
  writeGlobalState(dataDir, state);
  console.log(wasPaused ? "resumed" : "not_paused");
}

function describeProfile(p) {
  if (!p) return "not set";
  const parts = [];
  if (Number.isFinite(p.height_inches)) parts.push(`${Math.floor(p.height_inches / 12)}'${p.height_inches % 12}"`);
  if (Number.isFinite(p.weight_lbs)) parts.push(`${p.weight_lbs} lbs`);
  if (Number.isFinite(p.age)) parts.push(String(p.age));
  if (typeof p.gender === "string" && p.gender) parts.push(p.gender);
  return parts.length ? `set (${parts.join(", ")})` : "set";
}

function status() {
  const cfg = readConfig(dataDir);
  const state = readGlobalState(dataDir);
  const { workouts } = readWorkouts(dataDir);
  const cadence = `every ${cfg.promptsBetweenBreaks} prompts, ${cfg.minMinutesBetweenBreaks} min cooldown`;
  const configLine = cfg.exists ? `ok (${cadence})` : `defaults (${cadence}) — no config file`;
  const logLine = workouts.length === 0 ? "none yet" : `${workouts.length} set${workouts.length === 1 ? "" : "s"} recorded`;
  let breaks = "active";
  if (isPaused(state)) breaks = state.pausedUntil === -1 ? "paused indefinitely" : `paused until ${fmtTime(state.pausedUntil)}`;
  const shownDir = dataDir.startsWith(homedir()) ? dataDir.replace(homedir(), "~") : dataDir;
  console.log([
    "ClawdBod Status",
    "",
    `  Config:       ${configLine}`,
    `  Profile:      ${describeProfile(cfg.profile)}`,
    `  Workout log:  ${logLine}`,
    `  Breaks:       ${breaks}`,
    `  Data:         ${shownDir} (local only)`,
  ].join("\n"));
}

switch (cmd) {
  case "pause": pause(); break;
  case "resume": resume(); break;
  case "status": status(); break;
  default:
    console.error(USAGE);
    process.exit(1);
}
