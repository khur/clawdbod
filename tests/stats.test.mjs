import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "stats.mjs");
const run = (args) => execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-stats-"));

function seed(dir, entries) {
  writeFileSync(join(dir, "workouts.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

const iso = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();
const DAY = 24 * 3600 * 1000;

test("empty log prints the shared message", () => {
  const out = run(["--data-dir", tmp()]);
  assert.equal(out.trim(), "No workouts logged yet — take a break with /clawdbod:fitness first.");
});

test("prints totals, table newest-first, seconds suffix, and dash for null calories", () => {
  const dir = tmp();
  seed(dir, [
    { ts: "2026-06-10T09:00:00.000Z", exercise: "Burpees", unit: "reps", count: 15, calories: 4.8 },
    { ts: "2026-06-11T09:00:00.000Z", exercise: "Plank hold", unit: "seconds", count: 45, calories: null },
    { ts: "2026-06-12T09:00:00.000Z", exercise: "Push-ups", unit: "reps", count: 25, calories: 5.0 },
  ]);
  const out = run(["--data-dir", dir]);
  assert.match(out, /Sets: 3\s+Reps: 40\s+Calories: 9\.8/);
  const rows = out.trim().split("\n").filter((l) => /^(Jun|May)/.test(l));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /^Jun 12\s+Push-ups\s+25\s+5\.0$/);
  assert.match(rows[1], /^Jun 11\s+Plank hold\s+45s\s+-$/);
  assert.match(rows[2], /^Jun 10\s+Burpees\s+15\s+4\.8$/);
  assert.doesNotMatch(out, /Showing last/);
});

test("--limit truncates and notes it; totals still cover the whole log", () => {
  const dir = tmp();
  seed(dir, Array.from({ length: 5 }, (_, i) => ({
    ts: `2026-06-0${i + 1}T09:00:00.000Z`, exercise: "Air squats", unit: "reps", count: 10, calories: 1,
  })));
  const out = run(["--data-dir", dir, "--limit", "2"]);
  assert.match(out, /Sets: 5\s+Reps: 50\s+Calories: 5/);
  assert.match(out, /Showing last 2 of 5 — \/clawdbod:export for everything/);
  assert.equal(out.trim().split("\n").filter((l) => l.startsWith("Jun")).length, 2);
});

test("--since today filters to today's entries and labels the block", () => {
  const dir = tmp();
  seed(dir, [
    { ts: iso(3 * DAY), exercise: "Burpees", unit: "reps", count: 15, calories: 4.8 },
    { ts: iso(60 * 1000), exercise: "Push-ups", unit: "reps", count: 20, calories: 4.0 },
  ]);
  const out = run(["--data-dir", dir, "--since", "today"]);
  assert.match(out, /^Today\b/);
  assert.match(out, /Sets: 1\s+Reps: 20\s+Calories: 4/);
  assert.doesNotMatch(out, /Burpees/);
});

test("--since today with nothing today says so", () => {
  const dir = tmp();
  seed(dir, [{ ts: iso(3 * DAY), exercise: "Burpees", unit: "reps", count: 15, calories: 4.8 }]);
  assert.equal(run(["--data-dir", dir, "--since", "today"]).trim(), "No workouts logged today yet — /clawdbod:fitness to start.");
});

test("--json emits totals and entries", () => {
  const dir = tmp();
  seed(dir, [{ ts: "2026-06-12T09:00:00.000Z", exercise: "Push-ups", unit: "reps", count: 25, calories: 5.0 }]);
  const j = JSON.parse(run(["--data-dir", dir, "--json"]));
  assert.deepEqual(j.totals, { sets: 1, reps: 25, calories: 5 });
  assert.equal(j.workouts.length, 1);
  assert.equal(j.shown, 1);
});

test("bad --since exits 1", () => {
  assert.throws(() => run(["--data-dir", tmp(), "--since", "yesterday-ish"]), /error: --since/);
});
