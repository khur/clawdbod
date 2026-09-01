# ClawdBod 2.1 — Session State and Script-Backed Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cadence state to per-session files under the data dir, move calories/stats/pause logic into tested Node scripts, and de-duplicate the skill and command markdown.

**Architecture:** A small `scripts/lib/` (paths, state, exercises, workouts) is shared by the Stop hook and four CLI scripts (`log-workout`, `stats`, `state`, `export-workouts`). Command markdown files shrink to "run script, relay output". The hook keeps its decision logic but reads/writes `~/.claude/clawdbod/state.json` (global) and `~/.claude/clawdbod/sessions/<id>.json` (per session).

**Tech Stack:** Node 22 ESM, `node:test`, no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-session-state-and-scripts-design.md`

## Global Constraints

- Node ≥ 22, ESM (`.mjs`), zero npm dependencies.
- Data dir is `~/.claude/clawdbod/`, overridable by `--data-dir` (scripts) and `CLAWDBOD_DATA_DIR` env (hook + scripts, test use).
- The hook must never exit non-zero and must print nothing but a valid decision JSON object.
- Cadence clamps: prompts 1–1000, minutes 1–1440. Env `CLAWDBOD_PROMPTS` / `CLAWDBOD_MINUTES` beat config.json beat defaults 8 / 20.
- Calorie formula: `MET × (weight_lbs × 0.4536) × hours`, `hours = count×3/3600` for reps, `count/3600` for seconds, rounded to 0.1. Unknown exercise MET = 4.0.
- Empty-log message everywhere: `No workouts logged yet — take a break with /clawdbod:fitness first.`
- Run tests with `node --test` from repo root.
- Commit after each task with the trailer lines from the session's attribution guidance.

---

### Task 1: `scripts/lib/paths.mjs` — data dir, JSON I/O, config

**Files:**
- Create: `scripts/lib/paths.mjs`
- Test: `tests/lib-paths.test.mjs`

**Interfaces:**
- Produces: `dataDir(override?) → string`, `readJson(path, fallback) → object|fallback`, `writeJson(path, value)` (atomic), `DEFAULTS`, `readConfig(dir) → { exists, promptsBetweenBreaks, minMinutesBetweenBreaks, profile|null }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib-paths.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDir, readJson, writeJson, readConfig, DEFAULTS } from "../scripts/lib/paths.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-paths-"));

test("dataDir prefers override, then env, then home", () => {
  assert.equal(dataDir("/x"), "/x");
  process.env.CLAWDBOD_DATA_DIR = "/y";
  assert.equal(dataDir(), "/y");
  delete process.env.CLAWDBOD_DATA_DIR;
  assert.match(dataDir(), /\.claude\/clawdbod$/);
});

test("readJson returns fallback on missing or malformed file", () => {
  const dir = tmp();
  assert.deepEqual(readJson(join(dir, "nope.json"), { a: 1 }), { a: 1 });
  writeFileSync(join(dir, "bad.json"), "{not json");
  assert.equal(readJson(join(dir, "bad.json"), null), null);
  writeFileSync(join(dir, "arr.json"), "[1,2]");
  assert.deepEqual(readJson(join(dir, "arr.json"), {}), {});
});

test("writeJson creates parent dirs and round-trips", () => {
  const dir = tmp();
  const p = join(dir, "a", "b", "s.json");
  writeJson(p, { hello: "world" });
  assert.deepEqual(JSON.parse(readFileSync(p, "utf-8")), { hello: "world" });
});

test("readConfig applies defaults, clamps, and env overrides", () => {
  const dir = tmp();
  delete process.env.CLAWDBOD_PROMPTS;
  delete process.env.CLAWDBOD_MINUTES;
  let c = readConfig(dir);
  assert.equal(c.exists, false);
  assert.equal(c.promptsBetweenBreaks, DEFAULTS.promptsBetweenBreaks);
  assert.equal(c.profile, null);

  writeFileSync(join(dir, "config.json"), JSON.stringify({ promptsBetweenBreaks: 5000, minMinutesBetweenBreaks: "abc", profile: { weight_lbs: 180 } }));
  c = readConfig(dir);
  assert.equal(c.exists, true);
  assert.equal(c.promptsBetweenBreaks, 1000);
  assert.equal(c.minMinutesBetweenBreaks, DEFAULTS.minMinutesBetweenBreaks);
  assert.deepEqual(c.profile, { weight_lbs: 180 });

  process.env.CLAWDBOD_PROMPTS = "3";
  assert.equal(readConfig(dir).promptsBetweenBreaks, 3);
  delete process.env.CLAWDBOD_PROMPTS;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib-paths.test.mjs`
Expected: FAIL — cannot find module `../scripts/lib/paths.mjs`.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/paths.mjs
// Data-directory resolution, safe JSON I/O, and config loading shared by the
// Stop hook and every CLI script.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export const DEFAULTS = { promptsBetweenBreaks: 8, minMinutesBetweenBreaks: 20 };

/** Resolve the data dir: explicit override > CLAWDBOD_DATA_DIR > ~/.claude/clawdbod */
export function dataDir(override) {
  return override || process.env.CLAWDBOD_DATA_DIR || join(homedir(), ".claude", "clawdbod");
}

/** Parse a JSON object file; any failure (missing, malformed, non-object) returns fallback. */
export function readJson(path, fallback = null) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

/** Write JSON atomically (temp file + rename) and create parent dirs. */
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** First candidate that parses to a positive integer, clamped to [min, max]. */
function pickInt(candidates, min, max) {
  for (const c of candidates) {
    const n = Number.parseInt(c, 10);
    if (Number.isInteger(n) && n > 0) return clamp(n, min, max);
  }
  return min; // unreachable in practice: DEFAULTS is always the last candidate
}

/** Load config.json with env overrides, clamping, and defaults. Never throws. */
export function readConfig(dir) {
  const path = join(dir, "config.json");
  const file = readJson(path, {}) ?? {};
  return {
    exists: existsSync(path),
    promptsBetweenBreaks: pickInt(
      [process.env.CLAWDBOD_PROMPTS, file.promptsBetweenBreaks, DEFAULTS.promptsBetweenBreaks],
      1,
      1000
    ),
    minMinutesBetweenBreaks: pickInt(
      [process.env.CLAWDBOD_MINUTES, file.minMinutesBetweenBreaks, DEFAULTS.minMinutesBetweenBreaks],
      1,
      1440
    ),
    profile: file.profile !== null && typeof file.profile === "object" ? file.profile : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib-paths.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/paths.mjs tests/lib-paths.test.mjs
git commit -m "feat(lib): paths — data dir, atomic JSON, clamped config"
```

---

### Task 2: `scripts/lib/state.mjs` — global + per-session state

**Files:**
- Create: `scripts/lib/state.mjs`
- Test: `tests/lib-state.test.mjs`

**Interfaces:**
- Consumes: `readJson`, `writeJson` from Task 1.
- Produces: `readGlobalState(dir) → { onboarded, pausedUntil? }`, `writeGlobalState(dir, state)`, `isPaused(state, now?) → bool`, `sessionPath(dir, id)`, `readSession(dir, id) → { promptCount, lastBreakAt }`, `writeSession(dir, id, session)`, `pruneSessions(dir, maxAgeMs?, now?) → number`, `SESSION_MAX_AGE_MS`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib-state.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, utimesSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readGlobalState, writeGlobalState, isPaused,
  readSession, writeSession, sessionPath, pruneSessions,
} from "../scripts/lib/state.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-state-"));

