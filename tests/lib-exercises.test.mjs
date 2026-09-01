import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { metFor, hasMetPattern, DEFAULT_MET, estimateCalories } from "../scripts/lib/exercises.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("metFor matches most-specific pattern first", () => {
  assert.equal(metFor("Push-ups"), 8.0);
  assert.equal(metFor("Diamond push-ups"), 8.0);
  assert.equal(metFor("Wall push-ups"), 3.5);
  assert.equal(metFor("Desk push-ups"), 3.5);
  assert.equal(metFor("Wrist push-ups"), 8.0);
  assert.equal(metFor("Wrist circles (seconds)"), 1.5);
  assert.equal(metFor("Calf raises"), 3.5);
  assert.equal(metFor("Standing calf raises"), 3.0);
  assert.equal(metFor("Leg raises"), 3.8);
  assert.equal(metFor("Seated leg raises"), 2.5);
  assert.equal(metFor("Air squats"), 5.0);
  assert.equal(metFor("Chair squats"), 4.0);
  assert.equal(metFor("Squat thrusts"), 8.0);
  assert.equal(metFor("Shoulder taps (plank position)"), 4.0);
  assert.equal(metFor("Commandos (plank to push-up)"), 8.0);
  assert.equal(metFor("Plank hold (seconds)"), 3.8);
});

test("metFor is case-insensitive and falls back to DEFAULT_MET", () => {
  assert.equal(metFor("BURPEES"), 8.0);
  assert.equal(metFor("Interpretive dance"), DEFAULT_MET);
  assert.equal(metFor(""), DEFAULT_MET);
  assert.equal(hasMetPattern("Interpretive dance"), false);
  assert.equal(hasMetPattern("Chair squats"), true);
});

test("estimateCalories follows the MET formula and rounds to 0.1", () => {
  // Push-ups: 8.0 × (200 × 0.4536) × (25×3/3600) = 15.12 → 15.1
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: 200 }), 15.1);
  // Plank 60s: 3.8 × 90.72 × (60/3600) = 5.7456 → 5.7
  assert.equal(estimateCalories({ exercise: "Plank hold", unit: "seconds", count: 60, weightLbs: 200 }), 5.7);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: 0 }), null);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: undefined }), null);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: "abc" }), null);
});

test("every exercise in SKILL.md matches a specific MET pattern", () => {
  const skill = readFileSync(join(ROOT, "skills", "clawdbod", "SKILL.md"), "utf-8");
  const poolLines = skill.split("\n").filter((l) => /^\s*\*\*[A-Z][A-Za-z &()-]+:\*\*\s/.test(l) && !l.includes("|"));
  assert.ok(poolLines.length >= 6, `expected pool categories, found ${poolLines.length}`);
  const names = poolLines.flatMap((l) => l.replace(/^\s*\*\*[^*]+\*\*\s*/, "").split(",").map((s) => s.trim())).filter(Boolean);
  assert.ok(names.length >= 50, `expected 50+ exercises, found ${names.length}`);
  const unmatched = names.filter((n) => !hasMetPattern(n));
  assert.deepEqual(unmatched, [], `no MET pattern for: ${unmatched.join(", ")}`);
});
