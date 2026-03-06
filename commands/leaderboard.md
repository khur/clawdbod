---
description: View the ClawdBod global leaderboard — overall, weekly, or per-exercise rankings.
argument_description: Optional — "weekly", "pushups", "squats", "pr pushups", or any exercise name. Leave blank for all-time overall.
---

# ClawdBod Leaderboard

Fetch and display the ClawdBod leaderboard. The Supabase API key for all requests:

```
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbnpmemVmc21qaW9ienFkcW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY1NjIsImV4cCI6MjA4ODMzMjU2Mn0.Z4PTpt97AzSXIfub-dRbVdXD7M2r5RzKWY23ARKKmoM
Authorization: Bearer <same key>
Base URL: https://donzfzefsmjiobzqdqok.supabase.co/rest/v1
```

## Routing

**If $ARGUMENTS is empty** — fetch all-time overall leaderboard:
```
GET /leaderboard?limit=20
```
Display as:
```
ClawdBod Leaderboard (All-Time)

 #  Username         Total Reps   Cal    Sets
 1  muscle_dev       1,247        312.4  89
 2  squat_coder      983          245.1  72
 3  push_it          841          198.7  65
```

**If $ARGUMENTS is "weekly"** — fetch this week's leaderboard:
```
GET /leaderboard_weekly?limit=20
```

**If $ARGUMENTS starts with "pr"** followed by an exercise name — fetch personal best rankings for that exercise:
```
GET /leaderboard_exercise_pr?exercise=ilike.%25EXERCISE%25&order=personal_best.desc&limit=20
```
Display as:
```
ClawdBod Leaderboard — Push-ups (Best Single Set)

 #  Username         PR     Total Reps   Sets
 1  muscle_dev       62     412          12
 2  push_it          55     341          9
 3  squat_coder      40     280          15
```

**If $ARGUMENTS is an exercise name** (no "pr" prefix) — fetch total reps rankings for that exercise:
```
GET /leaderboard_exercise_total?exercise=ilike.%25EXERCISE%25&order=total_reps.desc&limit=20
```
Display as:
```
ClawdBod Leaderboard — Push-ups (Total Reps)

 #  Username         Total Reps   Sets   PR
 1  muscle_dev       412          12     62
 2  push_it          341          9      55
 3  squat_coder      280          15     40
```

**If $ARGUMENTS is "exercises"** — fetch all exercises that have been logged and show a summary:
```
GET /leaderboard_exercise_total?select=exercise&order=exercise
```
Deduplicate the exercise names and list them so the user knows what's available to query.

## Display rules

- If the user is opted in (check `${CLAUDE_PLUGIN_ROOT}/config.json` for username), highlight their row with `>>` or bold
- If the leaderboard is empty, say "No one's on the board yet. Be the first — `/clawdbod:config leaderboard on`"
- If the user isn't opted in, add a note at the bottom: "Join the leaderboard: `/clawdbod:config leaderboard on`"
- Use `ilike` with `%25` (URL-encoded `%`) for fuzzy exercise matching so "pushups" matches "Push-ups" etc.
- Keep it clean and compact
