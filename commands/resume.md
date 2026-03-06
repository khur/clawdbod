---
description: Resume fitness breaks after pausing.
argument_description: No arguments needed.
---

# Resume Breaks

Clear the pause state so fitness breaks fire again.

Use the Bash tool:

```bash
node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = path.join(os.tmpdir(), 'clawdbod');
const stateFile = path.join(dir, 'state.json');
if (!fs.existsSync(stateFile)) { console.log('not_paused'); process.exit(0); }
const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
const wasPaused = 'pausedUntil' in state;
delete state.pausedUntil;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(wasPaused ? 'resumed' : 'not_paused');
"
```

## Response

Based on the script output:

- `resumed` → "Breaks resumed. Next one will fire on schedule."
- `not_paused` → "Breaks aren't paused — you're already good to go."

One line, done.
