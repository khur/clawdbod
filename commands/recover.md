---
description: Recover your ClawdBod account using your username and recovery passphrase.
argument_description: No arguments needed. Just run /clawdbod:recover.
---

# ClawdBod Account Recovery

Helps a user reclaim their account when they've lost their local config (reinstall, new machine, etc.) but set a recovery passphrase during setup.

**First, read `${CLAUDE_PLUGIN_ROOT}/config.json`.** If the user already has a `username` and `secret_token`, tell them they're already set up and don't need recovery.

All API writes go through:
```
POST https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/<route>
Content-Type: application/json
```

**IMPORTANT: When writing config.json, always read the existing file first and merge your changes into it. Never overwrite the whole file.**

## Flow

### Step 1 — Ask for credentials

```
Let's get your account back.

What's your username?
```

After they provide a username:

```
What's the recovery passphrase you set during setup?
```

### Step 2 — Attempt recovery

```bash
curl -s -X POST "https://donzfzefsmjiobzqdqok.supabase.co/functions/v1/api/recover" \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","passphrase":"PASSPHRASE"}'
```

Handle responses:
- **200** — Read existing config.json, merge in `username`, `secret_token` (from response), and `"leaderboard": true`, write it back. Move to Step 3.
- **401** — "That didn't match. Double-check your username and passphrase and try again."
- **429** — "Too many attempts — account is temporarily locked. Try again in a few minutes."
- Other errors — "Something went wrong. Try `/clawdbod:recover` again later."

### Step 3 — Confirm

```
You're back in as **username**! Config has been restored.

  Username:     username
  Leaderboard:  on

Run /clawdbod:status to verify everything's working.
```

## UX rules

- Never show the secret_token to the user.
- Never reveal whether a username exists or not — the API intentionally returns the same error for both.
- If they don't have a passphrase (never set one, or it was an old account), let them know recovery isn't possible and suggest picking a new username with `/clawdbod:setup`.
- Keep it quick — two questions, one API call, done.
