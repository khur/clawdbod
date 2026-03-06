---
description: View your recent exercise history and stats.
argument_description: Optional — a number like "50" to see more entries (default 20), or "all" for up to 100.
---

# ClawdBod History

**First, read `${CLAUDE_PLUGIN_ROOT}/config.json`** for username and secret_token.

If no username or secret_token is set, tell them:
"You need to be on the leaderboard to track history. Run `/clawdbod:setup` to get started."

## Fetching history

```bash
curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/history" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","secret_token":"SECRET_TOKEN","limit":LIMIT}'
```

- Default limit: 20
- If $ARGUMENTS is a number, use that (max 100)
- If $ARGUMENTS is "all", use 100

If the curl fails or returns an error, say: "Couldn't reach the server right now. Try again in a minute."

## Display

```
Your ClawdBod Stats

  Total sets:      34
  Total reps:      847
  Total calories:  198.4

Recent Activity
  Date        Exercise            Reps    Cal
  Mar 5       Push-ups            25      5.0
  Mar 5       Air squats          40      5.0
  Mar 4       Jumping jacks       60      12.1
  Mar 4       Plank hold          45      2.8
  Mar 3       Burpees             15      4.8
```

- Format dates as short month + day (e.g. "Mar 5")
- Right-align numbers
- If calories is null, show "-"
- If history is empty: "No reps logged yet. Your next fitness break will start tracking automatically."
- Keep it clean and scannable
