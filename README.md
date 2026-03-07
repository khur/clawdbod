# ClawdBod

Stay active while you code. ClawdBod injects exercise breaks into your Claude Code sessions so you don't turn into a mass of prompt-shaped jelly.

## Install

```
/plugin marketplace add khur/clawdbod
/plugin install clawdbod
/reload-plugins
```

Then run `/clawdbod:setup` to pick a username and join the leaderboard.

### Updating

To pull the latest version:

```
/plugin marketplace remove khur/clawdbod
/plugin marketplace add khur/clawdbod
/plugin install clawdbod
/reload-plugins
```

### Uninstalling

```
/plugin uninstall clawdbod
/plugin marketplace remove khur/clawdbod
/reload-plugins
```

### Local (development)

```bash
claude --plugin-dir ./clawdbod
```

## What it does

- **Auto-breaks** — After every ~8 prompts (and at least 20 min apart), Claude pauses to give you a quick exercise challenge
- **Interactive** — Asks you to do as many reps as you can, you report back, it logs and cheers you on
- **On-demand** — Run `/clawdbod:fitness` anytime, or `/clawdbod:fitness hiit 5` / `hiit 10` for timed workouts
- **Global leaderboard** — Opt in to compete with other devs worldwide
- **Personal history** — Track your reps, calories, and progress over time
- **Pause/resume** — Mute breaks for deep focus, calls, or demos
- **Offline resilience** — Failed uploads are saved locally and retried with `/clawdbod:sync`
- **Calorie tracking** — Set up your profile for estimated calorie burn using MET values
- **Configurable** — Adjust break frequency, cooldown, leaderboard, and profile on the fly

## Quick Start

```
/clawdbod:setup          # pick a username, join the leaderboard, set up your profile
/clawdbod:help           # see all commands
```

## Commands

| Command | Description |
|---|---|
| `/clawdbod:fitness` | Quick random exercise challenge |
| `/clawdbod:fitness hiit 5` | 5-minute HIIT workout |
| `/clawdbod:fitness hiit 10` | 10-minute HIIT workout |
| `/clawdbod:fitness summary` | Session exercise summary |
| `/clawdbod:setup` | Guided onboarding — username, leaderboard, profile |
| `/clawdbod:config` | View/change settings |
| `/clawdbod:config profile` | Set height, weight, age for calorie tracking |
| `/clawdbod:config prompts 12` | Change break frequency |
| `/clawdbod:config minutes 30` | Change cooldown between breaks |
| `/clawdbod:config leaderboard on/off` | Enable/disable leaderboard |
| `/clawdbod:leaderboard` | All-time rankings |
| `/clawdbod:leaderboard weekly` | This week's rankings |
| `/clawdbod:leaderboard pushups` | Rankings for a specific exercise |
| `/clawdbod:leaderboard pr pushups` | Personal best rankings |
| `/clawdbod:leaderboard exercises` | List all tracked exercises |
| `/clawdbod:history` | Your recent reps and stats |
| `/clawdbod:pause` | Pause breaks indefinitely |
| `/clawdbod:pause 30` | Pause breaks for 30 minutes |
| `/clawdbod:resume` | Resume breaks after pausing |
| `/clawdbod:sync` | Retry any reps that failed to upload |
| `/clawdbod:status` | Health check — API, auth, config |
| `/clawdbod:recover` | Recover your account on a new machine |
| `/clawdbod:help` | Command reference |

## Configuration

Settings resolve in this order: **environment variables > `config.json` > defaults**.

### config.json

Edit `config.json` in the plugin root:

```json
{
  "promptsBetweenBreaks": 8,
  "minMinutesBetweenBreaks": 20
}
```

### Environment variables

Override for a single session:

```bash
CLAWDBOD_PROMPTS=4 CLAWDBOD_MINUTES=10 claude
```

| Setting | Env Var | Config Key | Default |
|---|---|---|---|
| Prompts between breaks | `CLAWDBOD_PROMPTS` | `promptsBetweenBreaks` | `8` |
| Minutes between breaks | `CLAWDBOD_MINUTES` | `minMinutesBetweenBreaks` | `20` |

## Leaderboard

Compete with other devs who use ClawdBod. Fully opt-in — your data only appears while you're opted in. Opt out and you disappear from the board instantly.

The fastest way to get on the board:

```
/clawdbod:setup
```

Only your username, exercise name, rep count, estimated calories, and timestamp are stored. Profile data (height/weight/age/gender) is used for calorie math but never displayed on the leaderboard.

## Account Recovery

If you reinstall, switch machines, or lose your config, you can recover your account using the passphrase you set during setup:

```
/clawdbod:recover
```

You'll be asked for your username and passphrase. On success, your credentials and profile are restored automatically.

If you didn't set a passphrase during setup, you can add one anytime:

```
/clawdbod:config passphrase
```

## Profile & Calorie Tracking

Optionally add your stats to get estimated calorie burn after each exercise:

```
/clawdbod:config profile
```

You'll be asked for height, weight, age, and gender — all optional, skip any you want. Calorie estimates use MET (Metabolic Equivalent of Task) values for each exercise. It's a rough estimate, not medical advice.

## Structure

```
clawdbod/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── commands/
│   ├── config.md
│   ├── fitness.md
│   ├── help.md
│   ├── history.md
│   ├── leaderboard.md
│   ├── pause.md
│   ├── resume.md
│   ├── setup.md
│   ├── recover.md
│   ├── status.md
│   └── sync.md
├── hooks/
│   └── stop-fitness-check.mjs
├── skills/
│   └── clawdbod/
│       └── SKILL.md
├── config.json
└── README.md
```

## Components

| Component | Type | Description |
|---|---|---|
| `hooks/stop-fitness-check.mjs` | Stop Hook | Tracks prompts and time, triggers breaks, respects pause state |
| `skills/clawdbod/SKILL.md` | Skill | Exercise coach persona, workout generator, calorie estimation |
| `commands/fitness.md` | Command | On-demand exercise breaks and HIIT workouts |
| `commands/setup.md` | Command | Guided onboarding flow |
| `commands/config.md` | Command | View and change settings |
| `commands/leaderboard.md` | Command | Global rankings |
| `commands/history.md` | Command | Personal exercise history and stats |
| `commands/pause.md` | Command | Temporarily mute breaks |
| `commands/resume.md` | Command | Resume breaks after pausing |
| `commands/sync.md` | Command | Retry failed leaderboard uploads |
| `commands/status.md` | Command | Diagnostic health check |
| `commands/recover.md` | Command | Account recovery with passphrase |
| `commands/help.md` | Command | Command reference |

## License

MIT
