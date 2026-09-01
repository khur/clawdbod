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
