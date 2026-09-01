import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkouts, totals, appendWorkout, EMPTY_MSG } from "../scripts/lib/workouts.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-workouts-"));

test("readWorkouts reports missing log", () => {
  assert.deepEqual(readWorkouts(tmp()), { exists: false, workouts: [], skipped: 0 });
});

test("readWorkouts keeps valid lines and counts malformed ones", () => {
  const dir = tmp();
  writeFileSync(join(dir, "workouts.jsonl"), [
    JSON.stringify({ ts: "2026-06-12T10:00:00.000Z", exercise: "Push-ups", unit: "reps", count: 25, calories: 5 }),
    "{not json",
    JSON.stringify({ ts: "nope", exercise: "Squats", unit: "reps", count: 10, calories: null }),
    JSON.stringify({ ts: "2026-06-12T11:00:00.000Z", exercise: "Plank hold", unit: "seconds", count: 45, calories: null }),
    "",
  ].join("\n"));
  const r = readWorkouts(dir);
  assert.equal(r.exists, true);
  assert.equal(r.workouts.length, 2);
  assert.equal(r.skipped, 2);
});

test("totals sums reps only for rep-based entries and rounds calories", () => {
  const t = totals([
    { unit: "reps", count: 25, calories: 5.04 },
    { unit: "seconds", count: 45, calories: 2.81 },
    { unit: "reps", count: 10, calories: null },
  ]);
  assert.deepEqual(t, { sets: 3, reps: 35, calories: 7.9 });
  assert.deepEqual(totals([]), { sets: 0, reps: 0, calories: 0 });
});

test("appendWorkout creates the dir and appends one JSON line", () => {
  const dir = join(tmp(), "nested");
  appendWorkout(dir, { ts: "2026-06-12T10:00:00.000Z", exercise: "Push-ups", unit: "reps", count: 1, calories: null });
  appendWorkout(dir, { ts: "2026-06-12T10:01:00.000Z", exercise: "Push-ups", unit: "reps", count: 2, calories: null });
  const lines = readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).count, 2);
});

test("EMPTY_MSG is the shared copy", () => {
  assert.equal(EMPTY_MSG, "No workouts logged yet — take a break with /clawdbod:fitness first.");
});
