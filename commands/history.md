---
description: View your recent exercise history and stats from the local workout log.
argument-hint: "[number of entries | all]"
---

# ClawdBod History

1. Pick a limit: default 20; a number in `$ARGUMENTS` → that number (max 100); "all" → 100.
2. Run with the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --limit LIMIT
   ```
3. Print the output verbatim inside a code block. Add nothing else unless the user asks a follow-up.

The script already handles the empty-log case, totals over the whole log, newest-first ordering, and the "Showing last N of M" note.
