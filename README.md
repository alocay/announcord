# Announcord

A Discord bot that says who joined or left a voice channel, out loud, in that
channel: "Armando has entered the channel".

Speech comes from Amazon Polly. Everything is configured with slash commands.

## What it does

- Announces joins, exits, or both.
- Skips the AFK channel, other bots, and (by default) channels with nobody else in them.
- Per-server voice and message text, with `%name` standing for the member's name.
- Members can choose their own voice, their own messages, and how their name is pronounced.
- Allow or deny individual voice channels.
- Leaves the voice channel after a minute of quiet.
- Caches every clip on disk, so the same announcement is only synthesized once.

## Requirements

- Node.js 22.12 or newer (developed on 24), or Docker
- A Discord application with a bot user
- An AWS account with access to Amazon Polly

## Setup

### 1. Discord application

1. Create an application at <https://discord.com/developers/applications> and add a bot.
2. Copy the **bot token** and the **application id**.
3. No privileged intents are needed. Leave them all off.
4. Invite the bot with this URL, replacing `CLIENT_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=3146752
   ```

   The permissions are View Channel, Connect and Speak.

### 2. AWS credentials

Create an IAM user used only by this bot, with this policy and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech", "polly:DescribeVoices"],
      "Resource": "*"
    }
  ]
}
```

Create an access key for that user.

### 3. Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is ignored by git; never commit it.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DISCORD_TOKEN` | yes | | Bot token |
| `DISCORD_CLIENT_ID` | yes | | Application id |
| `AWS_ACCESS_KEY_ID` | yes | | Key of the Polly-only IAM user |
| `AWS_SECRET_ACCESS_KEY` | yes | | Secret of that key |
| `AWS_REGION` | no | `us-east-1` | Polly region |
| `UNLIMITED_GUILD_IDS` | no | empty | Comma-separated server ids that get speech |
| `DEV_GUILD_ID` | no | | Register commands to this one server (instant) instead of globally |
| `DATA_DIR` | no | `./data` | Where the database and clip cache live |
| `IDLE_LEAVE_SECONDS` | no | `60` | Quiet time before the bot leaves voice |
| `CACHE_MAX_MB` | no | `200` | Clip cache size limit |
| `LOG_LEVEL` | no | `info` | `fatal`, `error`, `warn`, `info`, `debug` or `trace` |

**Only servers listed in `UNLIMITED_GUILD_IDS` get speech.** In any other server
the commands work and settings are saved, but nothing is spoken. This keeps the
Polly bill limited to servers you chose. To find a server id, enable Developer
Mode in Discord, then right-click the server and choose *Copy Server ID*.

### 4. Run

With Node:

```sh
npm install
npm run register   # publish the slash commands (once, and after changing them)
npm run build
node --env-file=.env dist/index.js
```

For development, `npm run dev` runs from source. It deliberately does not
watch for changes: on Windows, `tsx watch` kills the bot outright on Ctrl+C,
before it can leave its voice channel.

With Docker:

```sh
docker compose build
docker compose run --rm bot node dist/discord/registerCommands.js
docker compose up -d
docker compose logs -f bot
```

Globally registered commands can take up to an hour to appear. Set `DEV_GUILD_ID`
while developing to get them immediately in one server.

## Commands

### `/announce` — for everyone, affects only you

| Command | Does |
|---|---|
| `/announce voice <voice>` | Choose the voice that announces you |
| `/announce enter <text>` | What is said when you join |
| `/announce exit <text>` | What is said when you leave |
| `/announce pronounce <text>` | How your name is spoken |
| `/announce sneak <True\|False>` | Come and go without being announced (if the server allows it) |
| `/announce clear <field>` | Remove one of your settings, or all of them |
| `/announce show` | Show your settings and what will be said |
| `/announce preview` | Show what will be said, and play it if you are in a voice channel |
| `/announce voices [language]` | List the available voices |

### `/announce-admin` — Manage Server permission by default

