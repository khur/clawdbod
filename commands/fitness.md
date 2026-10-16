---
description: Take a fitness break right now. Get a random exercise challenge or request a HIIT workout for a longer wait.
argument-hint: "[hiit 5 | hiit 10 | summary]"
---

# Fitness Break

Give the user an exercise challenge right now. The full flow, exercise pool, and tone rules live in the clawdbod skill — read `${CLAUDE_PLUGIN_ROOT}/skills/clawdbod/SKILL.md` first if it is not already in context.

## Routing

- `$ARGUMENTS` contains "hiit 5" → 5-minute HIIT (40s on / 20s rest × 5 rounds, 5 different exercises from the skill's pool).
- `$ARGUMENTS` contains "hiit 10" → 10-minute HIIT (40s on / 20s rest × 10 rounds, alternate upper/lower/core, include a 1-min warmup and cooldown).
- `$ARGUMENTS` contains "summary" or "stats" → run with the Bash tool and print the output verbatim in a code block:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs" --since today
  ```
- Otherwise → run the skill's **Quick micro-break** flow exactly as written there.

## HIIT logging

Each round is one exercise for 40 seconds. After the workout, ask how many rounds they completed, then log one entry per **completed round**: that round's exercise with `--count 40 --unit seconds`. If the same exercise appeared in more than one completed round, log it once with 40 × the number of those rounds. Warmup and cooldown are not logged. Same `log-workout.mjs` call as the skill describes. If they bail early, log only the rounds they finished and move on.

Keep it short. Back to code when done.
