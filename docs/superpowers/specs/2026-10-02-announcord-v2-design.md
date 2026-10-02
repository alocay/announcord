# Announcord v2 — Design

Date: 2026-10-02
Status: Draft for review
Branch: `v2` (old code preserved at tag `v1-legacy`)

## 1. Purpose

Announcord is a Discord bot that speaks a short announcement in a voice channel
when a member joins or leaves it ("Armando has entered the channel").

The v1 code (discord.js v12, aws-sdk v2, Enmap, Babel, prefix commands) no longer
runs against Discord: voice now requires the DAVE end-to-end encryption protocol,
and prefix commands require a privileged intent. v2 is a clean-slate rewrite on a
current stack.

### Goals

- Feature parity with v1, delivered as slash commands.
- Runs for the owner's own server first, on a small Linux VPS in Docker.
- Nothing in the design blocks later public, multi-guild use.
- The owner never stores other people's credentials.
- The owner's cloud TTS cost is bounded.

### Non-goals for v1

- Local/free TTS backend (Kokoro) — milestone 2.
- Per-guild quotas and global budget cap enforcement — milestone 2.
- Paid/premium tier, web dashboard, sharding, Postgres.
- Migrating v1 settings data. Settings are re-entered by command.
- Sound-effect announcements, per-user opt-out, per-guild engine selection.

## 2. Decisions

| Topic | Decision |
|---|---|
| Audience | Own server now; public later must remain possible |
| Hosting | Generic Linux VPS, Docker. Vendor chosen later. No vendor-specific features |
| TTS | Amazon Polly first, behind a provider interface |
| Public cost model | Milestone 2: Polly quota per guild on the owner's key, falling back to Kokoro. Self-hosting supported as a by-product. Premium tier possible later |
| Owner's guild | Always Polly, no quota, set by env allowlist |
| Features | v1 parity + auto-leave + self-serve name pronunciation + preview |
| Permissions | Members manage their own overrides; admins manage guild settings and anyone's overrides |
| Language | TypeScript, native ESM |
| Database | SQLite through Kysely, written to stay Postgres-portable |
| Repo | Same repo, branch `v2`, v1 removed from the branch |

## 3. Stack

- Node.js current LTS (exact minimum set by `@discordjs/voice` at install time)
- TypeScript, ESM, no Babel
- `discord.js` v14, `@discordjs/voice` (bundles `@snazzah/davey` for DAVE), `@discordjs/opus`
- `@aws-sdk/client-polly` v3, output format `ogg_opus` (no ffmpeg required)
- `better-sqlite3` + `kysely` (query builder and migrator)
- `zod` for config validation, `pino` for logging
- `vitest` for tests, ESLint + Prettier
- Docker, docker compose, GitHub Actions

Gateway intents: `Guilds`, `GuildVoiceStates`. No privileged intents.
Bot permissions: View Channel, Connect, Speak.

## 4. Architecture

Single Node process, modular monolith.

```
Discord gateway
   | voiceStateUpdate             | slash commands
   v                              v
VoiceEventRouter             CommandHandlers --> SettingsStore (Kysely/SQLite)
   | join / exit / move                              ^
   v                                                 | read (memory-cached)
AnnouncementPolicy ----------------------------------+
   | 0..2 announcements {channelId, text, voice}
   v
GuildAnnouncer (one per guild)
   | FIFO queue, voice connection, idle timer
   v
TtsService --> ClipCache (disk, LRU)
   | miss
   v
TtsProvider (interface) --> PollyProvider     [KokoroProvider: milestone 2]
   |
UsageMeter (chars per guild per month)
```

### Units

**VoiceEventRouter** — pure function. Converts a raw voice state change into
`{ type: 'join' | 'exit' | 'move', member, fromChannel, toChannel }` or nothing.
Drops: bot users, changes that are not channel changes (mute, deafen, stream),
and treats the guild AFK channel as "no channel" (moving into AFK is an exit,
moving out of AFK is a join).

**AnnouncementPolicy** — pure function. Input: event, guild settings, member
override, channel rules, human member counts of the affected channels, and the
channel the bot is currently in. Output: zero, one or two announcements in play
order. No Discord objects, no I/O.

Rules:

1. Style: `join` suppresses exits, `exit` suppresses joins, `both` allows both.
2. Ignore-empty: when on, skip an announcement if the channel contains no other
   human members (excluding the subject and all bots).
