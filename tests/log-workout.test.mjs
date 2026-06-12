import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "log-workout.mjs");

function run(args, opts = {}) {
  return execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8", ...opts });
}

test("appends a valid reps entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  const out = run(["--exercise", "Push-ups", "--count", "25", "--calories", "5.0", "--data-dir", dir]);
  assert.equal(out.trim(), "ok");
  const lines = readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim().split("\n");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.exercise, "Push-ups");
  assert.equal(entry.unit, "reps");
  assert.equal(entry.count, 25);
  assert.equal(entry.calories, 5.0);
  assert.ok(!Number.isNaN(Date.parse(entry.ts)));
});

test("supports seconds unit and null calories", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  run(["--exercise", "Plank hold", "--count", "45", "--unit", "seconds", "--data-dir", dir]);
  const entry = JSON.parse(readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim());
  assert.equal(entry.unit, "seconds");
  assert.equal(entry.calories, null);
});

test("appends to an existing log", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  run(["--exercise", "Push-ups", "--count", "10", "--data-dir", dir]);
  run(["--exercise", "Air squats", "--count", "20", "--data-dir", dir]);
  const lines = readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).exercise, "Air squats");
});

test("rejects missing exercise", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  assert.throws(() => run(["--count", "10", "--data-dir", dir]));
  assert.ok(!existsSync(join(dir, "workouts.jsonl")));
});

test("rejects non-positive or non-numeric count", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  assert.throws(() => run(["--exercise", "Push-ups", "--count", "0", "--data-dir", dir]));
  assert.throws(() => run(["--exercise", "Push-ups", "--count", "abc", "--data-dir", dir]));
  assert.ok(!existsSync(join(dir, "workouts.jsonl")));
});

test("rejects negative calories", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  assert.throws(() => run(["--exercise", "Push-ups", "--count", "10", "--calories", "-2", "--data-dir", dir]));
});
