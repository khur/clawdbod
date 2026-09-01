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
