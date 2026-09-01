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
