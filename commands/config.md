---
description: View or change ClawdBod settings — break frequency, cooldown, leaderboard, profile, or reset.
argument_description: Optional — "prompts 12", "minutes 30", "leaderboard on/off", "profile", "reset", or leave blank to view current settings.
---

# ClawdBod Config

**First, read `${CLAUDE_PLUGIN_ROOT}/config.json`.** If the file doesn't exist, silently create it with these defaults before continuing — do NOT mention the missing file to the user:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

All API writes go through:
```
POST https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/<route>
Content-Type: application/json
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields (username, secret_token, profile, etc.).**

---

## If $ARGUMENTS is empty — show current settings

```
ClawdBod Settings:
  Break every N prompts:    8
  Min minutes between:      20
  Leaderboard:              on
  Username:                 khur
  Profile:                  set (6'4", 265 lbs, 40, male)
```

If profile is set, show the details. Then ask if they'd like to change anything.

---

## If $ARGUMENTS contains "prompts" + a number

Update `promptsBetweenBreaks` in config.json. Confirm the change.

## If $ARGUMENTS contains "minutes" + a number

Update `minMinutesBetweenBreaks` in config.json. Confirm the change.

---

## If $ARGUMENTS contains "leaderboard on"

1. Ask them to pick a username (2-24 chars, letters/numbers/underscores)
2. Register:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/register" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME"}'
   ```
   - 201 → success. Save `username`, `secret_token` (from response), and `"leaderboard": true` to config.json.
   - 409 → username taken, ask for another
   - 429 → rate limited, try later
3. If they already have username + secret_token in config.json (re-opting in), use opt-in instead:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/opt-in" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN"}'
   ```
4. Confirm: "You're on the leaderboard as **username**."

## If $ARGUMENTS contains "leaderboard off"

1. Read username and secret_token from config.json
2. Opt out:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/opt-out" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN"}'
   ```
3. Set `"leaderboard": false` in config.json (keep username and secret_token for re-opting in)
4. Confirm: "You're off the leaderboard. Run `/clawdbod:config leaderboard on` anytime to come back."

---

## If $ARGUMENTS contains "profile"

1. Ask for all at once (all optional — they can skip any):
   - Height (like 5'10 or 70 inches)
   - Weight (lbs)
   - Age
   - Gender (male/female/other)
2. Save to config.json as a `profile` object:
   ```json
   { "profile": { "height_inches": 70, "weight_lbs": 175, "age": 30, "gender": "male" } }
   ```
   Convert feet/inches to total inches (5'10 = 70).
3. If on the leaderboard (have username + secret_token), sync to Supabase:
   ```bash
   curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/update-profile" \
     -H "Content-Type: application/json" \
     -d '{"username":"USERNAME","secret_token":"TOKEN","height_inches":70,"weight_lbs":175,"age":30,"gender":"male"}'
   ```
4. Confirm what was saved. Mention this enables calorie estimates. Profile data is never shown publicly.

---

## If $ARGUMENTS contains "reset"

1. If they have username + secret_token, opt them out first using the opt-out endpoint.
2. Warn them: secret_token will be lost — they'll need a new account to rejoin.
3. If they confirm, overwrite config.json with defaults only:
   ```json
   { "promptsBetweenBreaks": 8, "minMinutesBetweenBreaks": 20 }
   ```

---

After any change, confirm what was updated and show the new settings. Keep it brief.
