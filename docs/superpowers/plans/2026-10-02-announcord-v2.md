# Announcord v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead v1 bot with a TypeScript Discord bot that speaks join/leave announcements through Amazon Polly, configured by slash commands.

**Architecture:** One Node process. Pure logic (event routing, announcement policy, validation) is separated from I/O (Discord voice, Polly, SQLite) behind narrow interfaces so the logic is unit-tested without Discord or AWS. One `GuildAnnouncer` per guild owns the queue; a `VoiceTransport` adapter owns the real voice connection.

**Tech Stack:** Node 24, TypeScript 7 (ESM), discord.js 14.27, @discordjs/voice 0.19, @aws-sdk/client-polly 3, kysely 0.29 + better-sqlite3 13, zod 4, pino 10, vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-02-announcord-v2-design.md`

**Execution method:** Native (executing-plans), chosen by the owner's delegation. The owner waived plan review; this document is the record.

## Global Constraints

- Node `>=22.12.0` (floor set by `@discordjs/voice` 0.19.2 and vitest 5); developed on 24.15.
- ESM only (`"type": "module"`), TypeScript strict, relative imports with `.js` suffix.
- Gateway intents: `Guilds`, `GuildVoiceStates` only. No privileged intents.
- Configuration through environment variables only. No secrets in the repo.
- Text sent to Polly is plain text, never SSML.
- SQL stays Postgres-portable: no SQLite-only syntax in queries.
- Enter/exit text max 150 characters excluding `%name`; pronunciation max 50.
- Queue cap 10 per guild; stale after 15 s; idle leave default 60 s; Polly timeout 5 s with one retry.
- In v1 only guilds in `UNLIMITED_GUILD_IDS` get speech.
- Nothing from v1 remains in the tree (spec §11).
- Commits end with the `Co-Authored-By` trailer. Nothing is pushed.

## Deviations from the spec (decided while planning)

- `@discordjs/opus` is **not** installed. Polly returns Ogg/Opus, which `@discordjs/voice` demuxes and forwards without re-encoding, so no Opus encoder or ffmpeg is needed. This removes a native build from the Docker image.
- The clip cache key is `sha256(provider | engine | voice | text)` where `engine` comes from `provider.engineFor(voiceId)`.
- An exit announcement is never played into a channel with zero humans, even with ignore-empty off (nobody would hear it).
- Docker is not installed on the development machine, so the Dockerfile and compose file are written but not built here. Flagged in the README smoke checklist.

## Known risk

`@discordjs/voice` sends one Opus packet per 20 ms tick. If Polly's `ogg_opus` output uses a different frame duration, playback speed would be wrong. This cannot be checked without AWS credentials. Mitigation: the opt-in Polly test (`POLLY_LIVE_TEST=1`) asserts the first packet's frame duration is 20 ms. If it fails, the fallback is Polly `pcm` output re-encoded through `prism-media` with `opusscript`; the provider interface hides the change.

## Review Focus

1. A display name that sanitizes to nothing (emoji-only, symbols-only) → the announcement falls back to the next name source and finally to "Someone", never an empty string to Polly. *(Task 3)*
2. Names or pronunciations containing `$&`, `$1` or `%name` → inserted literally, no replacement-pattern expansion and no recursive substitution. *(Task 3)*
3. A stored voice id that the provider no longer offers → fall back to the guild voice, then to the built-in default, instead of failing every announcement. *(Task 5)*
4. A zero-byte or truncated cache file left by a crash → treated as a miss and overwritten. *(Task 5)*
5. The member leaves or the bot is disconnected while clips are still queued → the queue is cleared and the announcer recovers on the next event without a stuck "playing" state. *(Task 7)*

---

## File map

```
src/
  index.ts                       wiring, startup, shutdown
  config.ts                      env schema (zod)
  logger.ts                      pino instance
  domain.ts                      shared types and built-in defaults
  discord/
    voiceEventRouter.ts          raw change -> VoiceEvent | null (pure)
    voiceTransport.ts            @discordjs/voice adapter implementing VoiceTransport
    eventWiring.ts               gateway events -> router -> policy -> announcer
    registerCommands.ts          npm run register
  announce/
    policy.ts                    decideAnnouncements (pure)
    guildAnnouncer.ts            queue, idle timer
    announcerRegistry.ts         guildId -> GuildAnnouncer
  tts/
    provider.ts                  TtsProvider, Voice
    pollyProvider.ts
    clipCache.ts
    usageMeter.ts
    ttsService.ts
  settings/
    db.ts                        Kysely + better-sqlite3, schema types
    migrations.ts                inline migration list
    settingsStore.ts
    tiers.ts
  commands/
    definitions.ts               slash command builders
    validation.ts                sanitizers and limits (pure)
    announce.ts                  /announce logic
    announceAdmin.ts             /announce-admin logic
    dispatcher.ts                interaction -> logic -> ephemeral reply
