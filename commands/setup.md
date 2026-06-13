---
description: Get started with ClawdBod — set your break cadence and an optional profile for calorie estimates.
argument-hint: ""
---

# ClawdBod Setup

Walk the user through onboarding. **First, read `~/.claude/clawdbod/config.json`.** If it doesn't exist, silently create it (and the directory) with these defaults before continuing:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields.**

## Flow

### Step 1 — Welcome

If they already have a `profile` in config.json — they're fully set up:
```
You're already set up! Everything looks good:

  Profile:      set (6'4", 265 lbs, 40, male)
  Breaks:       every 8 prompts (20 min cooldown)

Need to change anything? Try /clawdbod:config
```

If they're brand new (no profile):
```
Let's get you set up on ClawdBod — takes about 30 seconds.

Breaks are currently every 8 prompts with a 20 minute cooldown. Want to change that, or keep the defaults?
```

Apply any cadence changes to config.json, then move to Step 2.

### Step 2 — Profile (optional but encouraged)

```
Quick optional step — sharing a couple details lets me estimate calories burned during breaks. This stays in a local file on your machine and is never uploaded anywhere.

- Height? (like 5'10 or 70 inches)
- Weight in lbs?
- Age?
- Gender? (male/female/other)

Or just say "skip" to skip all of this.
```

If they provide values:
- Convert feet/inches to total inches (5'10 = 70, 6'1 = 73, etc.)
- Read existing config.json, merge in the `profile` object, write it back:
  ```json
  { "profile": { "height_inches": 70, "weight_lbs": 175, "age": 30, "gender": "male" } }
  ```

If they say "skip" — that's fine, move to Step 3.

### Step 3 — Confirm

```
You're all set!

  Profile:      set (5'10", 175 lbs, 30, male)
  Breaks:       every 8 prompts (20 min cooldown)
  Your data:    ~/.claude/clawdbod/ (local only)

Every break gets logged automatically. Check your stats with /clawdbod:history, or export everything with /clawdbod:export.
```

If they skipped profile, show `Profile: not set (add later with /clawdbod:config profile)`.

## UX rules

- Conversational, not robotic. Gym buddy signing them up, not a form.
- Ask all profile fields at once — let them answer however they want.
- Don't over-explain. They ran /setup — they want in.
