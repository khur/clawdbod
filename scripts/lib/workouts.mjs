// Read/append the append-only workout log (workouts.jsonl) and compute totals.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export const EMPTY_MSG = "No workouts logged yet — take a break with /clawdbod:fitness first.";

export function logPath(dir) {
  return join(dir, "workouts.jsonl");
}

function isValid(e) {
  return (
    e !== null &&
    typeof e === "object" &&
    typeof e.exercise === "string" &&
    Number.isInteger(e.count) &&
    typeof e.ts === "string" &&
    !Number.isNaN(Date.parse(e.ts))
  );
}

/** Parse the log. Malformed or invalid lines are counted in `skipped`, never thrown. */
export function readWorkouts(dir) {
  const p = logPath(dir);
  if (!existsSync(p)) return { exists: false, workouts: [], skipped: 0 };
  const workouts = [];
  let skipped = 0;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const e = JSON.parse(line);
      if (isValid(e)) workouts.push(e);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { exists: true, workouts, skipped };
}

export function totals(workouts) {
  return {
    sets: workouts.length,
    reps: workouts.filter((e) => e.unit !== "seconds").reduce((s, e) => s + e.count, 0),
    calories: Math.round(workouts.reduce((s, e) => s + (e.calories ?? 0), 0) * 10) / 10,
  };
}

export function appendWorkout(dir, entry) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(logPath(dir), JSON.stringify(entry) + "\n");
}