test/                            mirrors src/
```

---

### Task 1: Clean slate and scaffold

**Files:** delete all v1 files listed in spec §11; create `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/config.ts`, `src/logger.ts`, `test/config.test.ts`.

**Produces:**
```ts
// config.ts
export interface Config {
  discordToken: string; discordClientId: string;
  awsRegion: string;
  unlimitedGuildIds: ReadonlySet<string>;
  devGuildId: string | undefined;
  dataDir: string; idleLeaveSeconds: number; cacheMaxMb: number; logLevel: string;
}
export function loadConfig(env: NodeJS.ProcessEnv): Config;   // throws ConfigError listing every bad variable
```
AWS keys are validated for presence only; the SDK reads them from the environment.

- [ ] `git rm -r` tracked v1 files; delete `lib/`, `node_modules/`, `announcord_0.2.zip`, `data/`.
- [ ] Write scaffold files; `npm install`.
- [ ] Failing tests for `loadConfig`: all valid; missing token lists the variable; `UNLIMITED_GUILD_IDS=" 1, 2 ,"` → `{1,2}`; non-numeric `IDLE_LEAVE_SECONDS` rejected; defaults applied.
- [ ] Implement; `npm test`, `npm run typecheck`, `npm run lint` pass.
- [ ] Commit `chore: remove v1 and scaffold v2 toolchain`.

### Task 2: Domain types and VoiceEventRouter

**Files:** `src/domain.ts`, `src/discord/voiceEventRouter.ts`, `test/discord/voiceEventRouter.test.ts`.

**Produces:**
```ts
// domain.ts
export type AnnounceStyle = 'join' | 'exit' | 'both';
export type ChannelRule = 'allow' | 'deny';
export interface GuildSettings { guildId: string; style: AnnounceStyle; ignoreEmpty: boolean; provider: string; voiceId: string; enterTemplate: string | null; exitTemplate: string | null; }
export interface MemberOverride { voiceId: string | null; enterTemplate: string | null; exitTemplate: string | null; pronunciation: string | null; }
export interface VoiceEvent { type: 'join' | 'exit' | 'move'; guildId: string; userId: string; names: string[]; fromChannelId: string | null; toChannelId: string | null; }
export interface Announcement { guildId: string; channelId: string; text: string; voiceId: string; kind: 'enter' | 'exit'; }
export const DEFAULTS = { style: 'both', ignoreEmpty: true, provider: 'polly', voiceId: 'Matthew', enterTemplate: '%name has entered the channel', exitTemplate: '%name has left the channel' } as const;

// voiceEventRouter.ts
export interface RawVoiceChange { guildId: string; userId: string; isBot: boolean; names: string[]; oldChannelId: string | null; newChannelId: string | null; afkChannelId: string | null; }
export function routeVoiceChange(raw: RawVoiceChange): VoiceEvent | null;
```
`names` is ordered: nickname, global display name, username (missing ones omitted).

- [ ] Failing table tests: join; exit; move; same channel (mute) → null; bot → null; into AFK from channel → exit; out of AFK into channel → join; AFK → nothing (join AFK from nowhere) → null; AFK → leave → null.
- [ ] Implement, pass, commit `feat: voice event router`.

### Task 3: Validation and AnnouncementPolicy

**Files:** `src/commands/validation.ts`, `src/announce/policy.ts`, tests for both.

**Produces:**
```ts
// validation.ts
export const MAX_TEMPLATE = 150; export const MAX_PRONUNCIATION = 50;
export function sanitizeSpoken(text: string): string;            // strips < > &, mentions, custom emoji, control chars; collapses whitespace
export type Validated = { ok: true; value: string } | { ok: false; error: string };
export function validateTemplate(input: string): Validated;
export function validatePronunciation(input: string): Validated;