test("global state defaults and round-trips", () => {
  const dir = tmp();
  assert.deepEqual(readGlobalState(dir), { onboarded: false });
  writeGlobalState(dir, { onboarded: true, pausedUntil: -1 });
  assert.deepEqual(readGlobalState(dir), { onboarded: true, pausedUntil: -1 });
});

test("isPaused handles indefinite, future, expired, and unset", () => {
  const now = 1_000_000;
  assert.equal(isPaused({ pausedUntil: -1 }, now), true);
  assert.equal(isPaused({ pausedUntil: now + 1 }, now), true);
  assert.equal(isPaused({ pausedUntil: now - 1 }, now), false);
  assert.equal(isPaused({}, now), false);
  assert.equal(isPaused({ pausedUntil: "soon" }, now), false);
});

test("session state is isolated per id and ids are sanitised", () => {
  const dir = tmp();
  assert.deepEqual(readSession(dir, "a"), { promptCount: 0, lastBreakAt: 0 });
  writeSession(dir, "a", { promptCount: 3, lastBreakAt: 5 });
  writeSession(dir, "b", { promptCount: 1, lastBreakAt: 0 });
  assert.equal(readSession(dir, "a").promptCount, 3);
  assert.equal(readSession(dir, "b").promptCount, 1);
  assert.ok(sessionPath(dir, "../evil/../x").endsWith(join("sessions", ".._evil_.._x.json")));
  assert.ok(sessionPath(dir, undefined).endsWith(join("sessions", "default.json")));
});

