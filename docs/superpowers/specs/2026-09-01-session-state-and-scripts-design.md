# ClawdBod 2.1 — Per-session state, code-owned stats, script-backed commands

**Date:** 2026-09-01
**Status:** approved (user: "i love it. fix all these things")

## Problem

ClawdBod 2.0 moved workout data to `~/.claude/clawdbod/` but left four
weaknesses in the runtime path:

1. **Cadence state is shared across sessions.** `state.json` lives in the OS
   temp dir. Every Claude Code session (parallel terminals, subagents) bumps the
   same prompt counter and resets each other's cooldown. macOS purges the temp
   dir periodically, so the "first-run setup" block re-fires after reboots.
2. **Numbers are computed by the model.** The skill asks Claude to do MET
   arithmetic for calories, and `/history` asks it to sum totals from
   `tail -n 20` while labelling them "Total reps". Results are inconsistent and
   cost tokens on every break.
3. **Duplicated content.** The exercise pool and MET table appear in both
   `skills/clawdbod/SKILL.md` and `commands/fitness.md`; they will drift.
4. **Fragile inline scripts.** `pause`/`resume` embed `node -e` snippets in
   markdown with a `PAUSE_VALUE` placeholder the model must edit.

Plus hygiene: README documents a test command that fails on Node 22, the hook
reads `/dev/stdin` (not portable), and the README claims workouts trigger
during long-running tasks, which nothing implements.

## Goals

- One session's prompts never affect another session's break timing.
- Onboarding shows once per machine, not once per temp-dir lifetime.
- Calories, totals, and history tables come from code, not the model.
- A single source of truth for the exercise pool and MET table.
- Every command that touches state calls a tested script.

## Non-goals

- Changing the break UX (still 2–3 exchanges, still model-driven copy).
- Config editing scripts (`/config`, `/setup` keep model-driven JSON merge).
- Rewriting git history to remove the 1.x token committed in 1.0.0.
- The "while you wait" workout when a prompt fans out to subagents. Noted in
  the README roadmap; needs its own design.

## Design

### Data layout (`~/.claude/clawdbod/`)

```
config.json                 unchanged — cadence + optional profile
workouts.jsonl              unchanged — append-only log
state.json                  NEW global: { onboarded: bool, pausedUntil?: -1|ms }
sessions/<session_id>.json  NEW per-session: { promptCount, lastBreakAt, updatedAt }
```

- `session_id` comes from the Stop hook's stdin payload. If absent, use
  `"default"`.
- Session files older than 7 days are pruned on each hook run (readdir + stat;
  bounded cost, wrapped in try/catch).
- Pause stays **global**: "mute during my call" is a user-level intent.
- Onboarding is **global**: the setup block fires once, when `state.onboarded`
  is false. If `config.json` already exists, onboarding is marked done
  silently without blocking (the user has clearly set up before).
- The OS temp dir is no longer used. No migration: temp-dir state was
  ephemeral by design.

### Shared library (`scripts/lib/`)

- `paths.mjs` — `dataDir(override?)`, path helpers, `readJson`/`writeJson`
  (atomic write via temp file + rename), `readConfig(dataDir)` with clamped
  cadence values (same rules as the hook today).
- `state.mjs` — `readGlobalState`, `writeGlobalState`, `isPaused(state, now)`,
  `readSession(dataDir, id)`, `writeSession`, `pruneSessions(dataDir, maxAgeMs)`.
- `exercises.mjs` — the exercise pool (by category, with unit) and an ordered
  MET pattern table. `metFor(exerciseName)` matches most-specific pattern
  first (e.g. "Wall push-ups" → 3.5 before "push-up" → 8.0); unknown names
  fall back to 4.0. `estimateCalories({ exercise, unit, count, weightLbs })`
  uses the existing formula (3 s per rep; MET × kg × hours), rounded to 0.1.
- `workouts.mjs` — `readWorkouts(dataDir)` → `{ workouts, skipped }` with the
  validation currently inlined in export; `totals(workouts)`.