// policy.ts
export interface PolicyInput { event: VoiceEvent; settings: GuildSettings; override: MemberOverride | null; rules: ReadonlyMap<string, ChannelRule>; otherHumansIn(channelId: string): number; botChannelId: string | null; }
export function decideAnnouncements(input: PolicyInput): Announcement[];
export function renderText(template: string, name: string): string;
export function resolveName(names: string[], pronunciation: string | null): string;
```

- [ ] Failing tests, validation: length counted without `%name`; empty rejected; `<@123>`, `<:e:1>`, `<b>` stripped; whitespace collapsed.
- [ ] Failing tests, policy: style join/exit/both; ignore-empty on with 0 and 1 other humans; ignore-empty off join into empty channel announces; exit from now-empty channel never announces; deny rule; allow rule excludes others; allow beats deny on the same guild; move → two announcements, join first by default, exit first when bot is in the old channel; move where one side is denied → one; override template/voice/pronunciation precedence; every `%name` replaced; **Review Focus 1** emoji-only nickname falls through to username, all-empty → "Someone"; **Review Focus 2** name `$&` and pronunciation `%name` inserted literally.
- [ ] Implement, pass, commit `feat: announcement policy and input validation`.

### Task 4: Database, migrations, SettingsStore, tiers

**Files:** `src/settings/db.ts`, `migrations.ts`, `settingsStore.ts`, `tiers.ts`, tests.

**Produces:**
```ts
export function openDatabase(file: string): Kysely<Schema>;       // ':memory:' for tests; enables foreign keys
export async function migrate(db: Kysely<Schema>): Promise<void>;
export type OverrideField = 'voiceId' | 'enterTemplate' | 'exitTemplate' | 'pronunciation';
export class SettingsStore {
  constructor(db: Kysely<Schema>);
  getGuild(guildId: string): Promise<GuildSettings>;              // creates row with defaults
  updateGuild(guildId: string, patch: Partial<Omit<GuildSettings, 'guildId'>>): Promise<GuildSettings>;
  deleteGuild(guildId: string): Promise<void>;                    // cascades overrides and rules; used for reset and guild removal
  getOverride(guildId: string, userId: string): Promise<MemberOverride | null>;
  setOverrideField(guildId: string, userId: string, field: OverrideField, value: string | null, updatedBy: string): Promise<void>;
  clearOverride(guildId: string, userId: string): Promise<boolean>;
  getRules(guildId: string): Promise<ReadonlyMap<string, ChannelRule>>;
  setRule(guildId: string, channelId: string, rule: ChannelRule): Promise<void>;
  removeRule(guildId: string, channelId: string): Promise<boolean>;
}
export type Tier = 'unlimited' | 'standard';
export function tierOf(guildId: string, unlimited: ReadonlySet<string>): Tier;
```

- [ ] Failing tests on in-memory SQLite: defaults on first read; update persists and is visible through cache; override set/clear; row removed when all fields null; rules set/replace/remove; `deleteGuild` cascades but `usage` rows survive; migrate twice is a no-op; a second store on the same db sees writes.
- [ ] Implement, pass, commit `feat: settings store on kysely/sqlite`.

### Task 5: TTS provider interface, ClipCache, UsageMeter, TtsService

**Files:** `src/tts/provider.ts`, `clipCache.ts`, `usageMeter.ts`, `ttsService.ts`, tests.

**Produces:**
```ts
export interface Voice { id: string; name: string; languageCode: string; languageName: string; }
export interface TtsProvider { readonly id: string; listVoices(): Promise<Voice[]>; engineFor(voiceId: string): Promise<string>; synthesize(text: string, voiceId: string): Promise<Buffer>; }

export class ClipCache { constructor(dir: string, maxBytes: number); init(): Promise<void>; getOrCreate(key: string, create: () => Promise<Buffer>): Promise<{ clip: Buffer; hit: boolean }>; }
export function clipKey(provider: string, engine: string, voice: string, text: string): string;

export class UsageMeter { constructor(db: Kysely<Schema>, now?: () => Date); add(guildId: string, provider: string, chars: number): Promise<void>; get(guildId: string): Promise<number>; }

