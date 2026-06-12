# ClawdBod 2.0 Local-First Tracking & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Supabase leaderboard from the ClawdBod plugin and site, replacing it with local workout tracking in `~/.claude/clawdbod/` plus CSV/JSON export, while modernizing the plugin to current Claude Code plugin conventions.

**Architecture:** Two repos. The plugin (`~/Documents/claude-plugins/clawdbod`) gains two small Node scripts (append-only JSONL logger, exporter) tested with `node --test`; hooks move to `hooks/hooks.json`; commands/skill drop all curl calls. The marketing site (`~/projects/fgalabs/projects/junkdrawer/clawdbod/clawdbod-site`) loses its three Supabase-backed components and gets local-first copy.

**Tech Stack:** Plain Node.js (ESM `.mjs`, built-in `node:test`), Claude Code plugin manifests (plugin.json / hooks.json / marketplace.json), React + TypeScript + Vite for the site.

**Spec:** `docs/superpowers/specs/2026-06-12-local-first-export-design.md`

**Canonical data dir:** `~/.claude/clawdbod/` (holds `config.json` and `workouts.jsonl`). Scripts accept `--data-dir` for tests only.

**Workout log entry shape (used everywhere):**
```json
{"ts":"2026-06-12T18:30:00.000Z","exercise":"Push-ups","unit":"reps","count":25,"calories":5.0}
```

---

# Part A — Plugin repo (`/Users/kylehurst/Documents/claude-plugins/clawdbod`)

All Part A commands run from that directory.

### Task 1: Repo hygiene — stop tracking user data

The repo currently tracks `config.json`, which is user data and contains a live secret token.

**Files:**
- Create: `.gitignore`
- Untrack: `config.json`, `.DS_Store`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
config.json
pending-sync.json
.DS_Store
node_modules/
```

- [ ] **Step 2: Untrack the files (keep them on disk)**

Run: `git rm --cached config.json .DS_Store`
Expected: `rm 'config.json'` (and `.DS_Store` if it was tracked; if not tracked, rerun with just `config.json`)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: stop tracking user config and OS junk"
```

### Task 2: Workout logger script (`log-workout.mjs`)

**Files:**
- Create: `scripts/log-workout.mjs`
- Test: `tests/log-workout.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/log-workout.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/log-workout.test.mjs`
Expected: all tests FAIL (script file does not exist → spawn error)

- [ ] **Step 3: Implement the script**

Create `scripts/log-workout.mjs`:

```js
#!/usr/bin/env node

// Appends one validated workout entry to workouts.jsonl in the ClawdBod data
// directory (~/.claude/clawdbod). Replaces the old Supabase log-reps call —
// no network involved.
//
// Usage:
//   node log-workout.mjs --exercise "Push-ups" --count 25
//     [--unit reps|seconds] [--calories 5.0] [--data-dir /override/for/tests]

import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

const dataDir = args["data-dir"] || join(homedir(), ".claude", "clawdbod");

const exercise = (args.exercise || "").trim();
const count = Number.parseInt(args.count, 10);
const unit = args.unit === "seconds" ? "seconds" : "reps";
const calories =
  args.calories === undefined || args.calories === "null"
    ? null
    : Number.parseFloat(args.calories);

if (!exercise) {
  console.error("error: --exercise is required");
  process.exit(1);
}
if (!Number.isInteger(count) || count <= 0) {
  console.error("error: --count must be a positive integer");
  process.exit(1);
}
if (calories !== null && (!Number.isFinite(calories) || calories < 0)) {
  console.error("error: --calories must be a non-negative number");
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const entry = { ts: new Date().toISOString(), exercise, unit, count, calories };
appendFileSync(join(dataDir, "workouts.jsonl"), JSON.stringify(entry) + "\n");
console.log("ok");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/log-workout.test.mjs`
Expected: 6 passing, 0 failing

- [ ] **Step 5: Commit**

```bash
git add scripts/log-workout.mjs tests/log-workout.test.mjs
git commit -m "feat: add local workout logger script"
```

### Task 3: Export script (`export-workouts.mjs`)

**Files:**
- Create: `scripts/export-workouts.mjs`
- Test: `tests/export-workouts.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/export-workouts.test.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/export-workouts.test.mjs`
Expected: all tests FAIL (script does not exist)

- [ ] **Step 3: Implement the script**

Create `scripts/export-workouts.mjs`:

```js
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

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

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

const dataDir = args["data-dir"] || join(homedir(), ".claude", "clawdbod");
const format = args.format === "json" ? "json" : "csv";
const logPath = join(dataDir, "workouts.jsonl");

const EMPTY_MSG = "No workouts logged yet — take a break with /clawdbod:fitness first.";

if (!existsSync(logPath)) {
  console.log(EMPTY_MSG);
  process.exit(0);
}

const lines = readFileSync(logPath, "utf-8").split("\n").filter((l) => l.trim() !== "");
const workouts = [];
let skipped = 0;
for (const line of lines) {
  try {
    const e = JSON.parse(line);
    if (typeof e.exercise === "string" && Number.isInteger(e.count)) workouts.push(e);
    else skipped++;
  } catch {
    skipped++;
  }
}

if (workouts.length === 0) {
  console.log(EMPTY_MSG);
  process.exit(0);
}

const totals = {
  sets: workouts.length,
  reps: workouts.filter((e) => e.unit !== "seconds").reduce((sum, e) => sum + e.count, 0),
  calories: Math.round(workouts.reduce((sum, e) => sum + (e.calories ?? 0), 0) * 10) / 10,
};

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

writeFileSync(outPath, content);
const skippedNote = skipped > 0 ? ` (skipped ${skipped} malformed line${skipped === 1 ? "" : "s"})` : "";
console.log(`Exported ${workouts.length} workouts to ${outPath}${skippedNote}`);
console.log(`Totals: ${totals.sets} sets, ${totals.reps} reps, ${totals.calories} cal`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/export-workouts.test.mjs`
Expected: 5 passing, 0 failing

- [ ] **Step 5: Run the full test suite**

Run: `node --test tests/`
Expected: 11 passing, 0 failing

- [ ] **Step 6: Commit**

```bash
git add scripts/export-workouts.mjs tests/export-workouts.test.mjs
git commit -m "feat: add CSV/JSON workout export script"
```

### Task 4: Manifests — `plugin.json` v2.0.0 and `hooks/hooks.json`

**Files:**
- Modify: `.claude-plugin/plugin.json` (full replace)
- Create: `hooks/hooks.json`
- Modify: `.claude-plugin/marketplace.json` (full replace)

- [ ] **Step 1: Replace `.claude-plugin/plugin.json`**

```json
{
  "name": "clawdbod",
  "version": "2.0.0",
  "description": "Stay active while coding. Injects fitness breaks into your Claude Code sessions — micro-challenges between prompts and scaled workouts during long-running tasks. All workout data stays on your machine, exportable to CSV or JSON.",
  "author": {
    "name": "FGA Labs"
  },
  "homepage": "https://github.com/khur/clawdbod",
  "repository": "https://github.com/khur/clawdbod",
  "license": "MIT",
  "keywords": [
    "fitness",
    "health",
    "exercise",
    "breaks",
    "wellness",
    "tracking",
    "export",
    "local-first",
    "productivity"
  ]
}
```