3. Channel rules: if any `allow` rule exists in the guild, only allowed channels
   are announced; otherwise every channel except `deny` channels.
4. Move: produces an exit for the old channel and a join for the new channel,
   each subject to rules 1–3. If the bot is currently in the old channel the exit
   plays first; otherwise the join plays first.
5. Text: member template → guild template → built-in default
   (`%name has entered the channel` / `%name has left the channel`).
6. `%name`: member pronunciation → server nickname → global display name →
   username. Every occurrence of `%name` is replaced.
7. Voice: member voice → guild voice.

**GuildAnnouncer** — the only stateful voice component, one instance per guild.
Holds a FIFO queue, the voice connection and audio player, and an idle timer.

- Enqueue starts synthesis immediately (so clips resolve in parallel) but
  playback is strictly in queue order.
- On audio player `Idle`, play the next item, joining a different channel first
  if needed.
- Queue empty → start idle timer (`IDLE_LEAVE_SECONDS`, default 60) → leave.
- Queue cap 10 per guild; beyond that the oldest item is dropped.
- An item older than 15 seconds when its turn comes is skipped as stale.

**TtsService** — `getClip(guildId, text, voice) → readable Ogg/Opus stream`.
Chooses the provider from the guild's tier and settings, consults the cache,
synthesizes on a miss, stores the clip, and records usage.

**TtsProvider** — interface:

```ts
interface TtsProvider {
  readonly id: string;                       // 'polly'
  listVoices(): Promise<Voice[]>;            // cached, refreshed daily
  synthesize(text: string, voiceId: string): Promise<Buffer>;  // Ogg/Opus
}
interface Voice { id: string; name: string; languageCode: string; languageName: string; }
```

`PollyProvider` uses the neural engine when the voice supports it and standard
otherwise. Text is always sent as plain text, never SSML.

**ClipCache** — disk cache under `DATA_DIR/cache`.

- Key: `sha256(provider | engine | voice | text)`, stored as `ab/abcdef….ogg`.
- Writes go to a temp file and are renamed atomically.
- Concurrent requests for the same key share one in-flight synthesis.
- Size cap `CACHE_MAX_MB` (default 200), least-recently-used eviction.
- Shared across guilds. Usage is charged to the guild that caused the miss.

**UsageMeter** — increments `usage.chars` for (guild, month, provider) on every
cache miss. Read by `/announce-admin settings`. Enforcement arrives in milestone 2.

**SettingsStore** — typed repository over Kysely. Guild settings, member
overrides and channel rules are cached in memory per guild and invalidated on
write. Creates the guild row with defaults on first access.

**CommandHandlers** — one module per subcommand group. Validate input, call the
store, reply ephemerally.

**Tiers** — `tierOf(guildId)` returns `unlimited` when the id is in
`UNLIMITED_GUILD_IDS`, otherwise `standard`. In v1 only `unlimited` guilds get
speech; in other guilds commands work and report that speech is not enabled yet.

## 5. Data model

```
guilds
  guild_id        TEXT PRIMARY KEY
  style           TEXT NOT NULL DEFAULT 'both'      -- join | exit | both
  ignore_empty    INTEGER NOT NULL DEFAULT 1
  provider        TEXT NOT NULL DEFAULT 'polly'
  voice_id        TEXT NOT NULL DEFAULT 'Matthew'
  enter_template  TEXT                              -- null = built-in default
  exit_template   TEXT
  created_at      TEXT NOT NULL
  updated_at      TEXT NOT NULL

member_overrides
  guild_id        TEXT NOT NULL REFERENCES guilds ON DELETE CASCADE
  user_id         TEXT NOT NULL
  voice_id        TEXT
  enter_template  TEXT
  exit_template   TEXT
  pronunciation   TEXT
  updated_at      TEXT NOT NULL
  updated_by      TEXT NOT NULL                     -- user id of whoever set it
  PRIMARY KEY (guild_id, user_id)

channel_rules
  guild_id        TEXT NOT NULL REFERENCES guilds ON DELETE CASCADE
  channel_id      TEXT NOT NULL
  rule            TEXT NOT NULL                     -- allow | deny
  PRIMARY KEY (guild_id, channel_id)

usage
  guild_id        TEXT NOT NULL
  month           TEXT NOT NULL                     -- YYYY-MM (UTC)
  provider        TEXT NOT NULL
  chars           INTEGER NOT NULL DEFAULT 0
  PRIMARY KEY (guild_id, month, provider)
```

