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
