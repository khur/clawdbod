---
description: View or change ClawdBod settings — break frequency, cooldown, profile, or reset.
argument-hint: [prompts N | minutes N | profile | reset]
---

# ClawdBod Config

**First, read `~/.claude/clawdbod/config.json`.** If the file doesn't exist, silently create it (and the directory) with these defaults before continuing — do NOT mention the missing file to the user:
```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file — preserve all existing fields (profile, etc.).**

---

## If $ARGUMENTS is empty — show current settings

```
ClawdBod Settings:
  Break every N prompts:    8
  Min minutes between:      20
  Profile:                  set (6'4", 265 lbs, 40, male)
  Data location:            ~/.claude/clawdbod/ (local only)
```

If profile is set, show the details; otherwise show `not set (add with /clawdbod:config profile)`. Then ask if they'd like to change anything.

---

## If $ARGUMENTS contains "prompts" + a number

Update `promptsBetweenBreaks` in config.json. Confirm the change.

## If $ARGUMENTS contains "minutes" + a number

Update `minMinutesBetweenBreaks` in config.json. Confirm the change.

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
3. Confirm what was saved. Mention this enables calorie estimates and stays local.

---

## If $ARGUMENTS contains "reset"

1. Warn them: this resets break settings and profile to defaults. Their workout history (`workouts.jsonl`) is NOT touched.
2. If they confirm, overwrite config.json with defaults only:
   ```json
   { "promptsBetweenBreaks": 8, "minMinutesBetweenBreaks": 20 }
   ```

---

After any change, confirm what was updated and show the new settings. Keep it brief.
