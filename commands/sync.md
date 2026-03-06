---
description: Retry uploading any reps that failed to sync to the leaderboard.
argument_description: No arguments needed.
---

# ClawdBod Sync

Retry any reps that were saved locally when the leaderboard API was unreachable.

## Steps

1. **Read `${CLAUDE_PLUGIN_ROOT}/pending-sync.json`.** If the file doesn't exist or is empty (`[]`), tell the user:
   "Nothing to sync — all your reps are up to date."

2. **Show what's pending** before attempting sync:
   ```
   Found 3 pending reps to sync:
     - Push-ups (25) from Mar 5
     - Air squats (40) from Mar 5
     - Burpees (15) from Mar 4

   Syncing now...
   ```

3. **Attempt each one** by calling the log-reps endpoint:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/log-reps" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"SECRET_TOKEN","exercise":"EXERCISE","count":COUNT,"calories":CALORIES_OR_NULL}'
   ```
   Use the `username`, `secret_token`, `exercise`, `count`, and `calories` from each pending entry.

4. **Track results.** For each entry:
   - **201** → success, remove from the pending list
   - **Any failure** → keep in the pending list for next retry

5. **Write back `pending-sync.json`** with only the entries that still failed. If all succeeded, write `[]`.

6. **Report results:**

   All synced:
   ```
   All 3 reps synced successfully. You're up to date!
   ```

   Partial:
   ```
   Synced 2 of 3 reps. 1 still pending — the server may be having issues. Try /clawdbod:sync again later.
   ```

   All failed:
   ```
   Couldn't reach the server. All 3 reps are still saved locally. Try /clawdbod:sync again later.
   ```

Keep it brief. Don't retry more than once per entry in a single sync run.
