# 🏋️ ClawdBod

Fitness breaks for [Claude Code](https://code.claude.com). Stay active while you ship.

ClawdBod injects quick exercise challenges into your coding sessions — micro-breaks between prompts and scaled HIIT workouts during long-running tasks. Every rep is logged **locally on your machine** and can be exported to CSV or JSON anytime.

## Install

```
/plugin marketplace add khur/clawdbod
/plugin install clawdbod
/reload-plugins
```

Then optionally:

```
/clawdbod:setup
```

to set your break cadence and an optional profile (height/weight/age) for calorie estimates.

## How it works

A Stop hook counts your prompts. After a configurable number of prompts (default 8) and a minimum cooldown (default 20 minutes), Claude pauses to throw you a quick exercise challenge — push-ups, squats, planks, one of 54+ exercises. You type how many you did, Claude logs it, and you're back to code. Two or three exchanges, max.

If you're mid-deploy or debugging something hairy, breaks skip themselves. If you say "not now," that's the end of it.

## Commands

| Command | What it does |
|---|---|
| `/clawdbod:fitness` | Exercise challenge right now (`hiit 5` / `hiit 10` for workouts, `summary` for session stats) |
| `/clawdbod:setup` | Break cadence + optional profile |
| `/clawdbod:config` | View/change settings (`prompts 12`, `minutes 30`, `profile`, `reset`) |
| `/clawdbod:history` | Recent reps and stats |
| `/clawdbod:export` | Export all workouts to CSV (or `json`) |
| `/clawdbod:pause` / `/clawdbod:resume` | Mute breaks for focus, calls, demos |
| `/clawdbod:status` | Local health check |
| `/clawdbod:help` | Command reference |

## Your data

Everything lives in `~/.claude/clawdbod/` on your machine:

- `config.json` — break cadence and optional profile
- `workouts.jsonl` — append-only workout log, one JSON entry per set

**Nothing is uploaded anywhere.** No accounts, no tokens, no telemetry. `/clawdbod:export` writes a CSV or JSON file wherever you want it:

```
/clawdbod:export                 # clawdbod-export-2026-06-12.csv in the current directory
/clawdbod:export json ~/Desktop/workouts.json
```

CSV columns: `date, time, exercise, unit, count, calories`.

## Configuration

| Setting | Default | Change with |
|---|---|---|
| Prompts between breaks | 8 | `/clawdbod:config prompts N` |
| Min minutes between breaks | 20 | `/clawdbod:config minutes N` |
| Profile (calorie estimates) | unset | `/clawdbod:config profile` |

Env var overrides for a single session: `CLAWDBOD_PROMPTS`, `CLAWDBOD_MINUTES`.

## Changelog

### 2.0.0

**Breaking:** the global leaderboard is gone, and with it the `leaderboard`, `sync`, and `recover` commands, usernames, tokens, and passphrases. All tracking is now local-only with CSV/JSON export. There is no migration from 1.x server-side history — your local log starts fresh, and your profile needs re-entering via `/clawdbod:setup`. Mutable data moved out of the plugin directory into `~/.claude/clawdbod/`, so it now survives plugin updates.

### 1.x

Leaderboard era. RIP `muscle_dev`'s 1,247 reps.

## Development

```bash
node --test tests/        # script tests
claude plugin validate .  # manifest validation
```

## License

MIT
