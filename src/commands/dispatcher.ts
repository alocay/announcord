import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
} from 'discord.js';
import type { AnnouncerRegistry } from '../announce/announcerRegistry.js';
import type { AnnounceStyle } from '../domain.js';
import type { Logger } from '../logger.js';
import type { Voice } from '../tts/provider.js';
import { runAnnounce, type AnnounceRequest } from './announce.js';
import { runAnnounceAdmin, type AdminRequest } from './announceAdmin.js';
import type { Caller, CommandDeps, CommandResult, FieldChoice } from './shared.js';

export interface DispatcherDeps extends CommandDeps {
  registry: AnnouncerRegistry;
  /** Voice channels the bot cannot speak in, as human-readable lines. */
  joinWarnings(guild: Guild): string[];
  log: Logger;
}

const MAX_AUTOCOMPLETE_CHOICES = 25;
const RESET_PREFIX = 'announce-reset';

// Replies quote text that members typed; never let that ping anyone.
const NO_MENTIONS = { parse: [] };

const MAX_MESSAGE_LENGTH = 2000;

/** Discord rejects longer messages outright, which would lose the whole reply. */
function fitMessage(text: string): string {
  const notice = '\n… (shortened)';
  return text.length <= MAX_MESSAGE_LENGTH
    ? text
    : text.slice(0, MAX_MESSAGE_LENGTH - notice.length) + notice;
}

function callerOf(member: GuildMember, guildId: string): Caller {
  return {
    guildId,
    userId: member.id,
    names: [member.nickname, member.user.globalName, member.user.username].filter(
      (name): name is string => Boolean(name),
    ),
    voiceChannelId: member.voice.channelId,
  };
}

function announceRequest(interaction: ChatInputCommandInteraction<'cached'>): AnnounceRequest {
  const { options } = interaction;
  const sub = options.getSubcommand();
  switch (sub) {
    case 'voice':
      return { sub, voice: options.getString('voice', true) };
    case 'enter':
    case 'exit':
    case 'pronounce':
      return { sub, text: options.getString('text', true) };
    case 'clear':
      return { sub, field: options.getString('field', true) as FieldChoice | 'all' };
    case 'voices':
      return { sub, language: options.getString('language') ?? undefined };
    case 'show':
    case 'preview':
      return { sub };
    default:
      throw new Error(`Unknown /announce subcommand: ${sub}`);
  }
}

function adminRequest(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DispatcherDeps,
): AdminRequest {
  const { options, guild } = interaction;
  const group = options.getSubcommandGroup();
  const sub = options.getSubcommand();

  if (group === 'channel') {
    const channel = options.getChannel('channel', true);
    return {
      sub: 'channel',
      action: sub as 'allow' | 'deny' | 'unlist',
      channelId: channel.id,
      channelName: channel.name,
    };
  }

  if (group === 'user') {
    const user = options.getUser('member', true);
    const target = {
      targetId: user.id,
      targetName: options.getMember('member')?.displayName ?? user.username,
    };
    return sub === 'set'
      ? {
          sub: 'user-set',
          ...target,
          field: options.getString('field', true) as FieldChoice,
          value: options.getString('value', true),
        }
      : {
          sub: 'user-clear',
          ...target,
          field: options.getString('field', true) as FieldChoice | 'all',
        };
  }

  switch (sub) {
    case 'style':
      return { sub, style: options.getString('style', true) as AnnounceStyle };
    case 'ignore-empty':
      return { sub, enabled: options.getBoolean('enabled', true) };
    case 'voice':
      return { sub, voice: options.getString('voice', true) };
    case 'template':
      return {
        sub,
        kind: options.getString('kind', true) as 'enter' | 'exit',
        text: options.getString('text', true),
      };
    case 'settings':
      return {
        sub,
        channelName: (id) => guild.channels.cache.get(id)?.name ?? id,
        warnings: deps.joinWarnings(guild),
      };
    default:
      throw new Error(`Unknown /announce-admin subcommand: ${sub}`);
  }
}