test("pruneSessions removes only files older than maxAge", () => {
  const dir = tmp();
  writeSession(dir, "old", { promptCount: 1, lastBreakAt: 0 });
  writeSession(dir, "new", { promptCount: 1, lastBreakAt: 0 });
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  utimesSync(sessionPath(dir, "old"), old, old);
  const removed = pruneSessions(dir, 7 * 24 * 3600 * 1000);
  assert.equal(removed, 1);
  assert.equal(existsSync(sessionPath(dir, "old")), false);
  assert.equal(existsSync(sessionPath(dir, "new")), true);
  assert.equal(pruneSessions(join(dir, "does-not-exist")), 0);
  assert.deepEqual(readdirSync(join(dir, "sessions")), ["new.json"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib-state.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/state.mjs
// Global state (onboarding flag, pause) and per-session cadence state.
// Layout under the data dir:
//   state.json                  { onboarded, pausedUntil? }
//   sessions/<session_id>.json  { promptCount, lastBreakAt, updatedAt }

import { readdirSync, statSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from "./paths.mjs";

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const GLOBAL_DEFAULTS = { onboarded: false };
const SESSION_DEFAULTS = { promptCount: 0, lastBreakAt: 0 };

export function readGlobalState(dir) {
  return { ...GLOBAL_DEFAULTS, ...(readJson(join(dir, "state.json"), {}) ?? {}) };
}

export function writeGlobalState(dir, state) {
  writeJson(join(dir, "state.json"), state);
}

/** pausedUntil: -1 = indefinite, positive ms timestamp = until then. */
export function isPaused(state, now = Date.now()) {
  const p = state?.pausedUntil;
  return p === -1 || (typeof p === "number" && Number.isFinite(p) && p > now);
}

function sanitizeId(id) {
  const s = String(id ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
  return s || "default";
}

export function sessionPath(dir, id) {
  return join(dir, "sessions", `${sanitizeId(id)}.json`);
}

export function readSession(dir, id) {
  const raw = readJson(sessionPath(dir, id), {}) ?? {};
  return {
    promptCount: Number.isInteger(raw.promptCount) ? raw.promptCount : SESSION_DEFAULTS.promptCount,
    lastBreakAt: Number.isFinite(raw.lastBreakAt) ? raw.lastBreakAt : SESSION_DEFAULTS.lastBreakAt,
  };
}

export function writeSession(dir, id, session) {
  writeJson(sessionPath(dir, id), { ...session, updatedAt: Date.now() });
}

/** Delete session files not modified within maxAgeMs. Returns count removed. Never throws. */
export function pruneSessions(dir, maxAgeMs = SESSION_MAX_AGE_MS, now = Date.now()) {
  const sessionsDir = join(dir, "sessions");
  if (!existsSync(sessionsDir)) return 0;
  let removed = 0;
  try {
    for (const name of readdirSync(sessionsDir)) {
      if (!name.endsWith(".json")) continue;
      const p = join(sessionsDir, name);
      try {
        if (statSync(p).mtimeMs < now - maxAgeMs) {
          unlinkSync(p);
          removed++;
        }
      } catch {
        // file vanished or unreadable — skip
      }
    }
  } catch {
    // readdir failed — nothing to prune
  }
  return removed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib-state.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/state.mjs tests/lib-state.test.mjs
git commit -m "feat(lib): global + per-session state with pruning"
```

---

### Task 3: `scripts/lib/exercises.mjs` — MET table and calorie estimate

**Files:**
- Create: `scripts/lib/exercises.mjs`
- Test: `tests/lib-exercises.test.mjs`

**Interfaces:**
- Produces: `metFor(exerciseName) → number`, `DEFAULT_MET = 4.0`, `estimateCalories({ exercise, unit, count, weightLbs }) → number|null`.
- The test also reads `skills/clawdbod/SKILL.md` and asserts every pool entry gets a non-default MET. This test will fail on the current SKILL.md only if a name is missing a pattern; the pool text is not changed by this task.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib-exercises.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { metFor, DEFAULT_MET, estimateCalories } from "../scripts/lib/exercises.mjs";

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
});

test("estimateCalories follows the MET formula and rounds to 0.1", () => {
  // Push-ups: 8.0 × (200 × 0.4536) × (25×3/3600) = 6.048 → 6.0
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: 200 }), 6.0);
  // Plank 60s: 3.8 × 90.72 × (60/3600) = 5.7456 → 5.7
  assert.equal(estimateCalories({ exercise: "Plank hold", unit: "seconds", count: 60, weightLbs: 200 }), 5.7);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: 0 }), null);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: undefined }), null);
  assert.equal(estimateCalories({ exercise: "Push-ups", unit: "reps", count: 25, weightLbs: "abc" }), null);
});

test("every exercise in SKILL.md matches a specific MET pattern", () => {
  const skill = readFileSync(join(ROOT, "skills", "clawdbod", "SKILL.md"), "utf-8");
  const poolLines = skill.split("\n").filter((l) => /^\s*\*\*[A-Za-z &()-]+:\*\*\s/.test(l) && !l.includes("|"));
  assert.ok(poolLines.length >= 6, `expected pool categories, found ${poolLines.length}`);
  const names = poolLines.flatMap((l) => l.replace(/^\s*\*\*[^*]+\*\*\s*/, "").split(",").map((s) => s.trim())).filter(Boolean);
  assert.ok(names.length >= 50, `expected 50+ exercises, found ${names.length}`);
  const unmatched = names.filter((n) => metFor(n) === DEFAULT_MET);
  assert.deepEqual(unmatched, [], `no MET pattern for: ${unmatched.join(", ")}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib-exercises.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/exercises.mjs
// MET (metabolic equivalent) lookup and calorie estimation. The exercise pool
// the model picks from lives in skills/clawdbod/SKILL.md; the test suite
// asserts every pool entry matches a pattern here so the two cannot drift.

export const DEFAULT_MET = 4.0;

// Ordered most-specific first. First regex to match the lowercased name wins.
const MET_PATTERNS = [
  [/wall push|desk push/, 3.5],
  [/standing calf/, 3.0],
  [/calf raise|glute bridge/, 3.5],
  [/wrist circle/, 1.5],
  [/neck roll|cat-cow|cat cow|thoracic|spinal twist/, 2.0],
  [/arm circle|hip circle|toe touch|seated leg raise/, 2.5],
  [/shoulder tap|chair squat|standing march/, 4.0],
  [/commando/, 8.0],
  [/plank|bear crawl|wall sit|hollow body|superman|bicycle crunch|flutter kick|leg raise|russian twist|dead bug/, 3.8],
  [/squat thrust|jump squat/, 8.0],
  [/squat|lunge|deadlift/, 5.0],
  [/step-up|step up|inchworm/, 6.0],
  [/push-up|pushup|push up|burpee|jumping jack|mountain climber|high knee|fast feet|skater|tricep dip|star jump/, 8.0],
];

export function metFor(exerciseName) {
  const name = String(exerciseName ?? "").toLowerCase();
  for (const [re, met] of MET_PATTERNS) {
    if (re.test(name)) return met;
  }
  return DEFAULT_MET;
}

/**
 * calories = MET × kg × hours; reps assume 3 s each. Returns null without a
 * usable weight. Rounded to 0.1.
 */
export function estimateCalories({ exercise, unit, count, weightLbs }) {
  const lbs = Number(weightLbs);
  const n = Number(count);
  if (!Number.isFinite(lbs) || lbs <= 0 || !Number.isFinite(n) || n <= 0) return null;
  const hours = unit === "seconds" ? n / 3600 : (n * 3) / 3600;
  const cal = metFor(exercise) * (lbs * 0.4536) * hours;
  return Math.round(cal * 10) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib-exercises.test.mjs`
Expected: PASS (4 tests). If the SKILL.md coverage test lists an unmatched name, add a pattern for it in `MET_PATTERNS` (keep specific patterns above general ones) rather than editing SKILL.md.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/exercises.mjs tests/lib-exercises.test.mjs
git commit -m "feat(lib): MET table and calorie estimate, guarded against SKILL.md pool"
```

---

### Task 4: `scripts/lib/workouts.mjs` + refactor `export-workouts.mjs`

**Files:**
- Create: `scripts/lib/workouts.mjs`
- Modify: `scripts/export-workouts.mjs` (replace the inline read/validate/totals block)
- Test: `tests/lib-workouts.test.mjs`; existing `tests/export-workouts.test.mjs` must still pass unchanged.

**Interfaces:**
- Produces: `EMPTY_MSG`, `readWorkouts(dir) → { exists, workouts, skipped }`, `totals(workouts) → { sets, reps, calories }`, `appendWorkout(dir, entry)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib-workouts.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib-workouts.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the library**

```js
// scripts/lib/workouts.mjs
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
```

- [ ] **Step 4: Refactor `scripts/export-workouts.mjs` onto the library**

Replace everything from `const logPath = join(dataDir, "workouts.jsonl");` through the `const totals = {...};` block with:

```js
import { readWorkouts, totals as computeTotals, EMPTY_MSG } from "./lib/workouts.mjs";
// (place the import with the other imports at the top of the file)

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
```

Remove the now-unused `readFileSync` import and the local `EMPTY_MSG` constant. Keep everything after (CSV/JSON writing) as is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/lib-workouts.test.mjs tests/export-workouts.test.mjs`
Expected: PASS, export tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/workouts.mjs scripts/export-workouts.mjs tests/lib-workouts.test.mjs
git commit -m "refactor: shared workouts lib; export uses it"
```

---

### Task 5: `log-workout.mjs` computes calories from the profile

**Files:**
- Modify: `scripts/log-workout.mjs`
- Modify: `tests/log-workout.test.mjs` (update the `ok` assertion; add three tests)

**Interfaces:**
- Consumes: `dataDir`, `readConfig` (Task 1); `estimateCalories` (Task 3); `appendWorkout` (Task 4).
- CLI unchanged except: `--calories` omitted → auto-estimate from `config.json` profile in the data dir; output is `ok` or `ok ~N cal`.

- [ ] **Step 1: Add failing tests**

Append to `tests/log-workout.test.mjs`:

```js
import { writeFileSync } from "node:fs";

test("auto-estimates calories from profile when --calories is omitted", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({ profile: { weight_lbs: 200 } }));
  const out = run(["--exercise", "Push-ups", "--count", "25", "--data-dir", dir]);
  assert.equal(out.trim(), "ok ~6 cal");
  const entry = JSON.parse(readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim());
  assert.equal(entry.calories, 6.0);
});

test("explicit --calories overrides the profile estimate; 'null' disables it", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({ profile: { weight_lbs: 200 } }));
  run(["--exercise", "Push-ups", "--count", "25", "--calories", "9.9", "--data-dir", dir]);
  run(["--exercise", "Push-ups", "--count", "25", "--calories", "null", "--data-dir", dir]);
  const [a, b] = readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(a.calories, 9.9);
  assert.equal(b.calories, null);
});

test("no profile → calories null and plain ok", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawdbod-test-"));
  const out = run(["--exercise", "Push-ups", "--count", "25", "--data-dir", dir]);
  assert.equal(out.trim(), "ok");
  assert.equal(JSON.parse(readFileSync(join(dir, "workouts.jsonl"), "utf-8").trim()).calories, null);
});
```

Note: the first existing test passes `--calories 5.0` explicitly and asserts `ok` — it still holds because explicit calories print `ok ~5 cal`. Update that assertion to `assert.equal(out.trim(), "ok ~5 cal");`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/log-workout.test.mjs`
Expected: 3 new tests FAIL (`ok` vs `ok ~6 cal`, null vs 6.0).

- [ ] **Step 3: Rewrite `scripts/log-workout.mjs`**

```js
#!/usr/bin/env node

// Appends one validated workout entry to workouts.jsonl in the ClawdBod data
// directory (~/.claude/clawdbod). No network involved.
//
// Usage:
//   node log-workout.mjs --exercise "Push-ups" --count 25
//     [--unit reps|seconds] [--calories 5.0|null] [--data-dir /override/for/tests]
//
// When --calories is omitted, calories are estimated from the profile weight in
// config.json (same data dir). "--calories null" forces no estimate.
// Prints "ok" or "ok ~N cal".

import { dataDir as resolveDataDir, readConfig } from "./lib/paths.mjs";
import { estimateCalories } from "./lib/exercises.mjs";
import { appendWorkout } from "./lib/workouts.mjs";

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

const exercise = (args.exercise || "").trim();
const count = Number.parseInt(args.count, 10);
const unit = args.unit === "seconds" ? "seconds" : "reps";

if (!exercise) {
  console.error("error: --exercise is required");
  process.exit(1);
}
if (!Number.isInteger(count) || count <= 0) {
  console.error("error: --count must be a positive integer");
  process.exit(1);
}
if (args.unit !== undefined && args.unit !== "reps" && args.unit !== "seconds") {
  console.error("error: --unit must be reps or seconds");
  process.exit(1);
}

let calories;
if (args.calories === undefined) {
  const { profile } = readConfig(dataDir);
  calories = estimateCalories({ exercise, unit, count, weightLbs: profile?.weight_lbs });
} else if (args.calories === "null") {
  calories = null;
} else {
  calories = Number.parseFloat(args.calories);
  if (!Number.isFinite(calories) || calories < 0) {
    console.error("error: --calories must be a non-negative number");
    process.exit(1);
  }
}

appendWorkout(dataDir, { ts: new Date().toISOString(), exercise, unit, count, calories });
console.log(calories === null ? "ok" : `ok ~${calories} cal`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/log-workout.test.mjs`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add scripts/log-workout.mjs tests/log-workout.test.mjs
git commit -m "feat: log-workout estimates calories from profile in code"
```

---

### Task 6: `scripts/stats.mjs` — history table and totals

**Files:**
- Create: `scripts/stats.mjs`
- Test: `tests/stats.test.mjs`

**Interfaces:**
- Consumes: `dataDir` (Task 1); `readWorkouts`, `totals`, `EMPTY_MSG` (Task 4).
- CLI: `node stats.mjs [--limit N] [--since today|<ISO date>] [--json] [--data-dir DIR]`. Prints a display-ready block. Exit 1 with `error: ...` on a bad `--since`.

- [ ] **Step 1: Write the failing test**

```js
// tests/stats.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stats.test.mjs`
Expected: FAIL — cannot find module / script missing.

- [ ] **Step 3: Write the script**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/stats.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/stats.mjs tests/stats.test.mjs
git commit -m "feat: stats script renders history and totals in code"
```

---

### Task 7: `scripts/state.mjs` — pause / resume / status CLI

**Files:**
- Create: `scripts/state.mjs`
- Test: `tests/state-cli.test.mjs`

**Interfaces:**
- Consumes: `dataDir`, `readConfig` (Task 1); `readGlobalState`, `writeGlobalState`, `isPaused` (Task 2); `readWorkouts` (Task 4).
- CLI: `node state.mjs pause [minutes] | resume | status [--data-dir DIR]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/state-cli.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/state-cli.test.mjs`
Expected: FAIL — script missing.

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node

// Pause / resume fitness breaks and print a local status report.
//
// Usage:
//   node state.mjs pause [minutes] [--data-dir DIR]   → "paused indefinitely" | "paused until <time>"
//   node state.mjs resume          [--data-dir DIR]   → "resumed" | "not_paused"
//   node state.mjs status          [--data-dir DIR]   → multi-line status block
//
// Pause is global (all sessions). Cadence counters are per session and are
// not touched here.

import { homedir } from "os";
import { dataDir as resolveDataDir, readConfig, DEFAULTS } from "./lib/paths.mjs";
import { readGlobalState, writeGlobalState, isPaused } from "./lib/state.mjs";
import { readWorkouts } from "./lib/workouts.mjs";

const argv = process.argv.slice(2);
const positional = [];
let dataDirArg;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--data-dir") {
    dataDirArg = argv[++i];
  } else {
    positional.push(argv[i]);
  }
}
const [cmd, arg] = positional;
const dataDir = resolveDataDir(dataDirArg);

const USAGE = "usage: state.mjs pause [minutes] | resume | status";
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function pause() {
  let until = -1;
  if (arg !== undefined) {
    const minutes = Number.parseInt(arg, 10);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
      console.error("error: minutes must be a positive integer (max 10080)");
      process.exit(1);
    }
    until = Date.now() + minutes * 60 * 1000;
  }
  const state = readGlobalState(dataDir);
  writeGlobalState(dataDir, { ...state, pausedUntil: until });
  console.log(until === -1 ? "paused indefinitely" : `paused until ${fmtTime(until)}`);
}

function resume() {
  const state = readGlobalState(dataDir);
  const wasPaused = "pausedUntil" in state;
  delete state.pausedUntil;
  writeGlobalState(dataDir, state);
  console.log(wasPaused ? "resumed" : "not_paused");
}

function describeProfile(p) {
  if (!p) return "not set";
  const parts = [];
  if (Number.isFinite(p.height_inches)) parts.push(`${Math.floor(p.height_inches / 12)}'${p.height_inches % 12}"`);
  if (Number.isFinite(p.weight_lbs)) parts.push(`${p.weight_lbs} lbs`);
  if (Number.isFinite(p.age)) parts.push(String(p.age));
  if (typeof p.gender === "string" && p.gender) parts.push(p.gender);
  return parts.length ? `set (${parts.join(", ")})` : "set";
}

function status() {
  const cfg = readConfig(dataDir);
  const state = readGlobalState(dataDir);
  const { workouts } = readWorkouts(dataDir);
  const cadence = `every ${cfg.promptsBetweenBreaks} prompts, ${cfg.minMinutesBetweenBreaks} min cooldown`;
  const configLine = cfg.exists ? `ok (${cadence})` : `defaults (${cadence}) — no config file`;
  const logLine = workouts.length === 0 ? "none yet" : `${workouts.length} set${workouts.length === 1 ? "" : "s"} recorded`;
  let breaks = "active";
  if (isPaused(state)) breaks = state.pausedUntil === -1 ? "paused indefinitely" : `paused until ${fmtTime(state.pausedUntil)}`;
  const shownDir = dataDir.startsWith(homedir()) ? dataDir.replace(homedir(), "~") : dataDir;
  console.log([
    "ClawdBod Status",
    "",
    `  Config:       ${configLine}`,
    `  Profile:      ${describeProfile(cfg.profile)}`,
    `  Workout log:  ${logLine}`,
    `  Breaks:       ${breaks}`,
    `  Data:         ${shownDir} (local only)`,
  ].join("\n"));
}

switch (cmd) {
  case "pause": pause(); break;
  case "resume": resume(); break;
  case "status": status(); break;
  default:
    console.error(USAGE);
    process.exit(1);
}
```

Note: `DEFAULTS` import is unused; remove it if your linter complains. The Data line uses `~` only when the dir is under the home directory, so the test's temp dir prints verbatim.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/state-cli.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/state.mjs tests/state-cli.test.mjs
git commit -m "feat: state script for pause/resume/status"
```

---

### Task 8: Rewrite the Stop hook on per-session state

**Files:**
- Modify: `hooks/stop-fitness-check.mjs` (full rewrite)
- Test: `tests/hook.test.mjs`

**Interfaces:**
- Consumes: `dataDir`, `readConfig` (Task 1); everything in Task 2.
- Reads stdin JSON `{ session_id, stop_hook_active }`; writes a decision object or nothing; always exit 0.

- [ ] **Step 1: Write the failing test**

```js
// tests/hook.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "stop-fitness-check.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-hook-"));

function fire(dir, input, env = {}) {
  const r = spawnSync("node", [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf-8",
    env: { ...process.env, CLAWDBOD_DATA_DIR: dir, CLAWDBOD_PROMPTS: "2", CLAWDBOD_MINUTES: "1", ...env },
  });
  assert.equal(r.status, 0, `hook exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

const session = (id) => join("sessions", `${id}.json`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

test("first run with no config emits setup once, then never again", () => {
  const dir = tmp();
  const first = fire(dir, { session_id: "s1" });
  assert.equal(first.decision, "block");
  assert.match(first.reason, /CLAWDBOD SETUP/);
  assert.equal(readJson(join(dir, "state.json")).onboarded, true);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s2" }), null);
});

test("existing config skips the setup block but marks onboarded", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), JSON.stringify({ promptsBetweenBreaks: 8 }));
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(readJson(join(dir, "state.json")).onboarded, true);
  assert.equal(readJson(join(dir, session("s1"))).promptCount, 1);
});

