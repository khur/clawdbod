---
description: Pause fitness breaks — for deep focus, calls, or demos. Breaks resume automatically or with /clawdbod:resume.
argument_description: Optional — number of minutes to pause (e.g. "30" for 30 min). Leave blank to pause indefinitely until resumed.
---

# Pause Breaks

Temporarily stop fitness breaks without changing any config.

Set `pausedUntil` in the state file:
- If $ARGUMENTS is a number → set `pausedUntil` to `Date.now() + (minutes * 60 * 1000)`
- If $ARGUMENTS is empty → set `pausedUntil` to `-1` (indefinite — until manually resumed)

Use the Bash tool:

```bash
node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = path.join(os.tmpdir(), 'clawdbod');
const stateFile = path.join(dir, 'state.json');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf-8')) : { promptCount: 0, lastBreakAt: 0, setupComplete: true };
state.pausedUntil = PAUSE_VALUE;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log('ok');
"
```

Replace `PAUSE_VALUE` with either `-1` (indefinite) or the calculated timestamp.

## Response

For timed pause:
```
Breaks paused for 30 minutes. They'll kick back in automatically, or run /clawdbod:resume.
```

For indefinite pause:
```
Breaks paused. Run /clawdbod:resume when you're ready to get moving again.
```

One line. Don't be preachy about skipping exercise.