export class TtsDisabledError extends Error {}
export class TtsService {
  constructor(deps: { provider: TtsProvider; cache: ClipCache; meter: UsageMeter; unlimited: ReadonlySet<string>; timeoutMs?: number; });
  voices(): Promise<Voice[]>;
  findVoice(idOrName: string): Promise<Voice | null>;             // case-insensitive
  getClip(guildId: string, text: string, voiceId: string, fallbackVoiceId: string): Promise<Buffer>;
}
```

- [ ] Failing tests, cache: miss then hit; two concurrent identical requests call `create` once; eviction removes least recently used when over cap; failed `create` caches nothing and the next call retries; **Review Focus 4** zero-byte file is a miss and gets overwritten.
- [ ] Failing tests, meter: accumulates per guild/month/provider; month rollover starts at 0.
- [ ] Failing tests, service: hit does not meter; miss meters `text.length`; non-allowlisted guild throws `TtsDisabledError` without calling the provider; first failure retried once; timeout rejects; **Review Focus 3** unknown voice falls back to `fallbackVoiceId`, then `DEFAULTS.voiceId`.
- [ ] Implement, pass, commit `feat: tts service with clip cache and usage metering`.

### Task 6: PollyProvider

**Files:** `src/tts/pollyProvider.ts`, `test/tts/pollyProvider.test.ts`, `test/tts/polly.live.test.ts`.

**Produces:** `export class PollyProvider implements TtsProvider { constructor(client: Pick<PollyClient, 'send'>); }` — `id = 'polly'`; voices cached 24 h; engine `neural` when the voice lists it, else `standard`; `OutputFormat: 'ogg_opus'`, `TextType: 'text'`.

- [ ] Failing tests with a stub client: paginated `DescribeVoices` merged; neural preferred; standard-only voice uses standard; synth command carries the right parameters; empty `AudioStream` throws.
- [ ] Live test, skipped unless `POLLY_LIVE_TEST=1`: synthesizes "test", asserts an `OggS` header and a 20 ms first frame.
- [ ] Implement, pass, commit `feat: polly provider`.

### Task 7: GuildAnnouncer and registry

**Files:** `src/announce/guildAnnouncer.ts`, `announcerRegistry.ts`, tests.

**Produces:**
```ts
export interface VoiceTransport {
  currentChannelId(): string | null;
  play(channelId: string, clip: Buffer): Promise<void>;   // joins or moves as needed; resolves when playback ends; rejects on failure
  leave(): void;
}
export class GuildAnnouncer {
  constructor(deps: { transport: VoiceTransport; getClip(a: Announcement): Promise<Buffer>; idleMs: number; maxQueue?: number; staleMs?: number; now?: () => number; log: Logger; });
  enqueue(a: Announcement): void;
  reset(): void;      // clear queue, cancel idle timer; used on disconnect
  shutdown(): void;   // reset + transport.leave()
}
export class AnnouncerRegistry { constructor(make: (guildId: string) => GuildAnnouncer); get(guildId: string): GuildAnnouncer; delete(guildId: string): void; shutdownAll(): void; }
```

- [ ] Failing tests with a fake transport and fake timers: plays in order even when the second clip resolves first; clip failure skips that item and continues; transport failure skips and continues; 11th item drops the oldest unplayed; item older than 15 s is skipped; idle timer leaves after `idleMs` and is cancelled by a new enqueue; **Review Focus 5** `reset()` during playback clears the queue and a later enqueue plays normally.
- [ ] Implement, pass, commit `feat: per-guild announcement queue`.

### Task 8: Discord voice transport and event wiring

**Files:** `src/discord/voiceTransport.ts`, `src/discord/eventWiring.ts`, `test/discord/eventWiring.test.ts`.

**Produces:**
```ts
export class DiscordVoiceTransport implements VoiceTransport { constructor(guild: Guild, log: Logger, onDisconnected: () => void); }
export function toRawVoiceChange(oldState: VoiceState, newState: VoiceState): RawVoiceChange | null;
export function wireEvents(client: Client, deps: { store: SettingsStore; registry: AnnouncerRegistry; log: Logger }): void;
```
Transport: `joinVoiceChannel` with `selfDeaf: true`; wait `Ready` up to 10 s; `createAudioResource(Readable.from(clip), { inputType: StreamType.OggOpus })`; resolve on `AudioPlayerStatus.Idle`, reject on player `error`; on `Disconnected`, race `Signalling`/`Connecting` for 5 s, otherwise destroy and call `onDisconnected`. Before joining, check `ViewChannel`, `Connect`, `Speak` and the user limit; reject with a typed `CannotJoinError` that the wiring logs once per channel.

- [ ] Failing tests for `toRawVoiceChange` with plain-object fakes (name order, bot flag, AFK id) and for the handler path: event → policy → `registry.get().enqueue` called with the expected announcements; bot's own disconnect → `reset()`; `guildDelete` → `store.deleteGuild` and `registry.delete`.
- [ ] Implement, pass, commit `feat: discord voice transport and event wiring`.

The transport itself is exercised by the manual smoke checklist, not unit tests.

### Task 9: Slash command definitions and registration

**Files:** `src/commands/definitions.ts`, `src/discord/registerCommands.ts`, `test/commands/definitions.test.ts`.

**Produces:** `export const commandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[]` — `/announce` (no default permission) and `/announce-admin` (`ManageGuild`, guild-only) exactly as spec §6.

- [ ] Failing tests: two commands; admin has `default_member_permissions` = ManageGuild; every spec subcommand present; `voice` options have autocomplete; channel options restricted to voice channel types; both commands guild-only.
- [ ] Implement; `npm run register` script uses `DEV_GUILD_ID` when set, else global.
- [ ] Commit `feat: slash command definitions and register script`.

### Task 10: `/announce` logic

**Files:** `src/commands/announce.ts`, test.

**Produces:**
```ts
export interface CommandDeps { store: SettingsStore; tts: TtsService; meter: UsageMeter; unlimited: ReadonlySet<string>; }
export interface Caller { guildId: string; userId: string; names: string[]; voiceChannelId: string | null; }
export type AnnounceRequest =
  | { sub: 'voice'; voice: string } | { sub: 'enter' | 'exit' | 'pronounce'; text: string }
  | { sub: 'clear'; field: OverrideField | 'all' } | { sub: 'show' } | { sub: 'preview' } | { sub: 'voices'; language?: string };
