#!/usr/bin/env node

// Prints workout history and totals from the local log, ready to display.
//
// Usage:
//   node stats.mjs [--limit N] [--since today|<ISO date>] [--json] [--data-dir DIR]
//
// Default: last 20 entries (max 100), newest first, totals over the whole log.
// --since today  → only today's entries (local time), used for the session summary.

import { dataDir as resolveDataDir } from "./lib/paths.mjs";
import { readWorkouts, totals as computeTotals, EMPTY_MSG } from "./lib/workouts.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dataDir = resolveDataDir(args["data-dir"]);
const limit = Math.min(100, Math.max(1, Number.parseInt(args.limit, 10) || 20));

let since = null;
let sinceLabel = null;
if (args.since !== undefined) {
  if (args.since === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    since = d.getTime();
    sinceLabel = "Today";
  } else {
    since = Date.parse(String(args.since));
    if (Number.isNaN(since)) {
      console.error("error: --since must be 'today' or an ISO date");
      process.exit(1);
    }
    sinceLabel = `Since ${String(args.since)}`;
  }
}

const { exists, workouts: all } = readWorkouts(dataDir);
const scoped = since === null ? all : all.filter((e) => Date.parse(e.ts) >= since);

if (!exists || all.length === 0) {
  console.log(EMPTY_MSG);
  process.exit(0);
}
if (scoped.length === 0) {
  console.log(sinceLabel === "Today"
    ? "No workouts logged today yet — /clawdbod:fitness to start."
    : `No workouts logged ${sinceLabel.toLowerCase()}.`);
  process.exit(0);
}

const totals = computeTotals(scoped);
const shown = scoped.slice(-limit).reverse();

if (args.json) {
  console.log(JSON.stringify({ totals, shown: shown.length, of: scoped.length, workouts: shown }, null, 2));
  process.exit(0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (ts) => {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")}`;
};
const fmtCount = (e) => `${e.count}${e.unit === "seconds" ? "s" : ""}`;
const fmtCal = (e) => (e.calories === null || e.calories === undefined ? "-" : Number(e.calories).toFixed(1));

const rows = shown.map((e) => [fmtDate(e.ts), e.exercise, fmtCount(e), fmtCal(e)]);
const header = ["Date", "Exercise", "Count", "Cal"];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) =>
  [r[0].padEnd(widths[0]), r[1].padEnd(widths[1]), r[2].padStart(widths[2]), r[3].padStart(widths[3])].join("  ");

const out = [];
out.push(`${sinceLabel ? sinceLabel + " — " : ""}Sets: ${totals.sets}   Reps: ${totals.reps}   Calories: ${totals.calories}`);
if (shown.length < scoped.length) out.push(`Showing last ${shown.length} of ${scoped.length} — /clawdbod:export for everything`);
out.push("");
out.push(line(header));
for (const r of rows) out.push(line(r));
console.log(out.join("\n"));
