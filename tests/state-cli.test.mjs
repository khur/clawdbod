import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "state.mjs");
const run = (args) => execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8" }).trim();
const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-statecli-"));

test("pause without minutes is indefinite; resume clears it", () => {
  const dir = tmp();
  assert.equal(run(["pause", "--data-dir", dir]), "paused indefinitely");
  assert.equal(JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")).pausedUntil, -1);
  assert.equal(run(["resume", "--data-dir", dir]), "resumed");
  assert.equal(run(["resume", "--data-dir", dir]), "not_paused");
  assert.equal("pausedUntil" in JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")), false);
});

test("pause with minutes sets a future timestamp and reports local time", () => {
  const dir = tmp();
  const out = run(["pause", "30", "--data-dir", dir]);
  assert.match(out, /^paused until \d/);
  const until = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")).pausedUntil;
  assert.ok(until > Date.now() + 29 * 60 * 1000 && until <= Date.now() + 30 * 60 * 1000 + 1000);
});

test("pause rejects bad minutes", () => {
  assert.throws(() => run(["pause", "0", "--data-dir", tmp()]), /error: minutes/);
  assert.throws(() => run(["pause", "abc", "--data-dir", tmp()]), /error: minutes/);
});

test("status shows defaults when nothing exists", () => {
  const out = run(["status", "--data-dir", tmp()]);
  assert.match(out, /Config:\s+defaults \(every 8 prompts, 20 min cooldown\) — no config file/);
  assert.match(out, /Profile:\s+not set/);
  assert.match(out, /Workout log:\s+none yet/);
  assert.match(out, /Breaks:\s+active/);
});

test("status reflects config, profile, log, and pause", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), JSON.stringify({ promptsBetweenBreaks: 12, minMinutesBetweenBreaks: 30, profile: { height_inches: 76, weight_lbs: 265, age: 40, gender: "male" } }));
  writeFileSync(join(dir, "workouts.jsonl"), JSON.stringify({ ts: "2026-06-12T09:00:00.000Z", exercise: "Push-ups", unit: "reps", count: 25, calories: 5 }) + "\n");
  run(["pause", "--data-dir", dir]);
  const out = run(["status", "--data-dir", dir]);
  assert.match(out, /Config:\s+ok \(every 12 prompts, 30 min cooldown\)/);
  assert.match(out, /Profile:\s+set \(6'4", 265 lbs, 40, male\)/);
  assert.match(out, /Workout log:\s+1 set recorded/);
  assert.match(out, /Breaks:\s+paused indefinitely/);
  assert.match(out, new RegExp(`Data:\\s+${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(local only\\)`));
});

test("unknown subcommand exits 1", () => {
  assert.throws(() => run(["dance", "--data-dir", tmp()]), /usage:/);
});