- Overrides are per guild, not global.
- When the bot is removed from a guild, its `guilds` row is deleted and overrides
  and rules cascade. `usage` rows are kept.
- A member override row with every nullable field null is deleted.
- Migrations use the Kysely migrator and run at startup.
- SQL is kept portable: no SQLite-only syntax in queries.

## 6. Commands

Permissions apply per top-level command in Discord, so there are two trees.
All replies are ephemeral.

### `/announce` — everyone, acts on the caller only

| Subcommand | Behavior |
|---|---|
| `voice <voice>` | Set own voice. Autocomplete from the provider voice list |
| `enter <text>` | Set own enter text |
| `exit <text>` | Set own exit text |
| `pronounce <text>` | Set how own name is spoken |
| `clear <voice\|enter\|exit\|pronounce\|all>` | Remove own override(s) |
| `show` | Show own overrides and the resulting spoken text |
| `preview` | Reply with the text that would be spoken; if the caller is in a voice channel, also speak the enter announcement there |
| `voices [language]` | List available voices, optionally filtered by language |

### `/announce-admin` — default permission `Manage Server`

| Subcommand | Behavior |
|---|---|
| `style <join\|exit\|both>` | Set announcement style |
| `ignore-empty <on\|off>` | Toggle ignore-empty |
| `voice <voice>` | Set guild default voice |
| `template <enter\|exit> <text>` | Set guild default text |
| `channel allow <channel>` | Add an allow rule (voice channels only) |
| `channel deny <channel>` | Add a deny rule |
| `channel unlist <channel>` | Remove the channel's rule |
| `user set <member> <voice\|enter\|exit\|pronounce> <value>` | Set another member's override |
| `user clear <member> <voice\|enter\|exit\|pronounce\|all>` | Remove another member's override |
| `settings` | Show guild configuration, channel rules, tier, this month's usage, and any permission warnings |
| `reset` | Restore guild defaults after a confirmation button. Member overrides and channel rules are also removed |

Server owners can remap who may use each command in Discord's Integrations
settings. The bot additionally re-checks `Manage Server` on admin commands.

### Validation

- Enter/exit text: at most 150 characters excluding `%name`. Must be non-empty.
- Pronunciation: at most 50 characters.
- `<`, `>` and `&` are removed; mentions and custom emoji are reduced to plain text.
- Voice must exist in the provider's voice list.
- Channel must be a voice channel in the guild.

### Dropped from v1

Custom prefix and the hard-coded fallback prefix; separate language setting
(the voice implies the language); `includeEmpty`/`ignoreEmpty` as two commands.
"Blacklist/whitelist" are renamed deny/allow.

## 7. Error handling

| Failure | Response |
|---|---|
| Polly error or 5 s timeout | Retry once, then skip the announcement and log. Queue continues |
| Missing View/Connect/Speak in a channel | Skip; log once per channel per process; surfaced in `settings` |
| Channel at user limit | Skip and log |
| Voice connection drops | Allow 5 s for reconnect; otherwise destroy the connection and clear the queue. The next event joins fresh |
| Bot disconnected or moved by a user | Treated as a drop |
| Queue backlog | Cap 10, drop oldest; skip items older than 15 s |
| Database error in a command | Ephemeral generic error; details logged with a correlation id |
| Unhandled rejection | Logged; process stays up |
| Fatal startup error (invalid config, bad token, DB cannot open, AWS credentials rejected) | Clear message, non-zero exit; Docker restarts |

On SIGTERM/SIGINT: leave all voice channels, close the database, exit.

## 8. Configuration

Environment variables only, validated with zod at startup.

```
DISCORD_TOKEN            required
DISCORD_CLIENT_ID        required
AWS_ACCESS_KEY_ID        required
AWS_SECRET_ACCESS_KEY    required
AWS_REGION               default us-east-1
UNLIMITED_GUILD_IDS      comma-separated guild ids; default empty
DEV_GUILD_ID             optional; register commands to this guild only
DATA_DIR                 default ./data  (sqlite file and clip cache)
IDLE_LEAVE_SECONDS       default 60
CACHE_MAX_MB             default 200
LOG_LEVEL                default info
```