| Command | Does |
|---|---|
| `/announce-admin style <joins\|exits\|both>` | What to announce |
| `/announce-admin ignore-empty <on\|off>` | Skip announcements when nobody else is there |
| `/announce-admin sneaking <True\|False>` | Whether members may use `/announce sneak` (allowed by default) |
| `/announce-admin voice <voice>` | Default voice for the server |
| `/announce-admin template <enter\|exit> <text>` | Default message for the server |
| `/announce-admin channel allow\|deny\|unlist <channel>` | Choose which channels are announced |
| `/announce-admin user set <member> <field> <value>` | Set a member's personal setting |
| `/announce-admin user clear <member> <field>` | Remove a member's personal setting |
| `/announce-admin user silence <member> <True\|False>` | Stop announcing a member; they cannot undo it |
| `/announce-admin settings` | Show the configuration, this month's usage and any permission problems |
| `/announce-admin reset` | Restore defaults (asks for confirmation) |

A silenced member is never announced, and nothing they do lifts it, not even
`/announce clear all`. A member's own sneak only counts while the server allows
sneaking; turning sneaking off announces everyone again without forgetting who
chose to sneak. `/announce preview` follows both, as well as the channel rules.

Messages may be up to 150 characters, not counting `%name`. If any channel is
allowed, only allowed channels are announced; otherwise every channel except the
denied ones.

**Who counts as an admin?** Discord decides. By default anyone with *Manage
Server*. A server owner can grant `/announce-admin` to other roles or members,
or restrict it further, under *Server Settings → Integrations → Announcord*.

## Data and backup

Everything lives under `DATA_DIR`:

- `announcord.sqlite` — settings and monthly usage.
- `cache/` — synthesized clips. Safe to delete; it is rebuilt as needed.

Don't back up by copying `announcord.sqlite` while the bot runs: the database
uses write-ahead logging, so recent changes sit in a separate `-wal` file and a
plain copy can miss them. Use the backup command, which is safe at any time and
writes a timestamped copy to `DATA_DIR/backups/`:

```sh
npm run backup                                    # with Node
docker compose exec bot node dist/backup.js       # with Docker
docker compose cp bot:/data/backups ./backups     # copy them off the server
```

Pass a file path to choose where the copy goes. Old copies are not deleted
automatically.

## Cost

Polly neural voices cost about $16 per million characters. An announcement is
around 30 characters and is cached after the first time, so a private server
costs cents per month at most. `/announce-admin settings` shows the characters
synthesized this month.

## Development

```sh
npm test            # unit and integration tests
npm run typecheck
npm run lint
```

One test talks to the real Polly API and is skipped by default. It checks that
Polly's audio is in the form Discord plays without re-encoding:

```sh
POLLY_LIVE_TEST=1 node --env-file=.env node_modules/vitest/vitest.mjs run test/tts/polly.live.test.ts
```

### Manual smoke test

Discord voice and real speech cannot be exercised by the automated tests. After
a deploy, check by hand:

1. The bot shows as online and `/announce show` replies.
2. With a second person in a voice channel, joining produces a spoken announcement at normal speed and pitch.
3. Leaving produces the exit announcement.
4. Moving between two occupied channels announces in both.
5. `/announce preview` speaks in your current channel.
6. The bot leaves about a minute after the last announcement.
7. Disconnecting the bot by hand, then joining again, still produces an announcement.
8. `/announce-admin settings` shows no unexpected warnings.

If step 2 plays at the wrong speed or not at all, run the live Polly test
above: the bot forwards Polly's Opus packets to Discord unchanged and relies on
them being 20 ms long.

### Layout

```
src/
  index.ts            startup and shutdown
  backup.ts           database backup command
  config.ts           environment validation
  domain.ts           shared types and defaults
  discord/            gateway events, voice connection, command registration
  announce/           what to announce (policy) and when to play it (queue)
  tts/                provider interface, Polly, clip cache, usage metering
  settings/           SQLite schema, migrations, settings store
  commands/           slash command definitions, logic and dispatcher
test/                 mirrors src/
docs/superpowers/     design spec and implementation plan
```

A second speech backend only needs to implement `TtsProvider` in
`src/tts/provider.ts`.

## Roadmap

- A free, self-hosted voice backend (Kokoro) with a monthly Polly quota per
  server that falls back to it, so the bot can be offered publicly at a bounded cost.

## License

MIT. See [LICENSE](LICENSE).
