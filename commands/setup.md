---
description: Get started with ClawdBod — pick a username, join the leaderboard, and set up your profile in one go.
argument_description: No arguments needed. Just run /clawdbod:setup to get started.
---

# ClawdBod Setup

Walk the user through onboarding. **First, read `${CLAUDE_PLUGIN_ROOT}/config.json`.** If it doesn't exist, silently create it with these defaults before continuing:
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

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields (promptsBetweenBreaks, minMinutesBetweenBreaks, profile, etc.).**

## Flow

### Step 1 — Welcome

If they already have `username` AND `secret_token` AND `leaderboard: true` AND a `profile` in config.json — they're fully set up:
```
You're already set up as **username** with profile and leaderboard enabled. Everything looks good!

  Username:     khur
  Leaderboard:  on
  Profile:      set (6'4", 265 lbs, 40, male)
  Recovery:     passphrase set (or: not set — add one with /clawdbod:config passphrase)
  Breaks:       every 8 prompts (20 min cooldown)

Need to change anything? Try /clawdbod:config
```

If they have `username` and `secret_token` but no profile, or leaderboard is off, acknowledge what's there and offer to complete the missing pieces.

If they're brand new (no username/secret_token):
```
Let's get you set up on ClawdBod — takes about 30 seconds.

Pick a username for the leaderboard.
Rules: 2-24 characters, letters, numbers, and underscores only.

What do you want to go by?
```

### Step 2 — Register username

Once they give you a username, ask for a recovery passphrase:

```
Got it — **username** it is.

One more thing: set a recovery passphrase so you can reclaim your account if you ever lose your config (reinstall, new machine, etc).

Rules: at least 8 characters, anything you'll remember.

What passphrase do you want? (or "skip" to skip — but you won't be able to recover your account later)
```

Once they provide a passphrase (or skip), register:

```bash
curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","passphrase":"PASSPHRASE_OR_OMIT_IF_SKIPPED"}'
```

If they skipped, omit the `passphrase` field entirely.

Handle responses:
- **201** — Read existing config.json, merge in `username`, `secret_token` (from response), `"leaderboard": true`, and `"has_passphrase": true/false`, write it back. Move to Step 3.
- **409** — "That one's taken — try another? Or if it's yours from before, run `/clawdbod:recover` to reclaim it."
- **429** — "Too many signups right now, try again in a minute."
- Other errors — "Something went wrong. Try `/clawdbod:setup` again later."

If they already have a username but `leaderboard` is `false` (re-opting in), use opt-in instead:
```bash
curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/opt-in" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","secret_token":"TOKEN"}'
```

### Step 3 — Profile (optional but encouraged)

After registration succeeds, transition smoothly:

```
You're in as **username**!

Quick optional step — sharing a couple details lets me estimate calories burned during breaks. Totally optional, and this data is never shown publicly.

- Height? (like 5'10 or 70 inches)
- Weight in lbs?
- Age?
- Gender? (male/female/other)

Or just say "skip" to skip all of this.
```

If they provide values:
- Convert feet/inches to total inches (5'10 = 70, 6'1 = 73, etc.)
- Read existing config.json, merge in the `profile` object, write it back
- Sync to Supabase (only include fields they provided):
  ```bash
  curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/update-profile" \
    -H "Content-Type: application/json" \
    -d '{"username":"USERNAME","secret_token":"TOKEN","height_inches":70,"weight_lbs":175,"age":30,"gender":"male"}'
  ```
  If the sync fails, save locally anyway and don't mention the error.

If they say "skip" — that's fine, move to Step 4.

### Step 4 — Confirm

```
You're all set!

  Username:     muscle_dev
  Leaderboard:  on
  Profile:      set (5'10", 175 lbs, 30, male)
  Recovery:     passphrase set
  Breaks:       every 8 prompts (20 min cooldown)

Your reps get logged after every break. Check rankings with /clawdbod:leaderboard.
```

If they skipped profile, show `Profile: not set (add later with /clawdbod:config profile)`.
If they skipped passphrase, show `Recovery: not set (add later with /clawdbod:config passphrase)`.

## UX rules

- Conversational, not robotic. Gym buddy signing them up, not a form.
- Ask all profile fields at once — let them answer however they want.
- If something fails, give an easy fallback command. Don't panic.
- Never show the secret_token to the user.
- Don't over-explain. They ran /setup — they want in.