`.env.example` is committed; `.env` is gitignored. The AWS identity is a dedicated
IAM user limited to `polly:SynthesizeSpeech` and `polly:DescribeVoices`.

Logging is JSON lines on stdout. Secrets are never logged. Custom alert text is
logged at debug level only.

## 9. Testing

Test-driven throughout.

- **Pure unit tests (the bulk):** `VoiceEventRouter` and `AnnouncementPolicy`,
  table-driven. Includes a case for each v1 defect: move ordering, human member
  counting for ignore-empty, allow/deny precedence, override resolution, AFK
  handling.
- **Unit tests with fakes:** `TtsService` and `ClipCache` with a fake provider
  and a temp directory (hit, miss, in-flight dedupe, eviction, metering);
  `GuildAnnouncer` with fake connection and player (ordering, stale skip, cap,
  idle leave, drop recovery).
- **Integration:** `SettingsStore` against in-memory SQLite with real migrations;
  command handlers with mocked interactions.
- **Manual:** real Discord voice and real Polly, via a smoke checklist in the
  README. One opt-in Polly test runs only when an env flag is set.
- **CI:** GitHub Actions running lint, typecheck and tests.

## 10. Deployment

- Multi-stage Dockerfile on a slim Node LTS image, running as a non-root user.
- `docker-compose.yml` with one service, a `/data` volume, an env file and
  `restart: unless-stopped`.
- `npm run register` registers slash commands (globally, or to `DEV_GUILD_ID`).
- Backup is a copy of the SQLite file; the clip cache is disposable.
- README covers Discord application setup, intents, invite URL, IAM policy,
  environment variables and VPS quick start.

Expected footprint for v1: 1 vCPU, 1 GB RAM, a few GB of disk.

## 11. Repository changes

Nothing from v1 that v2 does not use may remain in the repository or the working
folder. Removal is the first implementation task, and the last task is an audit
that every tracked file belongs to v2.

Tracked files removed from branch `v2` (all remain reachable at tag `v1-legacy`):

- `src/` — all v1 JavaScript sources and `src/config.json`
- `build/config.gypi`
- `.babelrc`, `.eslint.json`, `Procfile`
- `package.json`, `package-lock.json` (recreated for v2)
- `docs/index.html`, `docs/css/`, `docs/assets/` — the v1 GitHub Pages site

Tracked files kept: `LICENSE` (unchanged), `README.md` and `.gitignore`
(both rewritten for v2), `docs/superpowers/` (specs and plans).

Untracked local leftovers deleted from the working folder (never in git):

- `lib/` — v1 Babel output
- `node_modules/` — v1 dependencies
- `announcord_0.2.zip` — old release archive
- `data/` — v1 Enmap SQLite settings. No migration was agreed, so this is
  deleted too; v2 creates a fresh `data/` at runtime.

Audit at the end of implementation: `git ls-files` lists only v2 sources, tests,
config, Docker files, CI workflow, `LICENSE`, `README.md`, `.gitignore`,
`.env.example` and `docs/superpowers/`. No Babel, Heroku, Elastic Beanstalk or
Enmap references remain anywhere in the tree.

The sibling folder `B:\Code\announcord-eb` is outside this repository. It holds
nothing unique and can be deleted by the owner; the implementation does not
touch it.

Proposed layout:

```
src/
  index.ts                 startup, wiring, shutdown
  config.ts                env schema
  logger.ts
  discord/
    client.ts
    voiceEventRouter.ts
    registerCommands.ts
  announce/
    policy.ts
    guildAnnouncer.ts
    announcerRegistry.ts
  tts/
    provider.ts            interface and types
    pollyProvider.ts
    clipCache.ts
    ttsService.ts
    usageMeter.ts
  settings/
    db.ts                  Kysely setup
    migrations/
    settingsStore.ts
    tiers.ts
  commands/
    announce/…
    announceAdmin/…
    validation.ts
test/
```

## 12. Later milestones

1. **Public-ready (separate spec):** Kokoro sidecar provider; `standard` tier with
   a monthly Polly character quota per guild and a global monthly budget cap,
   falling back to Kokoro; published Docker image for self-hosters.
2. **Possible:** premium tier via Discord app subscriptions, Postgres, sharding,
   per-user opt-out, sound-effect announcements.
