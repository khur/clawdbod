import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "export-workouts.mjs");

const ENTRIES = [
  { ts: "2026-06-10T14:30:00.000Z", exercise: "Push-ups", unit: "reps", count: 25, calories: 5.0 },
  { ts: "2026-06-10T18:00:00.000Z", exercise: "Plank hold", unit: "seconds", count: 45, calories: null },
  { ts: "2026-06-11T09:15:00.000Z", exercise: "Air squats", unit: "reps", count: 40, calories: 6.5 },
];

function seed(dir, lines) {
  writeFileSync(join(dir, "workouts.jsonl"), lines.join("\n") + "\n");
}

function run(args) {
  return execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
}

test("exports CSV with header and one row per entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, ENTRIES.map((e) => JSON.stringify(e)));
  const out = join(dir, "out.csv");
  const stdout = run(["--data-dir", dir, "--out", out]);
  const lines = readFileSync(out, "utf-8").trim().split("\n");
  assert.equal(lines[0], "date,time,exercise,unit,count,calories");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].includes("Push-ups"));
  assert.ok(lines[2].includes("seconds"));
  assert.ok(stdout.includes("Exported 3 workouts"));
});

test("exports JSON with totals (reps exclude time-based entries)", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, ENTRIES.map((e) => JSON.stringify(e)));
  const out = join(dir, "out.json");
  run(["--data-dir", dir, "--format", "json", "--out", out]);
  const data = JSON.parse(readFileSync(out, "utf-8"));
  assert.equal(data.workouts.length, 3);
  assert.equal(data.totals.sets, 3);
  assert.equal(data.totals.reps, 65);
  assert.equal(data.totals.calories, 11.5);
  assert.ok(!Number.isNaN(Date.parse(data.exported_at)));
});

test("empty or missing log exits 0 without writing a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  const out = join(dir, "out.csv");
  const stdout = run(["--data-dir", dir, "--out", out]);
  assert.ok(stdout.includes("No workouts logged yet"));
  assert.ok(!existsSync(out));
});

test("skips malformed lines and reports them", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, [JSON.stringify(ENTRIES[0]), "{not json", JSON.stringify(ENTRIES[2])]);
  const out = join(dir, "out.csv");
  const stdout = run(["--data-dir", dir, "--out", out]);
  assert.ok(stdout.includes("Exported 2 workouts"));
  assert.ok(stdout.includes("skipped 1 malformed line"));
});

test("escapes CSV fields containing commas and quotes", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, [JSON.stringify({ ts: "2026-06-10T14:30:00.000Z", exercise: 'Lunges, "deep"', unit: "reps", count: 10, calories: null })]);
  const out = join(dir, "out.csv");
  run(["--data-dir", dir, "--out", out]);
  const csv = readFileSync(out, "utf-8");
  assert.ok(csv.includes('"Lunges, ""deep"""'));
});

test("entries with a missing or invalid ts are skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, [
    JSON.stringify(ENTRIES[0]),
    JSON.stringify({ exercise: "Burpees", unit: "reps", count: 15, calories: 4.8 }),
  ]);
  const out = join(dir, "out.csv");
  const stdout = run(["--data-dir", dir, "--out", out]);
  assert.ok(stdout.includes("Exported 1 workouts"));
  assert.ok(stdout.includes("skipped 1 malformed line"));
});

test("all-malformed log reports skips instead of an empty message", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-export-"));
  seed(dir, ["{not json", "also not json"]);
  const out = join(dir, "out.csv");
  const stdout = run(["--data-dir", dir, "--out", out]);
  assert.ok(stdout.includes("skipped 2 malformed lines"));
  assert.ok(!existsSync(out));
});
