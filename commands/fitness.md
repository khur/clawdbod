---
description: Take a fitness break right now. Get a random exercise challenge or request a HIIT workout for a longer wait.
argument_description: Optional — "hiit 5" or "hiit 10" for a timed workout, "summary" for session stats, or leave blank for a quick challenge.
---

# Fitness Break

Give the user an exercise challenge right now.

**Before doing anything else**, read `${CLAUDE_PLUGIN_ROOT}/config.json` so you have the username, secret_token, and profile data ready for logging reps and estimating calories later.

## Routing

- If $ARGUMENTS contains "hiit 5" → generate a 5-minute HIIT workout (40s on / 20s rest x 5 rounds, 5 different exercises).
- If $ARGUMENTS contains "hiit 10" → generate a 10-minute HIIT workout (40s on / 20s rest x 10 rounds, alternate upper/lower/core, include warmup + cooldown).
- If $ARGUMENTS contains "summary" or "stats" → show the session fitness summary (total breaks, exercises, rep counts).
- Otherwise → do a quick micro-break (steps below).

## Quick micro-break flow

### 1. Pick ONE random exercise from this pool:

**Upper Body:** Push-ups, Diamond push-ups, Wide push-ups, Tricep dips (using chair), Pike push-ups, Arm circles (30s small + 30s large), Incline push-ups (hands on desk), Decline push-ups (feet on chair), Shoulder taps (plank position), Commandos (plank to push-up), Wrist push-ups

**Lower Body:** Air squats, Lunges, Jump squats, Calf raises, Sumo squats, Single-leg deadlifts, Glute bridges, Lateral lunges, Step-ups (using chair), Wall sit (seconds), Reverse lunges

**Core:** Plank hold (seconds), Bicycle crunches, Dead bugs, Flutter kicks, Russian twists, Leg raises, Side plank (seconds each side), Bear crawl hold (seconds), Hollow body hold (seconds), Superman hold (seconds)

**Cardio:** Burpees, Jumping jacks, Mountain climbers, High knees, Skaters, Squat thrusts, Star jumps, Fast feet in place (seconds), Inchworms

**Mobility:** Neck rolls (seconds), Cat-cow stretch (seconds), Hip circles, Thoracic rotations, Wrist circles (seconds), Seated spinal twist (seconds), Toe touches

**Desk-friendly (no floor):** Desk push-ups, Seated leg raises, Chair squats, Standing calf raises, Wall push-ups, Standing march (seconds)

### 2. Present the challenge with energy:
```
⏸️ BREAK TIME — PUSH-UPS!

Drop and give me as many push-ups as you can before you quit.
No judgment, no minimum. Just move.

👉 How many did you get?
```

### 3. Wait for the user's response (they'll type a number).

### 4. After they respond, do ALL of these in the SAME response:

**a) Celebrate the effort** — be genuine, not corny. Encouraging if low, impressed if high, never doubtful.

**b) Estimate calories** (only if config.json has a `profile` with `weight_lbs`):
- Formula: `calories = MET × (weight_lbs × 0.4536) × duration_hours`
- For reps: `duration_hours = (reps × 3) / 3600`
- For time-based (seconds): `duration_hours = seconds / 3600`
- MET values: Push-ups/Burpees/Jumping jacks/Mountain climbers/High knees/Dips/Skaters = 8.0 | Squats/Lunges = 5.0 | Plank/Crunches/Flutter kicks = 3.8 | Calf raises/Glute bridges = 3.5 | Step-ups/Inchworms = 6.0 | Mobility = 2.0-2.5
- Show briefly: "~4.2 cal burned"
- If no profile, skip calories silently.

**c) Log reps to the leaderboard (MANDATORY)** — if config.json has `"leaderboard": true` with `username` and `secret_token`, run this curl IMMEDIATELY:

```bash
curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/log-reps" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","secret_token":"SECRET_TOKEN","exercise":"EXERCISE_NAME","count":COUNT,"calories":CALORIES_OR_NULL}'
```

Replace placeholders with actual values. Use the exact exercise name as presented (e.g. "Push-ups"). Set calories to `null` if no profile.

- **201 response** → success, add "Logged to leaderboard."
- **Any failure** (non-201, network error, timeout) → save the rep to `${CLAUDE_PLUGIN_ROOT}/pending-sync.json` so `/clawdbod:sync` can retry later. Append to the array in the file (create it with `[]` if it doesn't exist):
  ```json
  {"username":"USER","secret_token":"TOKEN","exercise":"Push-ups","count":25,"calories":5.0,"failed_at":"2026-03-06T12:00:00Z"}
  ```
  Tell the user: "Couldn't reach the server — saved locally. Run `/clawdbod:sync` to retry."

**d) Transition back to work:** "Alright, back to it. Where were we..."

## Tone

- Gym buddy, not doctor. Never preachy.
- Keep it SHORT — this is a break, not a lecture.
- Use emoji sparingly (🏋️ ⏸️ 💪 🔥).