test("break fires at the prompt threshold and resets the counter", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  assert.equal(fire(dir, { session_id: "s1" }), null);
  const brk = fire(dir, { session_id: "s1" });
  assert.equal(brk.decision, "block");
  assert.match(brk.reason, /FITNESS BREAK TIME/);
  assert.match(brk.reason, /log-workout\.mjs' --exercise "NAME" --count N --unit reps\|seconds/);
  assert.doesNotMatch(brk.reason, /--calories/);
  const s = readJson(join(dir, session("s1")));
  assert.equal(s.promptCount, 0);
  assert.ok(s.lastBreakAt > 0);
  // cooldown (1 min) blocks an immediate second break
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
});

test("sessions count independently", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  assert.equal(fire(dir, { session_id: "a" }), null);
  assert.equal(fire(dir, { session_id: "b" }), null);
  assert.equal(fire(dir, { session_id: "b" }).decision, "block");
  assert.equal(readJson(join(dir, session("a"))).promptCount, 1);
});

test("pause suppresses breaks; expired pause is cleared", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true, pausedUntil: -1 }));
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true, pausedUntil: Date.now() - 1000 }));
  assert.equal(fire(dir, { session_id: "s1" }).decision, "block");
  assert.equal("pausedUntil" in readJson(join(dir, "state.json")), false);
});

