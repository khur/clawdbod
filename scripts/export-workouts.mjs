#!/usr/bin/env node

// Exports the local workout log (~/.claude/clawdbod/workouts.jsonl) to a CSV
// or JSON file.
//
// Usage:
//   node export-workouts.mjs [--format csv|json] [--out /path/to/file]
//     [--data-dir /override/for/tests]
//
// Defaults: CSV format, ./clawdbod-export-YYYY-MM-DD.csv in the current
// working directory.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
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
const format = args.format === "json" ? "json" : "csv";
const logPath = join(dataDir, "workouts.jsonl");

const EMPTY_MSG = "No workouts logged yet — take a break with /clawdbod:fitness first.";

if (!existsSync(logPath)) {
  console.log(EMPTY_MSG);
  process.exit(0);
}

const lines = readFileSync(logPath, "utf-8").split("\n").filter((l) => l.trim() !== "");
const workouts = [];
let skipped = 0;
for (const line of lines) {
  try {
    const e = JSON.parse(line);
    if (typeof e.exercise === "string" && Number.isInteger(e.count)) workouts.push(e);
    else skipped++;
  } catch {
    skipped++;
  }
}

if (workouts.length === 0) {
  console.log(EMPTY_MSG);
  process.exit(0);
}

const totals = {
  sets: workouts.length,
  reps: workouts.filter((e) => e.unit !== "seconds").reduce((sum, e) => sum + e.count, 0),
  calories: Math.round(workouts.reduce((sum, e) => sum + (e.calories ?? 0), 0) * 10) / 10,
};

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const outPath = resolve(args.out || `clawdbod-export-${localDate(new Date())}.${format}`);

let content;
if (format === "csv") {
  const rows = [["date", "time", "exercise", "unit", "count", "calories"]];
  for (const e of workouts) {
    const d = new Date(e.ts);
    rows.push([localDate(d), localTime(d), e.exercise, e.unit ?? "reps", e.count, e.calories]);
  }
  content = rows.map((r) => r.map(csvField).join(",")).join("\n") + "\n";
} else {
  content = JSON.stringify({ exported_at: new Date().toISOString(), totals, workouts }, null, 2) + "\n";
}

writeFileSync(outPath, content);
const skippedNote = skipped > 0 ? ` (skipped ${skipped} malformed line${skipped === 1 ? "" : "s"})` : "";
console.log(`Exported ${workouts.length} workouts to ${outPath}${skippedNote}`);
console.log(`Totals: ${totals.sets} sets, ${totals.reps} reps, ${totals.calories} cal`);
