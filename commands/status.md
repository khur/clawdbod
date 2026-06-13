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