Note: the inline `"hooks"` block is gone — it moves to `hooks/hooks.json`. `"version"` is new; from now on users only get updates on version bumps.

- [ ] **Step 2: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node '${CLAUDE_PLUGIN_ROOT}/hooks/stop-fitness-check.mjs'",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Replace `.claude-plugin/marketplace.json`**

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "fgalabs-clawdbod",
  "description": "ClawdBod — fitness breaks for Claude Code. Stay active while you ship.",
  "owner": {
    "name": "FGA Labs"
  },
  "plugins": [
    {
      "name": "clawdbod",
      "displayName": "ClawdBod",
      "description": "Stay active while coding. Fitness breaks in your Claude Code sessions, with local workout tracking and CSV/JSON export.",
      "author": {
        "name": "FGA Labs"
      },
      "source": "./",
      "category": "wellness"
    }
  ]
}
```

- [ ] **Step 4: Validate**

Run: `claude plugin validate .`
Expected: validation passes (if the `claude` CLI subcommand is unavailable, run `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('json ok')"` and expect `json ok`)

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json
git commit -m "feat!: v2.0.0 manifests — hooks.json, version field, local-first descriptions"
```

### Task 5: Rewrite the Stop hook for local data

**Files:**
- Modify: `hooks/stop-fitness-check.mjs` (full replace below)

- [ ] **Step 1: Replace `hooks/stop-fitness-check.mjs` with:**

```js
#!/usr/bin/env node

