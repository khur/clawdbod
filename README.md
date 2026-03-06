# ClawdBod

Stay active while you code. ClawdBod injects exercise breaks into your Claude Code sessions so you don't turn into a mass of prompt-shaped jelly.

## Install

### From the official marketplace

```
/plugin install clawdbod@claude-plugins-official
```

### From GitHub

```
/plugin marketplace add fgalabs/clawdbod
/plugin install clawdbod@fgalabs-clawdbod
```

### Local (development)

```bash
claude --plugin-dir ./clawdbod
```

## What it does

- **Auto-breaks** — After every ~8 prompts (and at least 20 min apart), Claude pauses to give you a quick exercise challenge
- **Interactive** — Asks you to do as many reps as you can, you report back, it logs and cheers you on
- **On-demand** — Run `/clawdbod:fitness` anytime for a quick challenge, or `/clawdbod:fitness hiit 5` / `/clawdbod:fitness hiit 10` for a timed workout during long waits
- **Session tracking** — Run `/clawdbod:fitness summary` to see your totals
- **Configurable** — Run `/clawdbod:config` to view or change settings on the fly
- **Global leaderboard** — Opt in with `/clawdbod:config leaderboard on`, pick a username, and compete with other devs worldwide. View rankings with `/clawdbod:leaderboard`

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

```
/clawdbod:config leaderboard on     # pick a unique username, start tracking
/clawdbod:config leaderboard off    # disappear from the board
/clawdbod:leaderboard               # all-time overall rankings
/clawdbod:leaderboard weekly        # this week's rankings
/clawdbod:leaderboard pushups       # total reps leaderboard for push-ups
/clawdbod:leaderboard pr squats     # best single set leaderboard for squats
/clawdbod:leaderboard exercises     # list all tracked exercises
```

Only your username, exercise name, rep count, estimated calories, and timestamp are stored. Profile data (height/weight/age/gender) is used for calorie math but never displayed on the leaderboard.

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
│   └── plugin.json
├── commands/
│   ├── config.md
│   ├── fitness.md
│   └── leaderboard.md
├── hooks/
│   ├── hooks.json
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
| `hooks/stop-fitness-check.mjs` | Stop Hook | Tracks prompts and time, triggers breaks |
| `skills/clawdbod/SKILL.md` | Skill | Exercise coach persona and workout generator |
| `commands/fitness.md` | Command | `/clawdbod:fitness` slash command for on-demand breaks |
| `commands/config.md` | Command | `/clawdbod:config` to view or change settings |
| `commands/leaderboard.md` | Command | `/clawdbod:leaderboard` to view global rankings |

## License

MIT