export interface CommandResult { reply: string; speak?: Announcement; }
export function runAnnounce(req: AnnounceRequest, caller: Caller, deps: CommandDeps): Promise<CommandResult>;
```

- [ ] Failing tests: each subcommand's happy path writes the store and returns the expected reply; invalid voice, over-long text, empty text rejected with a message and no write; `clear all`; `show` reflects overrides and the resolved spoken text; `preview` returns `speak` only when the caller is in voice and the guild is unlimited; `voices` filters by language code or name and stays under 2000 characters.
- [ ] Implement, pass, commit `feat: /announce command`.

### Task 11: `/announce-admin` logic and dispatcher

**Files:** `src/commands/announceAdmin.ts`, `src/commands/dispatcher.ts`, tests.

**Produces:**
```ts
export type AdminRequest =
  | { sub: 'style'; style: AnnounceStyle } | { sub: 'ignore-empty'; on: boolean } | { sub: 'voice'; voice: string }
  | { sub: 'template'; kind: 'enter' | 'exit'; text: string }
  | { sub: 'channel'; action: 'allow' | 'deny' | 'unlist'; channelId: string; channelName: string }
  | { sub: 'user-set'; targetId: string; targetName: string; field: OverrideField; value: string }
  | { sub: 'user-clear'; targetId: string; targetName: string; field: OverrideField | 'all' }
  | { sub: 'settings'; channelName(id: string): string; warnings: string[] } | { sub: 'reset' };
export function runAnnounceAdmin(req: AdminRequest, caller: Caller, deps: CommandDeps): Promise<CommandResult>;
export function handleInteraction(interaction: Interaction, deps: DispatcherDeps): Promise<void>;
```
Dispatcher: maps the interaction to a request, re-checks `ManageGuild` for admin commands, replies ephemerally, answers autocomplete from `tts.voices()` (max 25), shows a confirm button for `reset`, and wraps everything in a try/catch that replies with a generic error and logs a correlation id.

- [ ] Failing tests for every admin subcommand, including: `user-set` records `updatedBy` as the admin; `settings` shows tier, usage, rules and warnings; `reset` removes overrides and rules; validation failures write nothing.
- [ ] Dispatcher tests with fake interactions: non-admin calling an admin command is refused; a thrown error produces an ephemeral generic reply; autocomplete returns at most 25 matches.
- [ ] Implement, pass, commit `feat: /announce-admin command and interaction dispatcher`.

### Task 12: Startup wiring and shutdown

**Files:** `src/index.ts`.

- [ ] Load config → logger → open DB, migrate → cache init → Polly provider (fail fast if `DescribeVoices` is rejected) → services → client with the two intents → wire events and interactions → login.
- [ ] `SIGINT`/`SIGTERM`: `registry.shutdownAll()`, `client.destroy()`, `db.destroy()`, exit 0. `unhandledRejection`: log, stay up. Startup failure: log, exit 1.
- [ ] `npm run build` succeeds; `node dist/index.js` with an empty environment exits 1 listing the missing variables.
- [ ] Commit `feat: startup wiring and graceful shutdown`.

### Task 13: Docker, CI, README, final audit

**Files:** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.github/workflows/ci.yml`, `README.md`.