async function askResetConfirmation(interaction: ChatInputCommandInteraction): Promise<void> {
  // The owner's id is part of the button id so nobody else can press it.
  const owner = interaction.user.id;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RESET_PREFIX}:confirm:${owner}`)
      .setLabel('Reset everything')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${RESET_PREFIX}:cancel:${owner}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    content:
      'This restores the default settings and removes every personal setting and channel rule for this server. It cannot be undone.',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCommand(
  interaction: ChatInputCommandInteraction<'cached'>,
  deps: DispatcherDeps,
): Promise<void> {
  const caller = callerOf(interaction.member, interaction.guildId);

  let result: CommandResult;
  if (interaction.commandName === 'announce') {
    result = await runAnnounce(announceRequest(interaction), caller, deps);
  } else if (interaction.commandName === 'announce-admin') {
    // Who may run this is decided by Discord: Manage Server by default, or
    // whatever the server owner set under Server Settings > Integrations.
    if (
      interaction.options.getSubcommandGroup() === null &&
      interaction.options.getSubcommand() === 'reset'
    ) {
      await askResetConfirmation(interaction);
      return;
    }
    result = await runAnnounceAdmin(adminRequest(interaction, deps), caller, deps);
  } else {
    return;
  }

  await interaction.reply({
    content: fitMessage(result.reply),
    flags: MessageFlags.Ephemeral,
    allowedMentions: NO_MENTIONS,
  });
  if (result.speak) deps.registry.get(caller.guildId).enqueue(result.speak);
}

async function handleResetButton(
  interaction: ButtonInteraction<'cached'>,
  deps: DispatcherDeps,
): Promise<void> {
  const [, action, owner] = interaction.customId.split(':');
  if (interaction.user.id !== owner) {
    await interaction.reply({
      content: 'That confirmation belongs to someone else.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action !== 'confirm') {
    await interaction.update({ content: 'Reset cancelled. Nothing was changed.', components: [] });
    return;
  }
  const caller = callerOf(interaction.member, interaction.guildId);
  const result = await runAnnounceAdmin({ sub: 'reset' }, caller, deps);
  await interaction.update({ content: result.reply, components: [] });
}

/** The voice the member is announced with now: their own choice, else the server's. */
async function currentVoiceId(
  interaction: AutocompleteInteraction,
  deps: DispatcherDeps,
): Promise<string | null> {
  if (!interaction.guildId) return null;
  const [settings, override] = await Promise.all([
    deps.store.getGuild(interaction.guildId),
    deps.store.getOverride(interaction.guildId, interaction.user.id),
  ]);
  return override?.voiceId ?? settings.voiceId;
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  deps: DispatcherDeps,
): Promise<void> {
  try {
    const typed = interaction.options.getFocused().trim().toLowerCase();
    const voices = await deps.tts.voices();

    // Discord shows at most 25 choices, far fewer than there are voices, so
    // put the likeliest first: names starting with what was typed, then
    // voices in the language the member is currently announced in.
    const current = await currentVoiceId(interaction, deps);
    const language = voices.find((v) => v.id === current)?.languageCode;
    const rank = (v: Voice) =>
      (v.id.toLowerCase().startsWith(typed) ? 0 : 2) + (v.languageCode === language ? 0 : 1);

    const matches = voices
      .filter(
        (v) =>
          v.id.toLowerCase().includes(typed) ||
          v.languageName.toLowerCase().includes(typed) ||
          v.languageCode.toLowerCase().startsWith(typed),
      )
      .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
      .slice(0, MAX_AUTOCOMPLETE_CHOICES);
    await interaction.respond(
      matches.map((v) => ({ name: `${v.id} — ${v.languageName}`, value: v.id })),
    );
  } catch (error) {
    deps.log.warn({ err: error }, 'voice autocomplete failed');
    await interaction.respond([]).catch(() => {});
  }
}

/** Entry point for every interaction Discord sends the bot. */
export async function handleInteraction(
  interaction: Interaction,
  deps: DispatcherDeps,
): Promise<void> {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction, deps);
    return;
  }

  try {
    if (!interaction.inCachedGuild()) return;
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, deps);
    } else if (interaction.isButton() && interaction.customId.startsWith(`${RESET_PREFIX}:`)) {
      await handleResetButton(interaction, deps);
    }
  } catch (error) {
    const ref = randomUUID().slice(0, 8);
    deps.log.error({ err: error, ref, guildId: interaction.guildId }, 'interaction failed');
    if (!interaction.isRepliable()) return;

    const message = {
      content: `Something went wrong (ref ${ref}). Please try again.`,
      flags: MessageFlags.Ephemeral,
    } as const;
    await (interaction.replied ? interaction.followUp(message) : interaction.reply(message)).catch(
      () => {},
    );
  }
}