/**
 * clawdbod Stop hook
 *
 * Fires every time Claude finishes responding.
 * Tracks prompt count via a temp file and decides whether to block
 * Claude from stopping so it can inject a fitness challenge.
 *
 * Returning { "decision": "block", "reason": "..." } prevents Claude
 * from stopping and feeds the reason back as context, which the
 * clawdbod skill then picks up to run the interactive challenge.
 *
 * User data (config + workout log) lives in ~/.claude/clawdbod/ so it
 * survives plugin updates. Session cadence state lives in the OS tmpdir.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir, homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Wrap everything — a hook crash should never break the user's session
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_ROOT = join(__dirname, "..");
  const DATA_DIR = join(homedir(), ".claude", "clawdbod");
  const STATE_DIR = join(tmpdir(), "clawdbod");
  const STATE_FILE = join(STATE_DIR, "state.json");

  // Ensure state directory exists
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  // --- Config -----------------------------------------------------------
  // Priority: env vars > config.json > defaults
  const defaults = { promptsBetweenBreaks: 8, minMinutesBetweenBreaks: 20 };

  let fileConfig = {};
  const configPath = join(DATA_DIR, "config.json");
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      // bad config file, use defaults
    }
  }

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const PROMPTS_BETWEEN_BREAKS = clamp(
    parseInt(process.env.CLAWDBOD_PROMPTS, 10) ||
      fileConfig.promptsBetweenBreaks ||
      defaults.promptsBetweenBreaks,
    1,
    1000
  );

  const MIN_MINUTES_BETWEEN_BREAKS = clamp(
    parseInt(process.env.CLAWDBOD_MINUTES, 10) ||
      fileConfig.minMinutesBetweenBreaks ||
      defaults.minMinutesBetweenBreaks,
    1,
    1440
  );
  // ----------------------------------------------------------------------

  // Read stdin safely
  let input;
  try {
    input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } catch {
    process.exit(0);
  }

  // If we already blocked once (stop_hook_active), don't loop forever
  if (input.stop_hook_active) {
    process.exit(0);
  }

  // Load or init state
  let state = {
    promptCount: 0,
    lastBreakAt: 0,
    setupComplete: false,
  };
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      if (typeof raw === "object" && raw !== null) {
        state = { ...state, ...raw };
      }
    } catch {
      // corrupted file, reset
    }
  }

  function saveState() {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  // --- First-run setup ---------------------------------------------------
  if (!state.setupComplete) {
    state.setupComplete = true;
    state.lastBreakAt = 0; // Don't start cooldown — let first break trigger on prompt count alone
    saveState();

    const profileNote = fileConfig.profile
      ? ""
      : [
          "",
          "Also mention they can set up a profile for calorie estimates:",
          "  /clawdbod:setup",
        ].join("\n");

    const result = {
      decision: "block",
      reason: [
        "🏋️ CLAWDBOD SETUP",
        "",
        "This is the first time ClawdBod is running in this session.",
        "",
        "Use the clawdbod skill to walk the user through setup.",
        "Show them the current config and ask if they want to customize:",
        `  - Prompts between breaks: ${PROMPTS_BETWEEN_BREAKS}`,
        `  - Minutes between breaks: ${MIN_MINUTES_BETWEEN_BREAKS}`,
        "",
        "If they want to change anything, update the config file at:",
        `  ${configPath}`,
        "",
        "If they're happy with defaults, just confirm and move on.",
        "Keep it brief — don't interrupt their flow for long.",
        profileNote,
      ].join("\n"),
    };

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
  // -----------------------------------------------------------------------

  // --- Pause check -------------------------------------------------------
  if (state.pausedUntil) {
    const pauseExpiry = state.pausedUntil;
    if (pauseExpiry === -1 || pauseExpiry > Date.now()) {
      // Still paused — skip break logic, still count prompts
      state.promptCount += 1;
      saveState();
      process.exit(0);
    }
    // Pause expired — clear it and continue
    delete state.pausedUntil;
  }
  // -----------------------------------------------------------------------

  state.promptCount += 1;

  const now = Date.now();
  const minutesSinceLastBreak = (now - state.lastBreakAt) / 1000 / 60;
  const shouldBreak =
    state.promptCount >= PROMPTS_BETWEEN_BREAKS &&
    minutesSinceLastBreak >= MIN_MINUTES_BETWEEN_BREAKS;

  if (shouldBreak) {
    state.promptCount = 0;
    state.lastBreakAt = now;
    saveState();

    const result = {
      decision: "block",
      reason: [
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
        `1. Read ${configPath} for break settings and profile`,
        "2. Pick a random exercise (push-ups, squats, lunges, plank, burpees, jumping jacks, etc.)",
        "3. Present it with energy and ask how many they got",
        "4. After they respond: celebrate, estimate calories if profile exists, then log the workout locally:",
        `   node '${join(PLUGIN_ROOT, "scripts", "log-workout.mjs")}' --exercise "NAME" --count N --unit reps|seconds --calories CAL`,
        "   (omit --calories if no profile; use --unit seconds for time-based holds)",
        "   If the script fails, mention it briefly and move on — never block the session over logging.",
        "5. Transition back to the coding task",
      ].join("\n"),
    };

    process.stdout.write(JSON.stringify(result));
  } else {
    saveState();
    process.exit(0);
  }
} catch {
  // If anything goes wrong, exit silently — never break the user's session
  process.exit(0);
}
```

- [ ] **Step 2: Smoke-test the hook manually**

The hook keys session state off `/tmp/.../clawdbod/state.json`. Use a scratch TMPDIR so you don't disturb the real session state:

```bash
# First run in a fresh state dir → expects CLAWDBOD SETUP block
TMPDIR=$(mktemp -d) bash -c 'echo "{}" | node hooks/stop-fitness-check.mjs'
```
Expected: JSON on stdout containing `"decision":"block"` and `CLAWDBOD SETUP`.

```bash
# stop_hook_active guard → expects no output
TMPDIR=$(mktemp -d) bash -c '
  echo "{}" | node hooks/stop-fitness-check.mjs > /dev/null   # consume first-run
  echo "{\"stop_hook_active\":true}" | node hooks/stop-fitness-check.mjs'
```
Expected: empty output, exit 0.

```bash
# Break fires when prompt count reached and cooldown elapsed → expects FITNESS BREAK
T=$(mktemp -d)
TMPDIR=$T sh -c 'echo "{}" | node hooks/stop-fitness-check.mjs > /dev/null'   # consume first-run
node -e "
  const f = process.argv[1] + '/clawdbod/state.json';
  const s = JSON.parse(require('fs').readFileSync(f, 'utf-8'));
  s.lastBreakAt = Date.now() - 10 * 60 * 1000;
  require('fs').writeFileSync(f, JSON.stringify(s));
" "$T"
TMPDIR=$T CLAWDBOD_PROMPTS=1 CLAWDBOD_MINUTES=1 sh -c 'echo "{}" | node hooks/stop-fitness-check.mjs'
```
Expected: JSON containing `FITNESS BREAK TIME` and the `log-workout.mjs` reference (no `curl`, no `supabase`).

- [ ] **Step 3: Verify no Supabase remnants in the hook**

Run: `grep -i "supabase\|curl\|secret_token\|leaderboard" hooks/stop-fitness-check.mjs`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add hooks/stop-fitness-check.mjs
git commit -m "feat!: hook reads local data dir, drops leaderboard logging"
```

### Task 6: Rewrite `skills/clawdbod/SKILL.md`

**Files:**
- Modify: `skills/clawdbod/SKILL.md` (full replace below)

- [ ] **Step 1: Replace the file with:**

````markdown
---
name: clawdbod
description: Fitness breaks for coding sessions. Use when the Stop hook signals a fitness break or first-run setup ("CLAWDBOD SETUP" / "FITNESS BREAK TIME!"), when the user asks for a workout, exercise break, or stretch, or when they want to view or export their logged workout history.
---

# ClawdBod — Fitness Break Skill

You are a fitness coach embedded in a coding session. Your job is to give the developer a quick, energizing exercise break.

## Hard rules — things you must NEVER do

- **Never interrupt critical work.** If the user is mid-deploy, debugging an error, resolving a merge conflict, or in a multi-step flow, skip the break silently. The coding task always takes priority.
- **Never nag.** If the user says "not now", "skip", or ignores the break, respect it immediately and go back to work. Don't guilt-trip, don't remind them later, don't escalate.
- **Never offer unsolicited health advice.** No nutrition tips, no "you should exercise more", no commentary on their habits outside of breaks. You're a gym buddy, not a doctor.
- **Never take more than 2-3 exchanges.** Present challenge → get reps → celebrate + log → back to code. That's it. Don't linger.
- **Never block the user from working.** If logging fails, mention it briefly and move on. If anything fails, fail silently and return to the task.

## When to use this skill

Use this skill when:
- The Stop hook triggers first-run setup (you'll see "🏋️ CLAWDBOD SETUP" in context)
- The Stop hook triggers a fitness break (you'll see "🏋️ FITNESS BREAK TIME!" in context)
- The user runs `/clawdbod:fitness` manually
- The user asks for a workout or exercise break

## Critical: Read config first

**Before every fitness break**, read `~/.claude/clawdbod/config.json` to get:
- `promptsBetweenBreaks` and `minMinutesBetweenBreaks` (break cadence)
- `profile.weight_lbs` (needed for calorie estimation)

If the file doesn't exist, that's fine — use defaults (8 prompts, 20 minutes) and skip calorie estimates.

## First-run setup

When you see "CLAWDBOD SETUP", welcome the user briefly:

```
🏋️ ClawdBod is active! You'll get fitness breaks every 8 prompts (at least 20 min apart).

Want calorie estimates with your breaks? Run /clawdbod:setup to add a profile.
Or just start coding — I'll nudge you when it's time to move.
```

- If they want to change break settings, update `~/.claude/clawdbod/config.json`
- **When writing config.json, always read it first and merge changes — never overwrite the whole file.**
- If they're happy with defaults, confirm and move on — don't linger
- Keep it to one exchange max

## How to run a fitness break

### Quick micro-break (< 2 min)

1. Pick ONE exercise at random from this pool:

   **Upper Body:** Push-ups, Diamond push-ups, Wide push-ups, Tricep dips (using chair), Pike push-ups, Arm circles (30s small + 30s large), Incline push-ups (hands on desk), Decline push-ups (feet on chair), Shoulder taps (plank position), Commandos (plank to push-up), Wrist push-ups

   **Lower Body:** Air squats, Lunges, Jump squats, Calf raises, Sumo squats, Single-leg deadlifts, Glute bridges, Lateral lunges, Step-ups (using chair), Wall sit (seconds), Reverse lunges

   **Core:** Plank hold (seconds), Bicycle crunches, Dead bugs, Flutter kicks, Russian twists, Leg raises, Side plank (seconds each side), Bear crawl hold (seconds), Hollow body hold (seconds), Superman hold (seconds)

   **Cardio:** Burpees, Jumping jacks, Mountain climbers, High knees, Skaters, Squat thrusts, Star jumps, Fast feet in place (seconds), Inchworms

   **Mobility & Stretching:** Neck rolls (seconds), Cat-cow stretch (seconds), Hip circles, Thoracic rotations, Wrist circles (seconds), Seated spinal twist (seconds), Toe touches

   **Desk-friendly (no floor needed):** Desk push-ups, Seated leg raises, Chair squats, Standing calf raises, Wall push-ups, Standing march (seconds)

2. Present the challenge with energy:
   ```
   ⏸️ BREAK TIME — PUSH-UPS!

   Drop and give me as many push-ups as you can before you quit.
   No judgment, no minimum. Just move.

   👉 How many did you get?
   ```

3. **Wait for the user's response.** They will type a number.

4. **After they respond, do ALL of these in the SAME response:**

   **a) Celebrate** — be genuine, not corny. Encouraging if low, impressed if high.

   **b) Estimate calories** (only if config.json has `profile.weight_lbs`):
   - Formula: `calories = MET × (weight_lbs × 0.4536) × duration_hours`
   - Rep-based: `duration_hours = (reps × 3) / 3600`
   - Time-based: `duration_hours = seconds / 3600`
   - Show briefly: "~4.2 cal burned"
   - No profile? Skip silently. Don't prompt them to set one.

   **c) Log the workout (MANDATORY)** — run this NOW with the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/log-workout.mjs" --exercise "EXERCISE_NAME" --count COUNT --unit reps --calories CALORIES
   ```
   - Use the exact exercise name as presented (e.g. "Push-ups")
   - Use `--unit seconds` for time-based exercises (planks, holds, wall sits)
   - Omit `--calories` entirely if no profile
   - Prints `ok` on success — no need to mention logging unless asked
   - **If it fails**, say "couldn't save that one" briefly and move on. Never block the session over logging.

   **d) Transition back:** "Alright, back to it. Where were we..."

### Scaled workout (for long waits)

When Claude is about to run a long task (big test suite, complex build, deployment), offer a scaled workout instead:

**5-minute HIIT:** 40s on / 20s rest × 5 rounds, 5 different exercises, formatted clearly.

**10-minute HIIT:** 40s on / 20s rest × 10 rounds, alternate upper/lower/core, include 1-min warmup and cooldown.

## Formatting rules

- Use emoji sparingly (🏋️ ⏸️ 💪 🔥)
- Keep it SHORT — this is a break, not a lecture
- Gym buddy tone, not doctor. Never preachy.
- 0 or low number → encouraging, not disappointed
- High number → impressed, not doubtful
- Always end by transitioning back to the coding task

## Tracking

Every logged set lands in `~/.claude/clawdbod/workouts.jsonl`. If the user asks for a summary:
- Total breaks taken this session
- Exercises done with rep counts
- Total volume (e.g., "42 push-ups, 30 squats, 60 jumping jacks")

For full history, point them at `/clawdbod:history`. To get their data out as a file, `/clawdbod:export` writes CSV or JSON.

## Calorie estimation — MET values

| Exercise | MET |
|---|---|
| Push-ups (all variations), Burpees, Squat thrusts, Jumping jacks, Mountain climbers, High knees, Fast feet, Skaters, Tricep dips, Pike push-ups, Commandos, Wrist push-ups | 8.0 |
| Step-ups, Inchworms | 6.0 |
| Air squats, Sumo squats, Lunges (all variations), Single-leg deadlifts, Reverse lunges | 5.0 |
| Shoulder taps, Chair squats, Standing march | 4.0 |
| Plank, Side plank, Bear crawl hold, Wall sit, Hollow body, Superman hold, Bicycle crunches, Flutter kicks, Leg raises, Russian twists, Dead bugs | 3.8 |
| Calf raises, Glute bridges, Desk push-ups, Wall push-ups | 3.5 |
| Standing calf raises | 3.0 |
| Arm circles, Hip circles, Toe touches, Seated leg raises | 2.5 |
| Neck rolls, Cat-cow stretch, Thoracic rotations, Seated spinal twist | 2.0 |
| Wrist circles | 1.5 |
````

- [ ] **Step 2: Verify**

Run: `grep -i "supabase\|curl\|secret_token\|leaderboard\|pending-sync" skills/clawdbod/SKILL.md`
Expected: no output

Run: `head -5 skills/clawdbod/SKILL.md`
Expected: YAML frontmatter starting with `---` and `name: clawdbod`

- [ ] **Step 3: Commit**

```bash
git add skills/clawdbod/SKILL.md
git commit -m "feat!: SKILL.md frontmatter + local logging, drop leaderboard"
```

### Task 7: Command surface — delete 3, rewrite 6, add export, touch 2

**Files:**
- Delete: `commands/leaderboard.md`, `commands/sync.md`, `commands/recover.md`
- Create: `commands/export.md`
- Modify (full replace): `commands/fitness.md`, `commands/setup.md`, `commands/config.md`, `commands/history.md`, `commands/status.md`, `commands/help.md`
- Modify (frontmatter only): `commands/pause.md`, `commands/resume.md`

- [ ] **Step 1: Delete the dead commands**

```bash
git rm commands/leaderboard.md commands/sync.md commands/recover.md
```

- [ ] **Step 2: Create `commands/export.md`**

````markdown
---
description: Export your full workout history to a CSV or JSON file.
argument-hint: [csv|json] [output path]
---

# ClawdBod Export

Export the local workout log to a file the user can open in a spreadsheet or process programmatically.

## Steps

1. Determine format and output path from $ARGUMENTS:
   - Contains "json" → JSON; otherwise CSV (the default)
   - A path-like argument (contains "/" or ends in `.csv`/`.json`) → pass as `--out`
2. Run with the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/export-workouts.mjs" --format csv
   ```
   Add `--format json` and/or `--out PATH` per step 1. With no `--out`, the file lands in the current working directory as `clawdbod-export-YYYY-MM-DD.csv` (or `.json`).
3. Relay the script output — the file path written and the totals line. Keep it to two lines.
   - "No workouts logged yet" → relay it and suggest `/clawdbod:fitness`.
   - Script error → show it briefly. Retry at most once.

## Output format details (if the user asks)

- CSV columns: `date, time, exercise, unit, count, calories` (local timezone; `calories` empty when no profile was set)
- JSON: `{ exported_at, totals: { sets, reps, calories }, workouts: [...] }` — raw log entries with ISO timestamps
````

- [ ] **Step 3: Replace `commands/fitness.md`**

````markdown
---
description: Take a fitness break right now. Get a random exercise challenge or request a HIIT workout for a longer wait.
argument-hint: [hiit 5 | hiit 10 | summary]
---

# Fitness Break

Give the user an exercise challenge right now.

**Before doing anything else**, read `~/.claude/clawdbod/config.json` so you have the profile data ready for calorie estimates. If the file doesn't exist, skip calories silently.

## Routing

- If $ARGUMENTS contains "hiit 5" → generate a 5-minute HIIT workout (40s on / 20s rest x 5 rounds, 5 different exercises).
- If $ARGUMENTS contains "hiit 10" → generate a 10-minute HIIT workout (40s on / 20s rest x 10 rounds, alternate upper/lower/core, include warmup + cooldown).
- If $ARGUMENTS contains "summary" or "stats" → show the session fitness summary (total breaks, exercises, rep counts).
- Otherwise → do a quick micro-break (steps below).

## Quick micro-break flow

### 1. Pick ONE random exercise from this pool:

**Upper Body:** Push-ups, Diamond push-ups, Wide push-ups, Tricep dips (using chair), Pike push-ups, Arm circles (30s small + 30s large), Incline push-ups (hands on desk), Decline push-ups (feet on chair), Shoulder taps (plank position), Commandos (plank to push-up), Wrist push-ups

**Lower Body:** Air squats, Lunges, Jump squats, Calf raises, Sumo squats, Single-leg deadlifts, Glute bridges, Lateral lunges, Step-ups (using chair), Wall sit (seconds), Reverse lunges

**Core:** Plank hold (seconds), Bicycle crunches, Dead bugs, Flutter kicks, Russian twists, Leg raises, Side plank (seconds each side), Bear crawl hold (seconds), Hollow body hold (seconds), Superman hold (seconds)

**Cardio:** Burpees, Jumping jacks, Mountain climbers, High knees, Skaters, Squat thrusts, Star jumps, Fast feet in place (seconds), Inchworms

**Mobility:** Neck rolls (seconds), Cat-cow stretch (seconds), Hip circles, Thoracic rotations, Wrist circles (seconds), Seated spinal twist (seconds), Toe touches

**Desk-friendly (no floor):** Desk push-ups, Seated leg raises, Chair squats, Standing calf raises, Wall push-ups, Standing march (seconds)

### 2. Present the challenge with energy:
```
⏸️ BREAK TIME — PUSH-UPS!

Drop and give me as many push-ups as you can before you quit.
No judgment, no minimum. Just move.

👉 How many did you get?
```

### 3. Wait for the user's response (they'll type a number).

### 4. After they respond, do ALL of these in the SAME response:

**a) Celebrate the effort** — be genuine, not corny. Encouraging if low, impressed if high, never doubtful.

**b) Estimate calories** (only if config.json has a `profile` with `weight_lbs`):
- Formula: `calories = MET × (weight_lbs × 0.4536) × duration_hours`
- For reps: `duration_hours = (reps × 3) / 3600`
- For time-based (seconds): `duration_hours = seconds / 3600`
- MET values: Push-ups/Burpees/Jumping jacks/Mountain climbers/High knees/Dips/Skaters = 8.0 | Squats/Lunges = 5.0 | Plank/Crunches/Flutter kicks = 3.8 | Calf raises/Glute bridges = 3.5 | Step-ups/Inchworms = 6.0 | Mobility = 2.0-2.5
- Show briefly: "~4.2 cal burned"
- If no profile, skip calories silently.

**c) Log the workout (MANDATORY)** — run this with the Bash tool IMMEDIATELY:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/log-workout.mjs" --exercise "EXERCISE_NAME" --count COUNT --unit reps --calories CALORIES
```

Replace placeholders with actual values. Use the exact exercise name as presented (e.g. "Push-ups"). Use `--unit seconds` for time-based exercises. Omit `--calories` if no profile.

- Prints `ok` → logged. No need to mention it.
- **Any failure** → say "couldn't save that one" briefly and move on. Never block the session over logging.

**d) Transition back to work:** "Alright, back to it. Where were we..."

## Tone

- Gym buddy, not doctor. Never preachy.
- Keep it SHORT — this is a break, not a lecture.
- Use emoji sparingly (🏋️ ⏸️ 💪 🔥).
````

- [ ] **Step 4: Replace `commands/setup.md`**

````markdown
---
description: Get started with ClawdBod — set your break cadence and an optional profile for calorie estimates.
argument-hint: ""
---

# ClawdBod Setup

Walk the user through onboarding. **First, read `~/.claude/clawdbod/config.json`.** If it doesn't exist, silently create it (and the directory) with these defaults before continuing:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields.**

## Flow

### Step 1 — Welcome

If they already have a `profile` in config.json — they're fully set up:
```
You're already set up! Everything looks good:

  Profile:      set (6'4", 265 lbs, 40, male)
  Breaks:       every 8 prompts (20 min cooldown)

Need to change anything? Try /clawdbod:config
```

If they're brand new (no profile):
```
Let's get you set up on ClawdBod — takes about 30 seconds.

Breaks are currently every 8 prompts with a 20 minute cooldown. Want to change that, or keep the defaults?
```

Apply any cadence changes to config.json, then move to Step 2.

### Step 2 — Profile (optional but encouraged)

```
Quick optional step — sharing a couple details lets me estimate calories burned during breaks. This stays in a local file on your machine and is never uploaded anywhere.

- Height? (like 5'10 or 70 inches)
- Weight in lbs?
- Age?
- Gender? (male/female/other)

Or just say "skip" to skip all of this.
```

If they provide values:
- Convert feet/inches to total inches (5'10 = 70, 6'1 = 73, etc.)
- Read existing config.json, merge in the `profile` object, write it back:
  ```json
  { "profile": { "height_inches": 70, "weight_lbs": 175, "age": 30, "gender": "male" } }
  ```

If they say "skip" — that's fine, move to Step 3.

### Step 3 — Confirm

```
You're all set!

  Profile:      set (5'10", 175 lbs, 30, male)
  Breaks:       every 8 prompts (20 min cooldown)
  Your data:    ~/.claude/clawdbod/ (local only)

Every break gets logged automatically. Check your stats with /clawdbod:history, or export everything with /clawdbod:export.
```

If they skipped profile, show `Profile: not set (add later with /clawdbod:config profile)`.

## UX rules

- Conversational, not robotic. Gym buddy signing them up, not a form.
- Ask all profile fields at once — let them answer however they want.
- Don't over-explain. They ran /setup — they want in.
````

- [ ] **Step 5: Replace `commands/config.md`**

````markdown
---
description: View or change ClawdBod settings — break frequency, cooldown, profile, or reset.
argument-hint: [prompts N | minutes N | profile | reset]
---

# ClawdBod Config

**First, read `~/.claude/clawdbod/config.json`.** If the file doesn't exist, silently create it (and the directory) with these defaults before continuing — do NOT mention the missing file to the user:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields (profile, etc.).**

---

## If $ARGUMENTS is empty — show current settings

```
ClawdBod Settings:
  Break every N prompts:    8
  Min minutes between:      20
  Profile:                  set (6'4", 265 lbs, 40, male)
  Data location:            ~/.claude/clawdbod/ (local only)
```

If profile is set, show the details; otherwise show `not set (add with /clawdbod:config profile)`. Then ask if they'd like to change anything.

---

## If $ARGUMENTS contains "prompts" + a number

Update `promptsBetweenBreaks` in config.json. Confirm the change.

## If $ARGUMENTS contains "minutes" + a number

Update `minMinutesBetweenBreaks` in config.json. Confirm the change.

---

## If $ARGUMENTS contains "profile"

1. Ask for all at once (all optional — they can skip any):
   - Height (like 5'10 or 70 inches)
   - Weight (lbs)
   - Age
   - Gender (male/female/other)
2. Save to config.json as a `profile` object:
   ```json
   { "profile": { "height_inches": 70, "weight_lbs": 175, "age": 30, "gender": "male" } }
   ```
   Convert feet/inches to total inches (5'10 = 70).
3. Confirm what was saved. Mention this enables calorie estimates and stays local.

---

## If $ARGUMENTS contains "reset"

1. Warn them: this resets break settings and profile to defaults. Their workout history (`workouts.jsonl`) is NOT touched.
2. If they confirm, overwrite config.json with defaults only:
   ```json
   { "promptsBetweenBreaks": 8, "minMinutesBetweenBreaks": 20 }
   ```

---

After any change, confirm what was updated and show the new settings. Keep it brief.
````

- [ ] **Step 6: Replace `commands/history.md`**

````markdown
---
description: View your recent exercise history and stats from the local workout log.
argument-hint: [number of entries | all]
---

# ClawdBod History

Your workout log lives at `~/.claude/clawdbod/workouts.jsonl` — one JSON object per line:
`{"ts":"...","exercise":"Push-ups","unit":"reps","count":25,"calories":5.0}`

## Steps

1. Determine how many entries to show:
   - Default: 20
   - If $ARGUMENTS is a number, use that (max 100)
   - If $ARGUMENTS is "all", use 100
2. Read the log with the Bash tool (newest entries are at the end):
   ```bash
   tail -n LIMIT ~/.claude/clawdbod/workouts.jsonl
   ```
   For totals, also run:
   ```bash
   wc -l < ~/.claude/clawdbod/workouts.jsonl
   ```
3. If the file doesn't exist or is empty: "No reps logged yet. Your next fitness break will start tracking automatically." — and stop.
4. Compute stats from the entries you read plus the line count, then display newest-first.

## Display

```
Your ClawdBod Stats

  Total sets:      34
  Total reps:      847
  Total calories:  198.4

Recent Activity
  Date        Exercise            Count   Cal
  Jun 11      Push-ups            25      5.0
  Jun 11      Air squats          40      6.5
  Jun 10      Plank hold          45s     2.8
  Jun 10      Burpees             15      4.8
```

- Format dates as short month + day (e.g. "Jun 11")
- Time-based entries (unit "seconds") show the count with an `s` suffix
- Right-align numbers; if calories is null, show "-"
- Total reps counts only rep-based entries; total calories sums what's there
- If showing fewer entries than the full log, note it: "Showing last 20 of 34 — /clawdbod:export for everything"
- Keep it clean and scannable
````

- [ ] **Step 7: Replace `commands/status.md`**

````markdown
---
description: Quick health check — verify your ClawdBod setup is working (config, workout log, break state).
argument-hint: ""
---

# ClawdBod Status

Run a quick local diagnostic. No network involved — everything lives on this machine.

## Steps

1. **Check config** — read `~/.claude/clawdbod/config.json`:
   - `promptsBetweenBreaks` and `minMinutesBetweenBreaks` (defaults 8 / 20 if missing)
   - Whether `profile` exists
2. **Check the workout log** — with the Bash tool:
   ```bash
   wc -l < ~/.claude/clawdbod/workouts.jsonl 2>/dev/null || echo 0
   ```
3. **Check pause state** — read `state.json` in the OS temp dir (`$TMPDIR/clawdbod/state.json` on macOS, `/tmp/clawdbod/state.json` on Linux). If `pausedUntil` is `-1` → paused indefinitely; a future timestamp → paused until then; otherwise active.

4. **Display results:**

```
ClawdBod Status

  Config:       ok (every 8 prompts, 20 min cooldown)
  Profile:      set
  Workout log:  84 sets recorded
  Breaks:       active
  Data:         ~/.claude/clawdbod/ (local only)

Everything looks good!
```

## If something is off

- No config file → "Using defaults (8 prompts / 20 min). Run `/clawdbod:setup` to customize."
- No profile → "No profile set — add one with `/clawdbod:config profile` for calorie tracking."
- Empty/missing log → "No workouts logged yet. They'll start recording automatically at your next break."
- Paused → "Breaks are paused. Run `/clawdbod:resume` to get moving again."

Keep it concise — just the facts and action items.
````

- [ ] **Step 8: Replace `commands/help.md`**

````markdown
---
description: See all available ClawdBod commands.
argument-hint: ""
---

# ClawdBod Help

Display this command reference. Keep it short and scannable — no extra explanation needed.

```
ClawdBod — Fitness breaks for your coding sessions

Commands:
  /clawdbod:fitness              Quick exercise challenge (random each time)
  /clawdbod:fitness hiit 5       5-minute HIIT workout
  /clawdbod:fitness hiit 10      10-minute HIIT workout
  /clawdbod:fitness summary      Session exercise summary

  /clawdbod:setup                Get started — break cadence + profile
  /clawdbod:config               View/change settings
  /clawdbod:config profile       Set height, weight, age for calorie tracking
  /clawdbod:config prompts 12    Change break frequency
  /clawdbod:config minutes 30    Change cooldown between breaks

  /clawdbod:history              Your recent reps and stats
  /clawdbod:export               Export all workouts to CSV
  /clawdbod:export json          Export all workouts to JSON

  /clawdbod:pause                Pause breaks (indefinitely)
  /clawdbod:pause 30             Pause breaks for 30 minutes
  /clawdbod:resume               Resume breaks after pausing

  /clawdbod:status               Check if everything is working
  /clawdbod:help                 This help message

All data stays on your machine in ~/.claude/clawdbod/
```

Print exactly the block above. Don't add anything else unless the user asks a follow-up question.
````

- [ ] **Step 9: Update frontmatter in `commands/pause.md`**

Replace its frontmatter block (keep the body unchanged):

```yaml
---
description: Pause fitness breaks — for deep focus, calls, or demos. Breaks resume automatically or with /clawdbod:resume.
argument-hint: [minutes]
---
```

- [ ] **Step 10: Update frontmatter in `commands/resume.md`**

Replace its frontmatter block (keep the body unchanged):

```yaml
---
description: Resume fitness breaks after pausing.
argument-hint: ""
---
```

- [ ] **Step 11: Verify no Supabase remnants in commands**

Run: `grep -ril "supabase\|secret_token\|passphrase\|leaderboard\|pending-sync\|opt-in\|opt-out" commands/ skills/`
Expected: no output

Run: `grep -rl "argument_description" commands/`
Expected: no output

- [ ] **Step 12: Commit**

```bash
git add commands/
git commit -m "feat!: local-first command surface — add export, drop leaderboard/sync/recover"
```

### Task 8: Rewrite `README.md`

**Files:**
- Modify: `README.md` (full replace below)

- [ ] **Step 1: Replace `README.md` with:**

````markdown
# 🏋️ ClawdBod

Fitness breaks for [Claude Code](https://code.claude.com). Stay active while you ship.

ClawdBod injects quick exercise challenges into your coding sessions — micro-breaks between prompts and scaled HIIT workouts during long-running tasks. Every rep is logged **locally on your machine** and can be exported to CSV or JSON anytime.

## Install

```
/plugin marketplace add khur/clawdbod
/plugin install clawdbod
/reload-plugins
```

Then optionally:

```
/clawdbod:setup
```

to set your break cadence and an optional profile (height/weight/age) for calorie estimates.

## How it works

A Stop hook counts your prompts. After a configurable number of prompts (default 8) and a minimum cooldown (default 20 minutes), Claude pauses to throw you a quick exercise challenge — push-ups, squats, planks, one of 54+ exercises. You type how many you did, Claude logs it, and you're back to code. Two or three exchanges, max.

If you're mid-deploy or debugging something hairy, breaks skip themselves. If you say "not now," that's the end of it.

## Commands

| Command | What it does |
|---|---|
| `/clawdbod:fitness` | Exercise challenge right now (`hiit 5` / `hiit 10` for workouts, `summary` for session stats) |
| `/clawdbod:setup` | Break cadence + optional profile |
| `/clawdbod:config` | View/change settings (`prompts 12`, `minutes 30`, `profile`, `reset`) |
| `/clawdbod:history` | Recent reps and stats |
| `/clawdbod:export` | Export all workouts to CSV (or `json`) |
| `/clawdbod:pause` / `/clawdbod:resume` | Mute breaks for focus, calls, demos |
| `/clawdbod:status` | Local health check |
| `/clawdbod:help` | Command reference |

## Your data

Everything lives in `~/.claude/clawdbod/` on your machine:

- `config.json` — break cadence and optional profile
- `workouts.jsonl` — append-only workout log, one JSON entry per set

**Nothing is uploaded anywhere.** No accounts, no tokens, no telemetry. `/clawdbod:export` writes a CSV or JSON file wherever you want it:

```
/clawdbod:export                 # clawdbod-export-2026-06-12.csv in the current directory
/clawdbod:export json ~/Desktop/workouts.json
```

CSV columns: `date, time, exercise, unit, count, calories`.

## Configuration

| Setting | Default | Change with |
|---|---|---|
| Prompts between breaks | 8 | `/clawdbod:config prompts N` |
| Min minutes between breaks | 20 | `/clawdbod:config minutes N` |
| Profile (calorie estimates) | unset | `/clawdbod:config profile` |

Env var overrides for a single session: `CLAWDBOD_PROMPTS`, `CLAWDBOD_MINUTES`.

## Changelog

### 2.0.0

**Breaking:** the global leaderboard is gone, and with it the `leaderboard`, `sync`, and `recover` commands, usernames, tokens, and passphrases. All tracking is now local-only with CSV/JSON export. There is no migration from 1.x server-side history — your local log starts fresh, and your profile needs re-entering via `/clawdbod:setup`. Mutable data moved out of the plugin directory into `~/.claude/clawdbod/`, so it now survives plugin updates.

### 1.x

Leaderboard era. RIP `muscle_dev`'s 1,247 reps.

## Development

```bash
node --test tests/        # script tests
claude plugin validate .  # manifest validation
```

## License

MIT
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for local-first 2.0"
```

### Task 9: Final plugin verification

- [ ] **Step 1: Repo-wide Supabase sweep**

Run: `grep -ri "supabase\|secret_token\|donzfzefsmjiobzqdqok" --exclude-dir=.git --exclude-dir=docs --exclude=config.json .`
Expected: no output (docs/ excluded because the spec/plan legitimately mention the history; the untracked local `config.json` may still hold the old token — fine, it's the maintainer's local file)

- [ ] **Step 2: Full test suite + validation**

Run: `node --test tests/`
Expected: 11 passing

Run: `claude plugin validate .`
Expected: passes

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

# Part B — Site repo (`/Users/kylehurst/projects/fgalabs/projects/junkdrawer/clawdbod/clawdbod-site`)

All Part B commands run from that directory.

### Task 10: Remove Supabase-backed components

**Files:**
- Delete: `src/components/Leaderboard.tsx`, `src/components/LiveFeed.tsx`, `src/components/StatsBar.tsx`, `src/lib/supabase.ts`, `src/data/leaderboard.ts`
- Modify: `src/App.tsx`, `src/components/Nav.tsx`

- [ ] **Step 1: Delete the files**

```bash
git rm src/components/Leaderboard.tsx src/components/LiveFeed.tsx src/components/StatsBar.tsx src/lib/supabase.ts src/data/leaderboard.ts
```

- [ ] **Step 2: Update `src/App.tsx`**

Remove the three imports:
```tsx
import { StatsBar } from './components/StatsBar'
import { LiveFeed } from './components/LiveFeed'
import { Leaderboard } from './components/Leaderboard'
```

Replace the `<main>` block with (StatsBar/LiveFeed/Leaderboard removed, dividers rebalanced):

```tsx
            <main>
              <Hero />
              <AsciiDivider variant={1} />
              <HowItWorks />
              <AsciiDivider variant={0} />
              <InteractiveDemo />
              <AsciiDivider variant={3} />
              <BeforeAfter />
              <AsciiDivider variant={1} />
              <Features />
              <AsciiDivider variant={0} />
              <Testimonials />
              <AsciiDivider variant={3} />
              <ExerciseCategories />
              <AsciiDivider variant={0} />
              <FAQ />
              <AsciiDivider variant={3} />
              <Install />
            </main>
```

- [ ] **Step 3: Update `src/components/Nav.tsx`**

Replace the `links` array (drops the leaderboard anchor):

```tsx
const links = [
  { href: '#how-it-works', label: 'How it works', id: 'how-it-works' },
  { href: '#features', label: 'Features', id: 'features' },
  { href: '#install', label: 'Install', id: 'install' },
]
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "feat!: remove Supabase leaderboard, live feed, and stats bar"
```

### Task 11: Local-first copy — Hero, Features, FAQ, index.html

**Files:**
- Modify: `src/components/Hero.tsx:229`
- Modify: `src/components/Features.tsx:75-122`
- Modify: `src/components/FAQ.tsx:18-29`
- Modify: `index.html:17,27,39`
- Modify: `scripts/og-image.html:278`

- [ ] **Step 1: Hero badge** (`src/components/Hero.tsx` line 229)

Replace:
```tsx
        <Badge variant="secondary" className="font-mono text-accent-green border-accent-green/30">Global leaderboard</Badge>
```
with:
```tsx
        <Badge variant="secondary" className="font-mono text-accent-green border-accent-green/30">100% local data</Badge>
```

- [ ] **Step 2: Features cards** (`src/components/Features.tsx`)

Replace the "Global leaderboard" card:
```tsx
  {
    icon: `┌─────┐
│ #1  │
│ 🏆  │
└─────┘`,
    title: 'Global leaderboard',
    desc: 'Compete with devs worldwide. Weekly and all-time rankings',
  },
```
with:
```tsx
  {
    icon: `┌─────┐
│ CSV │
│JSON │
└─────┘`,
    title: 'CSV/JSON export',
    desc: 'Your full workout history as a file, anytime. /clawdbod:export',
  },
```

Replace the "History & sync" card:
```tsx
  {
    icon: `┌─────┐
│ 📊 │
│HIST │
└─────┘`,
    title: 'History & sync',
    desc: 'Track your reps and stats. Failed uploads retry with /sync',
  },
```
with:
```tsx
  {
    icon: `┌─────┐
│ 📊 │
│HIST │
└─────┘`,
    title: 'Local history',
    desc: 'Every rep logged on your machine. Nothing leaves it',
  },
```

In the "Fully configurable" card, replace the desc:
```tsx
    desc: 'Prompts, minutes, profile, leaderboard -- all adjustable',
```
with:
```tsx
    desc: 'Prompts, minutes, profile -- all adjustable',
```

- [ ] **Step 3: FAQ answers** (`src/components/FAQ.tsx`)

Replace:
```tsx
  {
    q: 'Can my team see my data?',
    a: "Only if you opt into the leaderboard. Everything is opt-in. Your reps, your rules.",
  },
```
with:
```tsx
  {
    q: 'Can my team see my data?',
    a: "No. Every rep is logged to a local file on your machine -- nothing is uploaded anywhere. Want it out? /clawdbod:export gives you CSV or JSON.",
  },
```

Replace:
```tsx
  {
    q: 'What if I switch machines?',
    a: 'Run /clawdbod:recover with your username and passphrase. Your credentials and profile are restored automatically. Set a passphrase anytime with /clawdbod:config passphrase.',
  },
```
with:
```tsx
  {
    q: 'What if I switch machines?',
    a: 'Your data lives in ~/.claude/clawdbod -- copy that folder over and your history and settings come with you. Or run /clawdbod:export json first for a portable backup.',
  },
```

- [ ] **Step 4: Meta descriptions** (`index.html` lines 17, 27, 39)

In all three meta tags, replace the phrase `54+ exercises, global leaderboard, calorie tracking` with `54+ exercises, local tracking, CSV/JSON export, calorie estimates`.

- [ ] **Step 5: OG image source** (`scripts/og-image.html` line 278)

Replace:
```html
        <div class="badge badge-green">Leaderboard</div>
```
with:
```html
        <div class="badge badge-green">Local data</div>
```

(Regenerating `public/og-image.png` via `node scripts/generate-og-image.mjs` is optional — do it if the script runs cleanly, otherwise leave the PNG for a follow-up.)

- [ ] **Step 6: Build check + commit**

Run: `npm run build`
Expected: success

```bash
git add -A
git commit -m "feat: local-first copy across hero, features, FAQ, and meta tags"
```

### Task 12: Rework the InteractiveDemo terminal

**Files:**
- Modify: `src/components/InteractiveDemo.tsx`

- [ ] **Step 1: Remove the `/leaderboard` branch** (lines ~92-105)

Delete this entire `else if` block:
```tsx
    } else if (trimmed === '/leaderboard' || trimmed === 'leaderboard') {
      ...
    }
```

- [ ] **Step 2: Remove the `/sync` branch** (lines ~173-181)

Delete this entire `else if` block:
```tsx
    } else if (trimmed === '/sync' || trimmed === 'sync') {
      ...
    }
```

- [ ] **Step 3: Replace the `/setup` output lines**

Inside the `/setup` branch, replace the addLines content:
```tsx
          { text: '' },
          { text: '--- ClawdBod Setup ---', color: 'text-accent-blue' },
          { text: '' },
          { text: '  Welcome! Let\'s get you set up.', color: 'text-foreground' },
          { text: '' },
          { text: '  1. Break cadence', color: 'text-accent-green' },
          { text: '     > every 8 prompts, 20 min cooldown  ✓', color: 'text-muted-foreground' },
          { text: '' },
          { text: '  2. Profile (all optional)', color: 'text-accent-green' },
          { text: '     > height: 5\'10"  weight: 170lb  age: 28', color: 'text-muted-foreground' },
          { text: '' },
          { text: '  ✓ All set! Here\'s your config:', color: 'text-accent-green' },
          { text: '    Profile:  configured', color: 'text-foreground' },
          { text: '    Data:     ~/.claude/clawdbod (local only)', color: 'text-accent-green' },
          { text: '' },
          { text: '  Ready to go! Breaks start automatically.', color: 'text-muted-foreground' },
          { text: '' },
```

- [ ] **Step 4: Replace the `/config` output lines**

```tsx
          { text: '' },
          { text: 'ClawdBod Settings:', color: 'text-accent-blue' },
          { text: '  Break every:    8 prompts', color: 'text-foreground' },
          { text: '  Min interval:   20 minutes', color: 'text-foreground' },
          { text: '  Profile:        set', color: 'text-accent-green' },
          { text: '  Exercises:      54+', color: 'text-foreground' },
          { text: '' },
```

- [ ] **Step 5: Replace the `/status` output lines**

```tsx
          { text: '' },
          { text: 'ClawdBod Status', color: 'text-accent-blue' },
          { text: '  Config:       ok (8 prompts / 20 min)', color: 'text-accent-green' },
          { text: '  Workout log:  84 sets recorded', color: 'text-accent-green' },
          { text: '  Breaks:       active (5 until next)', color: 'text-foreground' },
          { text: '  Data:         ~/.claude/clawdbod (local)', color: 'text-foreground' },
          { text: '' },
```

- [ ] **Step 6: Add an `/export` branch** (after the `/history` branch)

```tsx
    } else if (trimmed === '/export' || trimmed === 'export') {
      setTimeout(() => {
        addLines(
          { text: '' },
          { text: '  Exported 84 workouts to', color: 'text-accent-green' },
          { text: '  ./clawdbod-export-2026-06-12.csv', color: 'text-accent-amber' },
          { text: '  Totals: 84 sets, 1,932 reps, 412.6 cal', color: 'text-muted-foreground' },
          { text: '' },
        )
      }, 300)
```

- [ ] **Step 7: Replace the `/help` command list**

```tsx
        { text: 'Commands:', color: 'text-accent-blue' },
        { text: '  /setup        Guided first-time setup', color: 'text-foreground' },
        { text: '  /fitness      Exercise challenge (+ hiit 5/10)', color: 'text-foreground' },
        { text: '  /config       View/change settings', color: 'text-foreground' },
        { text: '  /history      Your reps and stats', color: 'text-foreground' },
        { text: '  /export       Export workouts to CSV/JSON', color: 'text-foreground' },
        { text: '  /pause        Pause breaks', color: 'text-foreground' },
        { text: '  /resume       Resume breaks', color: 'text-foreground' },
        { text: '  /status       Health check', color: 'text-foreground' },
```

- [ ] **Step 8: Build + commit**

Run: `npm run build`
Expected: success

```bash
git add src/components/InteractiveDemo.tsx
git commit -m "feat: demo terminal goes local-first — /export replaces /leaderboard and /sync"
```

### Task 13: Final site verification

- [ ] **Step 1: Sweep for remnants**

Run: `grep -rni "supabase\|leaderboard" src/ index.html scripts/og-image.html`
Expected: no output

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: both pass (pre-existing lint warnings unrelated to these files are acceptable; new errors are not)

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-review notes

- Spec §1 (data/storage) → Tasks 2, 5 (data dir constant, JSONL shape, no migration)
- Spec §2 (scripts) → Tasks 2, 3
- Spec §3 (commands) → Task 7
- Spec §4 (SKILL.md) → Task 6
- Spec §5 (manifests/hook/README/gitignore) → Tasks 1, 4, 5, 8
- Spec §6 (site) → Tasks 10-12
- Spec §7 (testing) → embedded per task + Tasks 9, 13
- Shared Supabase project untouched throughout — no Supabase tooling is ever invoked.
