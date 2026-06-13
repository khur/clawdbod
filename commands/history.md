---
description: View your recent exercise history and stats from the local workout log.
argument-hint: "[number of entries | all]"
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
