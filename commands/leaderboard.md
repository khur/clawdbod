---
description: View the ClawdBod global leaderboard — overall, weekly, or per-exercise rankings.
argument_description: Optional — "weekly", "pushups", "squats", "pr pushups", "exercises", or any exercise name. Leave blank for all-time overall.
---

# ClawdBod Leaderboard

**First, read `${CLAUDE_PLUGIN_ROOT}/config.json`** to check if the user is opted in (has a `username`). You'll use this to highlight their row.

Fetch leaderboard data using curl. All requests use this pattern:
```bash
curl -s "https://donzfzefsmjiobzqdqok.supabase.co/rest/v1/VIEW_NAME?PARAMS" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbnpmemVmc21qaW9ienFkcW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY1NjIsImV4cCI6MjA4ODMzMjU2Mn0.Z4PTpt97AzSXIfub-dRbVdXD7M2r5RzKWY23ARKKmoM" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbnpmemVmc21qaW9ienFkcW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY1NjIsImV4cCI6MjA4ODMzMjU2Mn0.Z4PTpt97AzSXIfub-dRbVdXD7M2r5RzKWY23ARKKmoM"
```

## Routing

**If $ARGUMENTS is empty** — all-time leaderboard:
```bash
# VIEW_NAME=leaderboard, PARAMS=limit=20
curl -s "https://donzfzefsmjiobzqdqok.supabase.co/rest/v1/leaderboard?limit=20" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbnpmemVmc21qaW9ienFkcW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY1NjIsImV4cCI6MjA4ODMzMjU2Mn0.Z4PTpt97AzSXIfub-dRbVdXD7M2r5RzKWY23ARKKmoM" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbnpmemVmc21qaW9ienFkcW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTY1NjIsImV4cCI6MjA4ODMzMjU2Mn0.Z4PTpt97AzSXIfub-dRbVdXD7M2r5RzKWY23ARKKmoM"
```
Display as:
```
ClawdBod Leaderboard (All-Time)

 #  Username         Total Reps   Cal    Sets
 1  muscle_dev       1,247        312.4  89
 2  squat_coder      983          245.1  72
>> 3  khur            841          198.7  65    ← you
```

**If $ARGUMENTS is "weekly"**:
```
# Same curl pattern, VIEW_NAME=leaderboard_weekly, PARAMS=limit=20
```

**If $ARGUMENTS starts with "pr"** followed by an exercise name:
```
# VIEW_NAME=leaderboard_exercise_pr
# PARAMS=exercise=ilike.%25EXERCISE%25&order=personal_best.desc&limit=20
```
Use `%25` (URL-encoded `%`) around the exercise name for fuzzy matching.

**If $ARGUMENTS is an exercise name** (no "pr" prefix):
```
# VIEW_NAME=leaderboard_exercise_total
# PARAMS=exercise=ilike.%25EXERCISE%25&order=total_reps.desc&limit=20
```

**If $ARGUMENTS is "exercises"**:
```
# VIEW_NAME=leaderboard_exercise_total, PARAMS=select=exercise&order=exercise
```
Deduplicate exercise names and list them.

## Display rules

- Highlight the user's row with `>>` if they're opted in (match username from config.json)
- If the leaderboard is empty: "No one's on the board yet. Be the first — `/clawdbod:setup`"
- If the user isn't opted in, add at the bottom: "Join the leaderboard: `/clawdbod:setup`"
- If the curl fails or returns an error, say: "Couldn't reach the leaderboard right now. Try again in a minute."
- Format numbers with commas for readability
- Keep it clean and compact
