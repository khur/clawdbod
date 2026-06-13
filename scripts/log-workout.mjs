#!/usr/bin/env node

// Appends one validated workout entry to workouts.jsonl in the ClawdBod data
// directory (~/.claude/clawdbod). Replaces the old Supabase log-reps call —
// no network involved.
//
// Usage:
//   node log-workout.mjs --exercise "Push-ups" --count 25
//     [--unit reps|seconds] [--calories 5.0|null] [--data-dir /override/for/tests]
// --calories accepts the literal string "null" (treated as no estimate).

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

const dataDir = args["data-dir"] || join(homedir(), ".claude", "clawdbod");

const exercise = (args.exercise || "").trim();
const count = Number.parseInt(args.count, 10);
const unit = args.unit === "seconds" ? "seconds" : "reps";
const calories =
  args.calories === undefined || args.calories === "null"
    ? null
    : Number.parseFloat(args.calories);

if (!exercise) {
  console.error("error: --exercise is required");
  process.exit(1);
}
if (!Number.isInteger(count) || count <= 0) {
  console.error("error: --count must be a positive integer");
  process.exit(1);
}
if (calories !== null && (!Number.isFinite(calories) || calories < 0)) {
  console.error("error: --calories must be a non-negative number");
  process.exit(1);
}
if (args.unit !== undefined && args.unit !== "reps" && args.unit !== "seconds") {
  console.error("error: --unit must be reps or seconds");
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const entry = { ts: new Date().toISOString(), exercise, unit, count, calories };
appendFileSync(join(dataDir, "workouts.jsonl"), JSON.stringify(entry) + "\n");
console.log("ok");
