#!/usr/bin/env node

// Appends one validated workout entry to workouts.jsonl in the ClawdBod data
// directory (~/.claude/clawdbod). No network involved.
//
// Usage:
//   node log-workout.mjs --exercise "Push-ups" --count 25
//     [--unit reps|seconds] [--calories 5.0|null] [--data-dir /override/for/tests]
//
// When --calories is omitted, calories are estimated from the profile weight in
// config.json (same data dir). "--calories null" forces no estimate.
// Prints "ok" or "ok ~N cal".

import { dataDir as resolveDataDir, readConfig } from "./lib/paths.mjs";
import { estimateCalories } from "./lib/exercises.mjs";
import { appendWorkout } from "./lib/workouts.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dataDir = resolveDataDir(args["data-dir"]);

const exercise = (args.exercise || "").trim();
// Whole numbers only — parseInt would quietly turn "25.7" into 25 and "1e3" into 1.
const count = /^\d+$/.test(String(args.count ?? "").trim()) ? Number(args.count) : NaN;
const unit = args.unit === "seconds" ? "seconds" : "reps";

if (!exercise) {
  console.error("error: --exercise is required");
  process.exit(1);
}
if (!Number.isInteger(count) || count <= 0 || count > 10000) {
  console.error("error: --count must be a whole number from 1 to 10000");
  process.exit(1);
}
if (args.unit !== undefined && args.unit !== "reps" && args.unit !== "seconds") {
  console.error("error: --unit must be reps or seconds");
  process.exit(1);
}

let calories;
if (args.calories === undefined) {
  const { profile } = readConfig(dataDir);
  calories = estimateCalories({ exercise, unit, count, weightLbs: profile?.weight_lbs });
} else if (args.calories === "null") {
  calories = null;
} else {
  calories = Number.parseFloat(args.calories);
  if (!Number.isFinite(calories) || calories < 0) {
    console.error("error: --calories must be a non-negative number");
    process.exit(1);
  }
}

appendWorkout(dataDir, { ts: new Date().toISOString(), exercise, unit, count, calories });
console.log(calories === null ? "ok" : `ok ~${calories} cal`);
