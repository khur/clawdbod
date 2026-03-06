---
description: Quick health check — verify your ClawdBod setup is working (registration, leaderboard connection, config).
argument_description: No arguments needed.
---

# ClawdBod Status

Run a quick diagnostic. **First, read `${CLAUDE_PLUGIN_ROOT}/config.json`.**

## Steps (run all curl calls in parallel for speed)

1. **Check local config** — from config.json, note:
   - `promptsBetweenBreaks` and `minMinutesBetweenBreaks`
   - Whether `leaderboard` is `true`
   - Whether `username` and `secret_token` are set
   - Whether `profile` exists

2. **Check API health**:
   ```bash
   curl -s "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/status"
   ```

3. **Test auth** (only if leaderboard is enabled with username + secret_token):
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/history" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"SECRET_TOKEN","limit":1}'
   ```
   200 with data = auth works. 403 = token invalid.

4. **Display results**:

```
ClawdBod Status

  API:          ok (v1.1.0, 3 users)
  Auth:         ok (logged in as khur)
  Leaderboard:  on
  Profile:      set
  Breaks:       every 8 prompts (20 min cooldown)
  Total reps:   84 across 4 sets

Everything looks good!
```

## If something is wrong

Show what failed with a specific fix:
- API unreachable → "ClawdBod API isn't responding. Try again in a minute."
- Auth failed (403) → "Your secret_token doesn't match. Re-register with `/clawdbod:setup`"
- No username → "Not on the leaderboard yet. Run `/clawdbod:setup` to join."
- No profile → "No profile set — add one with `/clawdbod:config profile` for calorie tracking."

Keep it concise — just the facts and action items.
