---
description: View or change ClawdBod settings — break frequency, cooldown, leaderboard, profile, or reset.
argument_description: Optional — "prompts 12", "minutes 30", "leaderboard on/off", "profile", "reset", or leave blank to view current settings.
---

# ClawdBod Config

All API writes go through the edge function at:
```
POST https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/<route>
Content-Type: application/json
```

Read the current config file at `${CLAUDE_PLUGIN_ROOT}/config.json`.

**If $ARGUMENTS is empty**, show the current settings in a clean format:
```
ClawdBod Settings:
  Break every N prompts:    [value]
  Min minutes between:      [value]
  Leaderboard:              [on/off]
  Username:                 [value or "not set"]
  Profile:                  [set/not set]
```
If profile is set, also show: height, weight, age, gender.
Then ask if they'd like to change anything.

**If $ARGUMENTS contains "prompts"** followed by a number, update `promptsBetweenBreaks` in the config file to that number.

**If $ARGUMENTS contains "minutes"** followed by a number, update `minMinutesBetweenBreaks` in the config file to that number.

**If $ARGUMENTS contains "leaderboard on"**, walk the user through opting in:
1. Ask them to pick a username (2-24 characters, letters, numbers, and underscores only)
2. Register via the edge function:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/register" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME"}'
   ```
   - If it returns 201 with `id`, `username`, and `secret_token` — success!
   - If it returns 409 — username is taken, ask them to pick another
   - If it returns 429 — too many registrations, try again later
3. Save to config.json:
   ```json
   {
     "leaderboard": true,
     "username": "their_name",
     "secret_token": "the-uuid-from-response"
   }
   ```
   **IMPORTANT:** The `secret_token` is the user's identity proof. It must be saved locally and sent with every write request. Without it, they cannot log reps or update their profile.
4. If they already have a username in config.json (re-opting in after opt-out), use the opt-in endpoint instead:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/opt-in" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN"}'
   ```
5. Confirm: "You're on the leaderboard as **username**. Your reps will be tracked after each break."

**If $ARGUMENTS contains "leaderboard off"**:
1. Read the username and secret_token from config.json
2. Opt out via the edge function:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/opt-out" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN"}'
   ```
3. Set `"leaderboard": false` in config.json (keep username and secret_token for re-opting in)
4. Confirm: "You're off the leaderboard. Your data is hidden. Run `/clawdbod:config leaderboard on` anytime to come back."

**If $ARGUMENTS contains "profile"**, walk the user through setting their profile:
1. Ask for the following (all optional — they can skip any by saying "skip"):
   - Height (feet and inches, e.g. "5'10" or "70 inches")
   - Weight (lbs)
   - Age
   - Gender (male/female/other)
2. Save to config.json as:
   ```json
   {
     "profile": {
       "height_inches": 70,
       "weight_lbs": 175,
       "age": 30,
       "gender": "male"
     }
   }
   ```
3. If they're on the leaderboard (have username and secret_token), also sync to Supabase:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/update-profile" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN","height_inches":70,"weight_lbs":175,"age":30,"gender":"male"}'
   ```
4. Confirm what was saved. Mention that this enables calorie estimates after each break.
5. Profile data is never shown on the leaderboard — it's only used for calorie math.

**If $ARGUMENTS contains "reset"**, reset the config file to defaults:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```
This removes leaderboard settings too. If they were opted in, opt them out first using the opt-out endpoint before resetting. Warn them that their secret_token will be lost and they'll need to create a new account to rejoin.

After any change, confirm what was updated and show the new settings.

Keep it brief — one exchange, no lectures.
