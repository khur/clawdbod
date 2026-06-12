# ClawdBod 2.0 — Local-First Tracking & Export

**Date:** 2026-06-12
**Status:** Approved
**Repos affected:** `claude-plugins/clawdbod` (plugin), `clawdbod/clawdbod-site` (marketing site)

## Goal

Remove the Supabase-backed global leaderboard and replace it with local-first
workout tracking plus CSV/JSON export. At the same time, modernize the plugin
to current Claude Code plugin/skill/marketplace best practices. Ships as
**v2.0.0** — a breaking change for 1.x leaderboard users.

Decisions made during brainstorming:

- The marketing site is updated in the same effort (leaderboard sections removed).
- No data migration from Supabase — local history starts fresh.
- `leaderboard`, `sync`, and `recover` commands are deleted; remaining commands go fully local.
- The Supabase project is **shared with other apps and must not be touched** —
  this change only removes ClawdBod's use of it. No decommissioning, no
  schema/edge-function cleanup.

## 1. Data & storage

All mutable data moves out of the plugin root (wiped on every plugin update —
the reason the `recover` command had to exist) into a fixed user data
directory: **`~/.claude/clawdbod/`**.

> Amendment (planning): the original design used `${CLAUDE_PLUGIN_DATA}`, but
> that variable is not reliably present in every execution context (Stop hook
> process, Bash tool invocations from command files, manual script runs). If
> contexts resolved different directories, config and the workout log would
> split. A fixed home-dir path gives the same best-practice outcome — mutable
> data out of the update-wiped cache — with guaranteed consistency. Scripts
> accept a `--data-dir` override for tests.

### Files

| File | Location | Contents |
|---|---|---|
| `config.json` | `~/.claude/clawdbod/` | `promptsBetweenBreaks`, `minMinutesBetweenBreaks`, optional `profile` object (`height_inches`, `weight_lbs`, `age`, `gender`) |
| `workouts.jsonl` | `~/.claude/clawdbod/` | Append-only log, one JSON object per line |
| `state.json` | OS tmpdir (`clawdbod/`) | Unchanged — ephemeral session cadence state (`promptCount`, `lastBreakAt`, `setupComplete`, `pausedUntil`) |

Dropped config fields: `username`, `secret_token`, `leaderboard`, `has_passphrase`.
Dropped file: `pending-sync.json` (no network, nothing to retry).

### Workout log entry shape

```json
{"ts":"2026-06-12T18:30:00Z","exercise":"Push-ups","unit":"reps","count":25,"calories":5.0}
```

- `ts` — ISO 8601 UTC timestamp, written at log time
- `exercise` — exact name as presented to the user (e.g. "Push-ups", "Plank hold")
- `unit` — `"reps"` or `"seconds"` (planks, wall sits, holds are time-based)
- `count` — positive integer
- `calories` — number or `null` when no profile is set

### No legacy migration

There is intentionally no migration of the old plugin-root `config.json`:
updating a plugin replaces its cache directory, so the legacy file is already
gone before the 2.0 hook ever runs. Updated users get defaults and re-enter
their profile via `/clawdbod:setup` (consistent with the start-fresh decision
for workout history).

## 2. Plugin scripts

Two small read-only Node scripts ship inside the plugin (static files in the
plugin root are fine — only mutable data moves out):

### `scripts/log-workout.mjs`

Appends one validated entry to `workouts.jsonl`. Called by the skill and
`/clawdbod:fitness` via Bash instead of hand-editing JSON (replaces the
Supabase curl). Behavior:

- Args: `--exercise <name> --count <n> [--unit reps|seconds] [--calories <n>]`
- Creates the data dir and log file if missing
- Validates: non-empty exercise, positive integer count, unit defaults to `reps`
- Appends a single JSONL line with a UTC `ts`; prints `ok` on success
- Never throws into the session — exits non-zero with a one-line error on bad input

### `scripts/export-workouts.mjs`

Reads `workouts.jsonl` and writes an export file. Behavior:

- Args: `--format csv|json` (default `csv`), `--out <path>` (default
  `./clawdbod-export-YYYY-MM-DD.<ext>` in the current working directory)
- CSV columns: `date, time, exercise, unit, count, calories` (local date/time
  split from `ts`; `calories` empty when null); values CSV-escaped
- JSON output: `{ "exported_at": ISO, "totals": { "sets", "reps", "calories" }, "workouts": [ ...entries ] }`
- Empty/missing log → prints a friendly "no workouts logged yet" message and exits 0 without writing a file
- Skips (and counts) malformed lines rather than failing the whole export

