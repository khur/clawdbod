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

After a HIIT workout, ask how many rounds they completed and log one entry per exercise they did (count = rounds × 40, unit seconds). Same `log-workout.mjs` call as the skill describes. If they bail early, log what they did and move on.

Keep it short. Back to code when done.