test("stop_hook_active and malformed stdin exit silently without touching state", () => {
  const dir = tmp();
  assert.equal(fire(dir, { session_id: "s1", stop_hook_active: true }), null);
  assert.equal(fire(dir, "not json"), null);
  assert.equal(existsSync(join(dir, "state.json")), false);
});

test("missing session_id falls back to default and old sessions are pruned", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  fire(dir, { session_id: "stale" });
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  utimesSync(join(dir, session("stale")), old, old);
  fire(dir, {});
  assert.ok(existsSync(join(dir, session("default"))));
  assert.equal(existsSync(join(dir, session("stale"))), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hook.test.mjs`
Expected: FAIL — current hook ignores `CLAWDBOD_DATA_DIR` and writes to the temp dir; state.json assertions fail.

- [ ] **Step 3: Rewrite the hook**

```js
#!/usr/bin/env node

/**
 * clawdbod Stop hook
 *
 * Fires every time Claude finishes responding. Counts prompts per session and
 * decides whether to block Claude from stopping so it can inject a fitness
 * challenge. Returning { decision: "block", reason } feeds the reason back as
 * context, which the clawdbod skill picks up.
 *
 * Storage (all under ~/.claude/clawdbod/, override with CLAWDBOD_DATA_DIR):
 *   config.json                 cadence + profile (user-owned)
 *   state.json                  { onboarded, pausedUntil? }  — global
 *   sessions/<session_id>.json  { promptCount, lastBreakAt } — per session
 *
 * This file must never exit non-zero and never print anything but a decision.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dataDir as resolveDataDir, readConfig } from "../scripts/lib/paths.mjs";
import {
  readGlobalState, writeGlobalState, isPaused,
  readSession, writeSession, pruneSessions,
} from "../scripts/lib/state.mjs";

try {
  const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const LOG_SCRIPT = join(PLUGIN_ROOT, "scripts", "log-workout.mjs");

  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    process.exit(0);
  }
  if (!input || typeof input !== "object" || input.stop_hook_active) process.exit(0);

  const dir = resolveDataDir();
  const sessionId = input.session_id;
  const config = readConfig(dir);
  const configPath = join(dir, "config.json");
  const global = readGlobalState(dir);
  const now = Date.now();

  const emit = (reason) => process.stdout.write(JSON.stringify({ decision: "block", reason }));

  // --- Onboarding: once per machine ------------------------------------
  if (!global.onboarded) {
    global.onboarded = true;
    writeGlobalState(dir, global);
    if (!config.exists) {
      emit([
        "🏋️ CLAWDBOD SETUP",
        "",
        "This is the first time ClawdBod is running on this machine.",
        "",
        "Use the clawdbod skill to walk the user through setup.",
        "Show them the current config and ask if they want to customize:",
        `  - Prompts between breaks: ${config.promptsBetweenBreaks}`,
        `  - Minutes between breaks: ${config.minMinutesBetweenBreaks}`,
        "",
        "If they want to change anything, update the config file at:",
        `  ${configPath}`,
        "",
        "If they're happy with defaults, just confirm and move on.",
        "Keep it brief — don't interrupt their flow for long.",
        "",
        "Also mention they can set up a profile for calorie estimates:",
        "  /clawdbod:setup",
      ].join("\n"));
      process.exit(0);
    }
  }

  // --- Pause (global) --------------------------------------------------
  const session = readSession(dir, sessionId);
  if ("pausedUntil" in global) {
    if (isPaused(global, now)) {
      session.promptCount += 1;
      writeSession(dir, sessionId, session);
      process.exit(0);
    }
    delete global.pausedUntil;
    writeGlobalState(dir, global);
  }

  // --- Cadence (per session) -------------------------------------------
  session.promptCount += 1;
  const minutesSinceLastBreak = (now - session.lastBreakAt) / 60000;
  const shouldBreak =
    session.promptCount >= config.promptsBetweenBreaks &&
    minutesSinceLastBreak >= config.minMinutesBetweenBreaks;

  if (shouldBreak) {
    session.promptCount = 0;
    session.lastBreakAt = now;
  }
  writeSession(dir, sessionId, session);

  try { pruneSessions(dir); } catch { /* best effort */ }

  if (!shouldBreak) process.exit(0);

  emit([
    "🏋️ FITNESS BREAK TIME!",
    "",
    `You've been coding for a while (${Math.round(minutesSinceLastBreak)} min since last break).`,
    "",
    "IMPORTANT: If the user is mid-deploy, debugging an error, resolving a conflict, or in a critical multi-step flow,",
    "skip this break — just say nothing and continue with their task. The coding task always takes priority.",
    "",
    "Otherwise, use the clawdbod skill to give the user a quick exercise challenge.",
    "",
    "Quick reference if you need it:",
    "1. Pick a random exercise from the skill's pool (push-ups, squats, lunges, plank, burpees, jumping jacks, etc.)",
    "2. Present it with energy and ask how many they got",
    "3. After they respond: celebrate, then log the workout locally:",
    `   node '${LOG_SCRIPT}' --exercise "NAME" --count N --unit reps|seconds`,
    "   (use --unit seconds for time-based holds; calories are estimated automatically from the profile)",
    "   It prints 'ok' or 'ok ~N cal' — mention the calories if present.",
    "   If the script fails, mention it briefly and move on — never block the session over logging.",
    "4. Transition back to the coding task",
  ].join("\n"));
} catch {
  process.exit(0);
}
```

- [ ] **Step 4: Run all tests**

Run: `node --test`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add hooks/stop-fitness-check.mjs tests/hook.test.mjs
git commit -m "feat!: hook keeps per-session cadence state under the data dir"
```