## 3. Command surface

| Command | Fate | Notes |
|---|---|---|
| `leaderboard` | **deleted** | |
| `sync` | **deleted** | no pending-sync mechanism anymore |
| `recover` | **deleted** | nothing server-side to recover |
| `export` | **new** | `/clawdbod:export [csv\|json] [path]` → runs `export-workouts.mjs`, reports the written file path and totals |
| `setup` | slimmed | break cadence + optional profile; no registration, passphrase, or API calls |
| `config` | slimmed | view/change cadence + profile, `reset` rewrites defaults; leaderboard/passphrase sections removed |
| `history` | rewritten | reads `workouts.jsonl` (tail N entries, default 20, `all` = 100); same display format |
| `status` | rewritten | local checks: data dir writable, config valid, workout log totals, pause state |
| `fitness` | updated | logging step calls `log-workout.mjs`; on script failure, mention it briefly and move on (never block the session) |
| `pause` / `resume` | unchanged | copy touch-ups only |
| `help` | updated | reflects the new command set |

All command frontmatter migrates from the nonstandard `argument_description`
to the current `argument-hint` field.

## 4. SKILL.md modernization

`skills/clawdbod/SKILL.md` currently has **no frontmatter**. Add:

```yaml
---
name: clawdbod
description: Fitness breaks for coding sessions. Use when the Stop hook signals
  a fitness break or first-run setup, when the user asks for a workout,
  exercise break, or stretch, or when they want to view or export their
  logged workout history.
---
```

Body changes:

- Remove the `secret_token` hard rule and the curl logging block; the logging
  step becomes "run `log-workout.mjs` via Bash; if it fails, mention it briefly
  and move on"
- Config is read from `~/.claude/clawdbod/config.json`
- Keep: tone rules, never-interrupt/never-nag rules, exercise pool, calorie
  formula and MET table (body stays well under the 500-line guidance), HIIT
  workouts, session summary
- Mention `/clawdbod:export` once where tracking is described

## 5. Manifests, hook, README

- **`.claude-plugin/plugin.json`** — add `"version": "2.0.0"`; remove the
  inline `hooks` block; update `description` and `keywords` (drop
  "leaderboard", add "tracking"/"export"/"local")
- **`hooks/hooks.json`** — new file holding the Stop hook registration
  (command + 5s timeout), per current docs
- **`hooks/stop-fitness-check.mjs`** — remove curl instructions from the
  break-injection reason text (logging guidance points at the log script);
  read config from `~/.claude/clawdbod/config.json`; keep the
  `stop_hook_active` guard, clamping, pause logic, and the
  silent-failure wrapper
- **`.claude-plugin/marketplace.json`** — add `"displayName": "ClawdBod"`;
  refresh descriptions to the local-first story
- **`README.md`** — rewrite: install instructions, command reference, where
  data lives (`~/.claude/clawdbod/`), export usage, a "your data never
  leaves your machine" privacy note, and a changelog section flagging 2.0 as
  breaking (leaderboard removed, no migration)
- **`config.json` in repo root** — delete from the repo (it's user data, and
  contains a live secret token; also add to `.gitignore`)
- Validate with `claude plugin validate .` before committing

## 6. Marketing site (`clawdbod-site`)

- **Delete:** `Leaderboard`, `LiveFeed`, `StatsBar` components,
  `src/lib/supabase.ts`, `src/data/leaderboard.ts`, and their imports/usages
  in `App.tsx` and `Nav.tsx`
- **Reposition copy:** Hero/Features/FAQ drop leaderboard claims; add a
  section covering local tracking + CSV/JSON export with a privacy-first
  angle ("your reps never leave your machine")
- **Adjust:** nav links and section order for the removed sections
- **Verify:** clean `npm run build` and lint

## 7. Testing

- `claude plugin validate .` passes
- `log-workout.mjs`: appends valid lines; rejects bad input; creates dir/file
- `export-workouts.mjs`: CSV and JSON outputs from a seeded log; empty-log
  case; malformed-line skipping; CSV escaping (exercise names with commas
  won't occur from the fixed pool, but escape anyway)
- Hook script: run with simulated stdin for first-run, normal-count,
  break-due, paused, and `stop_hook_active` cases; missing/corrupt
  data-dir config falls back to defaults
- Site: `npm run build` clean, no remaining references to supabase/leaderboard
  (`grep -ri supabase src/`)

## 8. Out of scope

- Any change to the shared Supabase project (it serves other apps and stays up)
- Importing historical Supabase data (explicitly decided: start fresh)
- New exercise content or break-cadence behavior changes
