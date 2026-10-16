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

import { writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { dataDir as resolveDataDir } from "./lib/paths.mjs";
import { readWorkouts, totals as computeTotals, EMPTY_MSG } from "./lib/workouts.mjs";

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
const format = args.format === "json" ? "json" : "csv";
const { exists, workouts, skipped } = readWorkouts(dataDir);

if (!exists) {
  console.log(EMPTY_MSG);
  process.exit(0);
}

if (workouts.length === 0) {
  console.log(
    skipped > 0
      ? `No valid workouts found — skipped ${skipped} malformed line${skipped === 1 ? "" : "s"} in ${join(dataDir, "workouts.jsonl")}`
      : EMPTY_MSG
  );
  process.exit(0);
}

const totals = computeTotals(workouts);

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content);
} catch (err) {
  console.error(`error: couldn't write ${outPath} (${err.code ?? err.message})`);
  process.exit(1);
}
const skippedNote = skipped > 0 ? ` (skipped ${skipped} malformed line${skipped === 1 ? "" : "s"})` : "";
console.log(`Exported ${workouts.length} workouts to ${outPath}${skippedNote}`);
console.log(`Totals: ${totals.sets} sets, ${totals.reps} reps, ${totals.calories} cal`);