---

### Task 9: Commands and skill call the scripts

**Files:**
- Modify: `commands/fitness.md`, `commands/history.md`, `commands/status.md`, `commands/pause.md`, `commands/resume.md`, `skills/clawdbod/SKILL.md`

No automated tests; verify by reading each file and running `claude plugin validate .`.

- [ ] **Step 1: Rewrite `commands/fitness.md`**

```markdown
---
description: Take a fitness break right now. Get a random exercise challenge or request a HIIT workout for a longer wait.
argument-hint: "[hiit 5 | hiit 10 | summary]"
---

# Fitness Break

Give the user an exercise challenge right now. The full flow, exercise pool, and tone rules live in the clawdbod skill — read `${CLAUDE_PLUGIN_ROOT}/skills/clawdbod/SKILL.md` first if it is not already in context.

## Routing

- `$ARGUMENTS` contains "hiit 5" → 5-minute HIIT (40s on / 20s rest × 5 rounds, 5 different exercises from the skill's pool).
- `$ARGUMENTS` contains "hiit 10" → 10-minute HIIT (40s on / 20s rest × 10 rounds, alternate upper/lower/core, include a 1-min warmup and cooldown).
- `$ARGUMENTS` contains "summary" or "stats" → run with the Bash tool and print the output verbatim in a code block:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --since today
  ```