The hook imports from `scripts/lib/` (relative path; hooks run under
`node '${CLAUDE_PLUGIN_ROOT}/hooks/...'`, so this works).

### Scripts (`scripts/`)

- `log-workout.mjs` — unchanged CLI, plus: when `--calories` is omitted, read
  `config.json` from the data dir and compute calories from the profile weight.
  Explicit `--calories N` or `--calories null` still wins. Output: `ok` or
  `ok ~4.2 cal`.
- `stats.mjs` — `[--limit N] [--since today|ISO] [--json] [--data-dir]`.
  Prints a ready-to-display block: totals line, "Showing last N of M" when
  truncated, and a fixed-width table (Date, Exercise, Count with `s` suffix for
  seconds, Cal or `-`). `--since today` powers the fitness summary. Empty log
  prints the same friendly message export uses.
- `state.mjs` — `pause [minutes]`, `resume`, `status`.
  - `pause` writes `pausedUntil` to global state; prints `paused indefinitely`
    or `paused until <local time>`.
  - `resume` clears it; prints `resumed` or `not_paused`.
  - `status` prints the full diagnostic block `/status` shows today (config,
    profile, set count, pause state, data dir). Exit 0 always.
- `export-workouts.mjs` — refactored onto `lib/workouts.mjs`; behaviour and
  tests unchanged.

### Hook (`hooks/stop-fitness-check.mjs`)

Same decision logic, new storage:

1. Read stdin via `readFileSync(0)`. Exit 0 on parse failure or
   `stop_hook_active`.
2. Load config, global state, session state (by `session_id`).
3. Onboarding: if `!onboarded` → mark onboarded; if no `config.json`, emit the
   setup block; otherwise continue silently.
4. Pause check against global state (expired pause is cleared and written).
5. Increment `promptCount`; evaluate `shouldBreak` exactly as today; write
   session state; emit the break block or exit 0.
6. Prune old session files (best effort).
7. Everything inside one try/catch that exits 0.

The break block's instructions change in one way: the log command no longer
passes `--calories`; the script computes it.

### Commands and skill

- `commands/fitness.md` — remove the duplicated pool and MET table. Route
  `hiit 5` / `hiit 10` / `summary` as today; for the micro-break, read the
  skill file and follow its flow. `summary` runs `stats.mjs --since today`.
- `skills/clawdbod/SKILL.md` — keep the exercise pool (it is the one copy the
  model needs to pick from) and the tone rules. Remove the calorie formula and
  MET table; instruct: run `log-workout.mjs` without `--calories`, relay the
  `~N cal` if printed.
- `commands/history.md` — run `stats.mjs --limit N`, print output verbatim.
- `commands/status.md` — run `state.mjs status`, print output verbatim, then
  the existing "if something is off" hints.
- `commands/pause.md` / `resume.md` — run `state.mjs pause [N]` / `resume`
  and map the one-word result to the existing copy.
- `README.md` — data layout, fixed test command (`node --test`), remove the
  long-running-task claim, 2.1.0 changelog, roadmap note for the subagent
  "while you wait" idea.
- `.claude-plugin/plugin.json` — version 2.1.0.

### Testing

`node --test` from repo root (Node 22 discovers `**/*.test.mjs`).

- `lib/exercises`: MET matching specificity, unknown fallback, calorie formula
  for reps and seconds, rounding.
- `lib/state`: pause semantics (indefinite, future, expired), session
  read/write round-trip, prune removes only stale files.
- `log-workout`: existing tests plus auto-calories from a profile in
  `--data-dir`, explicit override, no profile → null.
- `stats`: totals, truncation note, seconds suffix, `--since today`, empty log.
- `state` CLI: pause/resume/status outputs.
- `hook`: driven via stdin with a temp data dir (`CLAWDBOD_DATA_DIR` env
  override, test-only): onboarding fires once; two session ids count
  independently; pause suppresses; break fires at threshold and resets.
- `export`: existing tests unchanged.

### Error handling

Scripts called by commands print a one-line human message and exit 1 on bad
input; commands relay it and stop. The hook never exits non-zero and never
writes to stdout except a valid decision object.