- [ ] Multi-stage Dockerfile (`node:24-slim`, build stage with dev deps, runtime stage with `npm ci --omit=dev`, `USER node`, `VOLUME /data`).
- [ ] Compose: one service, `env_file: .env`, `DATA_DIR=/data`, named volume, `restart: unless-stopped`.
- [ ] CI: Node 24, `npm ci`, lint, typecheck, test.
- [ ] README: what it does, Discord application setup, intents, invite URL with permissions, IAM policy JSON, environment table, local run, Docker run, command reference, backup, manual smoke checklist, milestone 2 note.
- [ ] Audit: `git ls-files` contains only v2 files; search the tree for `babel`, `heroku`, `Procfile`, `elasticbeanstalk`, `enmap` returns nothing outside `docs/superpowers/`.
- [ ] Full `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `chore: docker, ci and readme`.

---

## Self-review

- **Spec coverage:** §3 stack → T1; §4 units → T2 (router), T3 (policy), T4 (store, tiers), T5 (service, cache, meter), T6 (Polly), T7 (announcer), T8 (transport, wiring), T10–11 (commands); §5 schema → T4; §6 commands and validation → T3, T9–11; §7 errors → T5 (retry/timeout), T7 (cap/stale/skip), T8 (permissions, drops), T11 (command errors), T12 (startup/shutdown); §8 config → T1; §9 testing → every task plus T6 live test; §10 deploy → T13; §11 cleanup → T1 and T13 audit.
- **Placeholders:** none.
- **Types:** `VoiceEvent.names` (array) is used consistently by router, policy and commands; `OverrideField` is shared by the store and both command modules; `VoiceTransport` is defined in T7 and implemented in T8.
- **Review Focus:** each of the five items is pinned to a named test in T3, T5 or T7.

---

## Outcome (recorded after implementation)

All 13 tasks completed on branch `v2`. 200 automated tests pass; lint, typecheck and build are clean. Not verified: real Discord voice playback, real Polly synthesis, and the Docker build (no Docker or credentials on the development machine). See the manual smoke checklist in the README.

### Decisions made during implementation

1. **TypeScript ~6.0, not 7.** typescript-eslint 8.71 supports `<6.1`.
2. **Premium-only Polly voices are hidden.** Voices offering neither the neural nor the standard engine (long-form or generative only) cost 2–6x more and are left out of the voice list.
3. **A bot moved by a user is not treated as a dropped connection** (spec §7 said it is). The voice library recovers in the new channel and the next announcement moves it where needed.
4. **`guildDelete` during a Discord outage keeps settings.** Settings are deleted only when the guild is still available, meaning the bot was really removed.
5. **Stage channels are refused.** Only ordinary voice channels are joined.
6. **`SkipAnnouncement` error class** lets the transport warn once per unusable channel without the queue warning again each time.
7. **Command requests use the slash-command field names** (`voice`, `enter`, `exit`, `pronounce`); shared validate-and-store code lives in `src/commands/shared.ts`.
8. **No Manage Server re-check inside the bot** (spec §6 said there is one). The same section promises that owners can remap access to `/announce-admin` in Discord's Integrations settings; a hard re-check would break that. Discord enforces command permissions itself.
9. **Reset confirmation buttons are bound to the member who asked.**
10. **`GuildAnnouncer.getClip` closes over the settings store** to pass the guild voice as the fallback for a retired member voice.

### Found in final review and fixed

- Listeners are counted from guild voice states, not `channel.members`: discord.js omits people whose member data is not cached, which is everyone already in voice after a restart.
- The voice transport waits for the bot's own voice state to show the target channel before playing; the library keeps a moved connection at `Ready` throughout the move.
- Replies are capped at Discord's 2000-character limit.

The final review was a self-review by the implementer, not an independent one.
