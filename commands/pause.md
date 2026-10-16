---
description: Pause fitness breaks — for deep focus, calls, or demos. Breaks resume automatically or with /clawdbod:resume.
argument-hint: "[30 | 45m | 2h]"
---

# Pause Breaks

Run with the Bash tool. If `$ARGUMENTS` names a duration, pass it through as one quoted argument (the script understands "30", "45m", "90 min", "1h", "2 hours"); otherwise omit it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" pause "DURATION"
```

## Response

- `paused until 3:45 PM` → "Breaks paused until 3:45 PM. They'll kick back in automatically, or run /clawdbod:resume."
- `paused indefinitely` → "Breaks paused. Run /clawdbod:resume when you're ready to get moving again."
- `error: ...` → relay the error in one line.

One line. Don't be preachy about skipping exercise. Pause applies to all your Claude Code sessions.