- Otherwise → run the skill's **Quick micro-break** flow exactly as written there.

## HIIT logging

After a HIIT workout, ask how many rounds they completed and log one entry per exercise they did (count = rounds × 40, unit seconds). Same `log-workout.mjs` call as the skill describes. If they bail early, log what they did and move on.

Keep it short. Back to code when done.
```

- [ ] **Step 2: Rewrite `commands/history.md`**

```markdown
---
description: View your recent exercise history and stats from the local workout log.
argument-hint: "[number of entries | all]"
---

# ClawdBod History

1. Pick a limit: default 20; a number in `$ARGUMENTS` → that number (max 100); "all" → 100.
2. Run with the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --limit LIMIT
   ```
3. Print the output verbatim inside a code block. Add nothing else unless the user asks a follow-up.

The script already handles the empty-log case, totals over the whole log, newest-first ordering, and the "Showing last N of M" note.
```

- [ ] **Step 3: Rewrite `commands/status.md`**

```markdown
---
description: Quick health check — verify your ClawdBod setup is working (config, workout log, break state).
argument-hint: ""
---

# ClawdBod Status

Run with the Bash tool and print the output verbatim inside a code block:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status
```

Then, based on what it shows, add at most one or two one-line hints:

- Config says "no config file" → "Run `/clawdbod:setup` to customize."
- Profile "not set" → "Add one with `/clawdbod:config profile` for calorie estimates."
- Workout log "none yet" → "Your next break will start recording automatically."
- Breaks "paused" → "Run `/clawdbod:resume` to get moving again."
- Everything set and active → "Everything looks good!"

No network is involved. Keep it concise.
```

- [ ] **Step 4: Rewrite `commands/pause.md`**

```markdown
---
description: Pause fitness breaks — for deep focus, calls, or demos. Breaks resume automatically or with /clawdbod:resume.
argument-hint: "[minutes]"
---

# Pause Breaks

Run with the Bash tool. If `$ARGUMENTS` is a number, pass it as minutes; otherwise omit it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" pause MINUTES
```

## Response

- `paused until 3:45 PM` → "Breaks paused until 3:45 PM. They'll kick back in automatically, or run /clawdbod:resume."
- `paused indefinitely` → "Breaks paused. Run /clawdbod:resume when you're ready to get moving again."
- `error: ...` → relay the error in one line.

One line. Don't be preachy about skipping exercise. Pause applies to all your Claude Code sessions.
```

- [ ] **Step 5: Rewrite `commands/resume.md`**

```markdown
---
description: Resume fitness breaks after pausing.
argument-hint: ""
---

# Resume Breaks

Run with the Bash tool:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" resume
```

## Response

- `resumed` → "Breaks resumed. Next one will fire on schedule."
- `not_paused` → "Breaks aren't paused — you're already good to go."

One line, done.
```

- [ ] **Step 6: Edit `skills/clawdbod/SKILL.md`**

Make these changes and no others:

1. In the frontmatter `description`, no change.
2. Replace the **"Critical: Read config first"** section with:

   ```markdown
   ## Config

   Break cadence and the optional profile live in `~/.claude/clawdbod/config.json`. You do **not** need to read it for a normal break — the logging script reads the profile itself and estimates calories. Only read it when the user asks about their settings or during setup.
   ```
3. In **First-run setup**, change "first time ClawdBod is running in this session" wording if present to "on this machine" (the hook text changed).
4. In **Quick micro-break**, step 4, replace sub-steps **b)** and **c)** with:

   ```markdown
   **b) Log the workout (MANDATORY)** — run this NOW with the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/log-workout.mjs" --exercise "EXERCISE_NAME" --count COUNT --unit reps
   ```
   - Use the exact exercise name as presented (e.g. "Push-ups")
   - Use `--unit seconds` for time-based exercises (planks, holds, wall sits)
   - Do **not** pass `--calories` — the script estimates them from the profile
   - It prints `ok` or `ok ~4.2 cal`. If calories are present, mention them briefly ("~4 cal"). If not, say nothing about calories and don't prompt for a profile.
   - **If it fails**, say "couldn't save that one" briefly and move on. Never block the session over logging.
   ```
   and re-letter the old **d)** to **c)**.
5. Replace the **Tracking** section with:

   ```markdown
   ## Tracking

   Every logged set lands in `~/.claude/clawdbod/workouts.jsonl`. For a summary of today's breaks, run and print verbatim:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --since today
   ```
   For full history point them at `/clawdbod:history`; to get a file, `/clawdbod:export`.
   ```
6. Delete the entire **"Calorie estimation — MET values"** section (heading and table). The table now lives in `scripts/lib/exercises.mjs`.

Leave the exercise pool text untouched — `tests/lib-exercises.test.mjs` parses it.

- [ ] **Step 7: Validate and run tests**

Run: `claude plugin validate . && node --test`
Expected: validation passes; all tests pass (the SKILL.md pool test still finds ≥ 6 categories).

- [ ] **Step 8: Commit**

```bash
git add commands skills
git commit -m "refactor: commands and skill delegate numbers and state to scripts"
```

---

### Task 10: README, version bump, local cleanup

**Files:**
- Modify: `README.md`, `.claude-plugin/plugin.json`
- Local only (not committed): migrate `./config.json` profile to `~/.claude/clawdbod/config.json`, then delete `./config.json`.

- [ ] **Step 1: Update `README.md`**

Apply these edits:

1. "How it works" paragraph: change "scaled HIIT workouts during long-running tasks" in the intro to "HIIT workouts on demand for long waits", and add after the paragraph: "Break timing is tracked per Claude Code session, so parallel terminals and subagents don't steal each other's breaks. Pausing applies everywhere."
2. "Your data" list becomes:
   ```markdown
   - `config.json` — break cadence and optional profile
   - `workouts.jsonl` — append-only workout log, one JSON entry per set
   - `state.json` — onboarding flag and pause state
   - `sessions/` — per-session prompt counters (auto-pruned after 7 days)
   ```
3. "Development" block becomes:
   ```bash
   node --test               # all tests (Node 22+)
   claude plugin validate .  # manifest validation
   ```
4. Add a changelog entry above 2.0.0:
   ```markdown
   ### 2.1.0

   - Break cadence is tracked **per session** under `~/.claude/clawdbod/sessions/` instead of a shared file in the OS temp dir. Parallel sessions no longer share a counter, and onboarding no longer re-fires after a reboot.
   - Calories, totals, and history tables are computed by scripts (`log-workout.mjs`, `stats.mjs`), not by the model. Numbers are now consistent across `/fitness summary`, `/history`, and `/export`.
   - `/pause`, `/resume`, and `/status` are backed by `scripts/state.mjs`.
   - Exercise pool and MET table are defined once; a test guards them against drift.
   - Hook reads stdin portably (works on Windows).
   - Docs: fixed the test command; removed the claim that workouts trigger automatically during long-running tasks (use `/clawdbod:fitness hiit 5` while you wait).
   ```
5. Add a "Roadmap" section before "Development":
   ```markdown
   ## Roadmap

   - **"While you wait" workouts.** When a prompt fans out to several subagents or a long build, offer a timed exercise up front instead of waiting for the next Stop. Needs a trigger on tool dispatch and a way to size the workout to the expected wait.
   ```

- [ ] **Step 2: Bump version**

In `.claude-plugin/plugin.json` set `"version": "2.1.0"`.

- [ ] **Step 3: Migrate the local 1.x config (not committed)**

The repo root has an untracked, gitignored `config.json` left over from 1.x containing `leaderboard`, `has_passphrase`, `username`, `secret_token`, and a valid `profile`. `~/.claude/clawdbod/config.json` does not exist yet.

```bash
node -e '
const fs=require("fs"),os=require("os"),p=require("path");
const src=JSON.parse(fs.readFileSync("config.json","utf-8"));
const dst={promptsBetweenBreaks:src.promptsBetweenBreaks??8,minMinutesBetweenBreaks:src.minMinutesBetweenBreaks??20};
if(src.profile)dst.profile=src.profile;
const dir=p.join(os.homedir(),".claude","clawdbod");fs.mkdirSync(dir,{recursive:true});
const out=p.join(dir,"config.json");
if(fs.existsSync(out)){console.log("exists, not overwriting:",out);process.exit(0)}
fs.writeFileSync(out,JSON.stringify(dst,null,2)+"\n");console.log("wrote",out);'
rm config.json
```

Then confirm: `node scripts/state.mjs status` shows the profile.

- [ ] **Step 4: Validate, test, commit**

```bash
claude plugin validate . && node --test
git add README.md .claude-plugin/plugin.json
git commit -m "docs: 2.1.0 changelog, roadmap, data layout; bump version"
```

---

## Self-review

**Spec coverage:** data layout (T2, T8) · shared lib (T1–T4) · log-workout auto calories (T5) · stats (T6) · state CLI (T7) · export refactor (T4) · hook rewrite incl. `readFileSync(0)`, onboarding-once, pause, prune (T8) · commands + skill dedupe (T9) · README/version/roadmap/test command/local cleanup (T10) · every test listed in the spec's Testing section has a task.

**Type consistency:** `readConfig` returns `{ exists, promptsBetweenBreaks, minMinutesBetweenBreaks, profile }` and is used that way in T5, T7, T8. `readWorkouts` returns `{ exists, workouts, skipped }` in T4, T6, T7. `readGlobalState`/`isPaused` signatures match between T2, T7, T8. Log script output `ok ~N cal` matches T5 test and T8 hook text and T9 skill text.
